import type { Stats } from "@soulsilver/shared/combat";
import type { ClientMessage, ServerMessage } from "@soulsilver/shared/game";
import type { EvolutionRecord, LearnsetRecord, MachineRecord, SpeciesRecord } from "@soulsilver/shared/game-data";
import { addEvs, expForLevel, expGain, friendshipOnLevelUp, levelFor, levelUpItems, memberStats } from "@soulsilver/shared/progression";
import type { PartyMember, ProgressionItem, Save } from "@soulsilver/shared/save";
import { markCaught } from "@soulsilver/shared/wild";

// Pokémon progression (spec 016): experience and EVs on a KO, then levels, moves and evolutions
// queued and resolved one at a time, only out of combat (research R3–R6).

/** The parts of the extraction progression reads. */
export interface ExtractedForProgression {
  /** `abilities` only feeds the party screen (spec 017). */
  species: (Pick<SpeciesRecord, "id" | "baseStats" | "baseExperience" | "evYield" | "growthRate" | "baseFriendship"> & Partial<Pick<SpeciesRecord, "abilities">>)[];
  learnsets: (Pick<LearnsetRecord, "id" | "levelUp"> & Partial<Pick<LearnsetRecord, "machines">>)[];
  evolutions: Pick<EvolutionRecord, "id" | "evolutions">[];
  /** Spec 027: TMs and HMs; without them no machine teaches anything. */
  machines?: MachineRecord[] | undefined;
}

export interface ProgressionData {
  species(id: number): ExtractedForProgression["species"][number] | undefined;
  levelUp(species: number): LearnsetRecord["levelUp"];
  evolutions(species: number): EvolutionRecord["evolutions"];
  /** Spec 027: the machines (1–100) a species can learn from, and what each teaches. */
  machines(species: number): number[];
  machine(id: number): MachineRecord | undefined;
}

export function buildProgressionData(extracted: ExtractedForProgression): ProgressionData {
  const species = new Map(extracted.species.map((s) => [s.id, s]));
  const learnsets = new Map(extracted.learnsets.map((l) => [l.id, l.levelUp]));
  const evolutions = new Map(extracted.evolutions.map((e) => [e.id, e.evolutions]));
  const compatible = new Map(extracted.learnsets.map((l) => [l.id, l.machines ?? []]));
  const machines = new Map((extracted.machines ?? []).map((m) => [m.id, m]));
  return {
    species: (id) => species.get(id),
    levelUp: (id) => learnsets.get(id) ?? [],
    evolutions: (id) => evolutions.get(id) ?? [],
    machines: (id) => compatible.get(id) ?? [],
    machine: (id) => machines.get(id),
  };
}

/** A player as progression sees them; the progress fields are the player's own and change in place. */
export interface Learner {
  playerId: number;
  progress: Pick<Save, "party" | "pending" | "pokedex">;
  send(msg: ServerMessage): void;
}

export interface ProgressionOptions {
  data: ProgressionData;
  inCombat(playerId: number): boolean;
  /** Party index out in combat, if any. */
  active(playerId: number): number | undefined;
  /** Sends the party again after a level or a species changed. */
  refresh(playerId: number): void;
}

/** Spec 027: what an item used from the bag asks of progression. */
export type ItemGrowth = { kind: "level" } | { kind: "evolve"; item: number } | { kind: "learn"; machine: number };
/** TM01 is item 328 and machine 1; HM08 is item 427 and machine 100. */
const FIRST_MACHINE_ITEM = 328;
const USE_ITEM_METHODS = new Set(["use-item", "use-item-male", "use-item-female"]);

type Answer = Extract<ClientMessage, { type: "progression-ack" | "learn-answer" | "evolve-answer" }>;

interface State {
  learner: Learner;
  /** Party indexes that went out in the current combat. */
  fought: Set<number>;
  /** The head of the queue was sent and waits for its answer. */
  sent: boolean;
}

const diff = (a: Stats, b: Stats): Stats => Object.fromEntries(Object.keys(a).map((k) => [k, a[k as keyof Stats] - b[k as keyof Stats]])) as Stats;

export function createProgression(options: ProgressionOptions) {
  const { data } = options;
  const states = new Map<number, State>();
  /** Players who exchanged hits with each wild Pokémon. */
  const engaged = new Map<number, Set<number>>();

  const statsOf = (m: PartyMember, species = m.species, level = m.level) => {
    const s = data.species(species);
    return s ? memberStats(s.baseStats, { ...m, level }) : undefined;
  };

  /** Level the member reaches once its queued level-ups resolve. */
  const queuedLevel = (s: State, index: number) =>
    s.learner.progress.pending.reduce((level, i) => (i.kind === "level-up" && i.member === index ? Math.max(level, i.level) : level), s.learner.progress.party[index]!.level);

  /** Raises the max HP and the current HP by the same amount (an evolution or a level). */
  function regrow(m: PartyMember, before: Stats | undefined): void {
    const after = statsOf(m);
    if (before && after) m.hp = Math.max(0, Math.min(after.hp, m.hp + after.hp - before.hp));
  }

  function credit(s: State, index: number, gain: number, evYield: Stats): void {
    const m = s.learner.progress.party[index]!;
    m.evs = addEvs(m.evs, evYield);
    const rate = data.species(m.species)?.growthRate;
    if (!rate || m.level >= 100) return;
    m.experience = Math.min(m.experience + gain, expForLevel(rate, 100));
    s.learner.send({ type: "exp-gain", partyIndex: index, amount: gain });
    const from = queuedLevel(s, index);
    const to = levelFor(rate, m.experience);
    if (to <= from) return;
    // A cancelled or still pending evolution is offered again after the new levels.
    const pending = s.learner.progress.pending.filter((i) => !(i.kind === "evolve" && i.member === index));
    const items = levelUpItems({ member: index, from, to, moves: m.moves, learnset: data.levelUp(m.species), evolutions: data.evolutions(m.species) });
    s.learner.progress.pending = [...pending, ...items];
  }

  function head(s: State): ProgressionItem | undefined {
    const { party, pending } = s.learner.progress;
    // Moves learned in the meantime, or members that left the party, need no answer.
    while (pending[0] && (!party[pending[0].member] || (pending[0].kind === "learn" && party[pending[0].member]!.moves.includes(pending[0].move)))) pending.shift();
    return pending[0];
  }

  function send(s: State, item: ProgressionItem): void {
    const m = s.learner.progress.party[item.member]!;
    if (item.kind === "level-up") {
      const stats = statsOf(m, m.species, item.level);
      const before = statsOf(m, m.species, item.level - 1);
      s.learner.send({ type: "progression", item, ...(stats && before ? { stats, gains: diff(stats, before) } : {}) });
    } else if (item.kind === "learn") s.learner.send({ type: "progression", item, moves: [...m.moves] });
    else s.learner.send({ type: "progression", item });
    s.sent = true;
  }

  function resolve(s: State, item: ProgressionItem, answer: Answer): boolean {
    const { party, pending, pokedex } = s.learner.progress;
    const m = party[item.member]!;
    switch (item.kind) {
      case "level-up": {
        if (answer.type !== "progression-ack") return false;
        const before = statsOf(m);
        m.level = item.level;
        m.friendship = friendshipOnLevelUp(m.friendship);
        regrow(m, before);
        return true;
      }
      case "learn":
        if (m.moves.length < 4) {
          if (answer.type !== "progression-ack") return false;
          m.moves.push(item.move);
          return true;
        }
        if (answer.type !== "learn-answer") return false;
        if (answer.forget !== null) m.moves[answer.forget] = item.move;
        return true;
      case "evolve": {
        if (answer.type !== "evolve-answer") return false;
        if (!answer.accept || !data.species(item.into)) return true;
        const before = statsOf(m);
        // Spec 028.4: an evolution by trade holding an item uses that item up.
        const byHeld = data.evolutions(m.species).some((e) => e.method === "trade-item" && e.into === item.into && e.condition.kind === "item" && e.condition.item === m.held);
        if (byHeld) delete m.held;
        m.species = item.into;
        regrow(m, before);
        markCaught(pokedex, item.into);
        // The new species' moves at this level come right after.
        const learns = data
          .levelUp(item.into)
          .filter((l) => l.level === m.level && !m.moves.includes(l.move))
          .map((l): ProgressionItem => ({ kind: "learn", member: item.member, move: l.move }));
        pending.splice(1, 0, ...learns);
        return true;
      }
    }
  }

  return {
    join(learner: Learner): void {
      // Saves migrated from v3 hold medium-fast experience: keep it inside the level's range on the real curve.
      for (const m of learner.progress.party) {
        const rate = data.species(m.species)?.growthRate;
        if (!rate) continue;
        const ceiling = m.level >= 100 ? expForLevel(rate, 100) : expForLevel(rate, m.level + 1) - 1;
        m.experience = Math.min(Math.max(m.experience, expForLevel(rate, m.level)), ceiling);
      }
      states.set(learner.playerId, { learner, fought: new Set(), sent: false });
    },
    leave(playerId: number): void {
      states.delete(playerId);
      for (const players of engaged.values()) players.delete(playerId);
    },
    /** A hit between a player's Pokémon and a wild one. */
    engage(playerId: number, wildId: number): void {
      const players = engaged.get(wildId) ?? new Set<number>();
      players.add(playerId);
      engaged.set(wildId, players);
    },
    /** A wild Pokémon (or a trainer's, spec 022) fainted: every player who fought it shares its experience among their participants. */
    faint(wildId: number, species: number, level: number, trainer = false): void {
      const foe = data.species(species);
      const players = engaged.get(wildId);
      engaged.delete(wildId);
      if (!foe || !players) return;
      for (const id of players) {
        const s = states.get(id);
        if (!s) continue;
        const participants = [...s.fought].filter((i) => (s.learner.progress.party[i]?.hp ?? 0) > 0);
        if (participants.length === 0) continue;
        const gain = expGain({ baseExperience: foe.baseExperience, level, participants: participants.length, trainer });
        for (const i of participants) credit(s, i, gain, foe.evYield);
      }
    },
    /** Forgets a wild Pokémon that left without fainting (captured, despawned). */
    forget(wildId: number): void {
      engaged.delete(wildId);
    },
    /** Every tick: who is out in combat, and the next queued item for players out of combat. */
    step(): void {
      for (const s of states.values()) {
        const id = s.learner.playerId;
        if (options.inCombat(id)) {
          const active = options.active(id);
          if (active !== undefined) s.fought.add(active);
          continue;
        }
        s.fought.clear();
        if (s.sent) continue;
        const item = head(s);
        if (item) send(s, item);
      }
    },
    /** The player's reply to the head of the queue; ignored in combat or when it does not fit the item. */
    answer(playerId: number, answer: Answer): void {
      const s = states.get(playerId);
      if (!s || !s.sent || options.inCombat(playerId)) return;
      const item = s.learner.progress.pending[0];
      if (!item || !resolve(s, item, answer)) return;
      s.learner.progress.pending.shift();
      s.sent = false;
      options.refresh(playerId);
      const next = head(s);
      if (next) send(s, next);
    },
    /** The move a TM or HM item teaches; undefined for any other item. */
    machineMove: (item: number) => data.machine(item - FIRST_MACHINE_ITEM + 1)?.move,
    /**
     * Spec 027: a Rare Candy, an evolution stone or a machine used on party member `index`; it queues the same
     * items a level or an evolution would. False, with nothing queued, when it does nothing for that Pokémon.
     */
    /** Spec 028.4: party member `index` just arrived by trade; its trade evolution, if the data has one it meets, is queued. */
    traded(playerId: number, index: number): void {
      const s = states.get(playerId);
      const m = s?.learner.progress.party[index];
      if (!s || !m) return;
      const to = data.evolutions(m.species).find((e) => e.method === "trade" || (e.method === "trade-item" && e.condition.kind === "item" && e.condition.item === m.held));
      if (to) s.learner.progress.pending.push({ kind: "evolve", member: index, into: to.into });
    },
    useItem(playerId: number, index: number, use: ItemGrowth): boolean {
      const s = states.get(playerId);
      const m = s?.learner.progress.party[index];
      if (!s || !m) return false;
      const { pending } = s.learner.progress;
      if (use.kind === "level") {
        const rate = data.species(m.species)?.growthRate;
        const from = queuedLevel(s, index);
        if (!rate || from >= 100) return false;
        m.experience = Math.max(m.experience, expForLevel(rate, from + 1));
        const rest = pending.filter((i) => !(i.kind === "evolve" && i.member === index));
        s.learner.progress.pending = [...rest, ...levelUpItems({ member: index, from, to: from + 1, moves: m.moves, learnset: data.levelUp(m.species), evolutions: data.evolutions(m.species) })];
        return true;
      }
      if (use.kind === "evolve") {
        // The gendered stones (Dawn Stone) count for either sex until the party has a gender (shortcut: no gender in the save yet).
        const to = data.evolutions(m.species).find((e) => USE_ITEM_METHODS.has(e.method) && e.condition.kind === "item" && e.condition.item === use.item);
        if (!to) return false;
        pending.push({ kind: "evolve", member: index, into: to.into });
        return true;
      }
      const move = data.machine(use.machine)?.move;
      if (move === undefined || m.moves.includes(move) || !data.machines(m.species).includes(use.machine)) return false;
      pending.push({ kind: "learn", member: index, move });
      return true;
    },
    /** True while the player still has decisions waiting: no new combat until they are done. */
    busy: (playerId: number) => (states.get(playerId)?.learner.progress.pending.length ?? 0) > 0,
  };
}

export type Progression = ReturnType<typeof createProgression>;
