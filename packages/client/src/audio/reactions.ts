import { desiredMusic, type Listener, moveSound } from "@soulsilver/shared/audio";
import type { TrainerMusic } from "@soulsilver/shared/events";
import type { Entity, HitEvent, WorldLookup } from "@soulsilver/shared/game";
import type { MapHeader } from "@soulsilver/shared/maps";
import movesJson from "../../../../content/combat/moves.json";
import type { CompanionEvent } from "../net/game-connection";
import { SHAKE_MS } from "../render/game-renderer";
import { audio } from "./engine";
import { cues, index } from "./loader";

// The game's messages as sounds (spec 018, contracts/game-protocol-v10.md). Only the client plays
// sound; nothing here talks to the server.

const archetypeOf = new Map(movesJson.records.map((r) => [r.id, r.archetype]));
const effectNames = () => [...Object.keys(cues?.effects ?? {}), ...Object.values(cues?.archetypes ?? {}), ...(cues ? [cues.defaultMove] : [])];

export interface AudioReactionsOptions {
  /** Owner string of this player's Pokémon and balls. */
  playerId: () => number | undefined;
  header: (area: string) => Promise<MapHeader | undefined>;
  /** Night on the session's clock (spec 026), not the PC's: every player hears the same. */
  night: () => boolean;
  world: WorldLookup;
}

export function createAudioReactions(options: AudioReactionsOptions) {
  const themes = (async () => {
    const i = await index;
    const id = (name: string | undefined) => (name && i?.byName.get(name)?.id) || 0;
    const m = cues?.music;
    return {
      title: id(m?.title),
      wildBattle: id(m?.wildBattle),
      victory: id(m?.victory),
      trainerBattle: id(m?.trainerBattle),
      rivalBattle: id(m?.rivalBattle),
      leaderBattle: id(m?.leaderBattle),
      rocketBattle: id(m?.rocketBattle),
      championBattle: id(m?.championBattle),
      trainerVictory: id(m?.trainerVictory),
      leaderVictory: id(m?.leaderVictory),
      bicycle: id(m?.bicycle),
    };
  })();
  let hasTrack = (_name: string) => false;
  void index.then((i) => (hasTrack = (n) => i?.byName.has(n) ?? false));
  void audio.preload(effectNames());
  void themes.then((t) => audio.preload([t.wildBattle, t.victory]));

  let area: string | undefined;
  let header: MapHeader | undefined;
  let night = false;
  let inCombat = false;
  /** An opponent fell during this combat (exp-gain): its end is a victory. */
  let won = false;
  /** From the end of a won combat until the fanfare ends. */
  let victory = false;
  /** The class music of this player's trainer battle (spec 022), until its fanfare ends. */
  let trainer: TrainerMusic | undefined;
  /** What a script plays until ResetBGM or the next map (spec 024). */
  let scriptMusic: number | null | undefined;
  /** On the bicycle (spec 025). */
  let bike = false;
  /** Last seen data per entity: hp for faints, `used` for moves, `alert` for wild cries. */
  const seen = new Map<number, { hp: number; used: number; alert: boolean }>();

  async function updateMusic(): Promise<void> {
    const t = await themes;
    const state = { screen: "game" as const, musicDay: header?.musicDay ?? 0, musicNight: header?.musicNight ?? 0, night, inCombat, victory, trainer, scriptMusic, bike };
    const onEnded = () => {
      victory = false;
      trainer = undefined;
      void updateMusic();
    };
    void audio.setMusic(desiredMusic(state, t), victory ? { once: true, onEnded } : {});
  }

  return {
    /** A script's music; undefined gives the map's music back. */
    scriptMusic(id: number | null | undefined): void {
      scriptMusic = id;
      if (id) void audio.preload([id]);
      void updateMusic();
    },
    /** shortcut: a stop ends with its script, as nothing asks for the music back after the healing fanfare (229:35); a scene that wants silence past its end loses it, keep the stop when one appears. */
    scriptEnded(): void {
      if (scriptMusic === null) this.scriptMusic(undefined);
    },
    frame(view: { self: Entity | undefined; others: Entity[] }, events: HitEvent[], combat: boolean, listener: Listener): void {
      audio.setListener(listener);
      const all = view.self ? [view.self, ...view.others] : view.others;
      const byId = new Map(all.map((e) => [e.id, e]));
      const me = options.playerId();
      const sourceOf = (e: Entity | undefined) => (e && (e.id === view.self?.id || (me !== undefined && e.data["owner"] === String(me))) ? "own" : "other");

      const self = view.self;
      if (self && self.area !== area) {
        const from = area;
        area = self.area;
        // Walking onto a neighbor map is silent; anything else is a warp, with a door sound indoors.
        const walked = from !== undefined && options.world(from)?.neighbors.some((n) => n.map === self.area);
        void options.header(self.area).then((h) => {
          if (from !== undefined && !walked) void audio.play(h?.areaType === "indoor" || header?.areaType === "indoor" ? "door" : "warp", { source: "ui", kind: "effect" });
          header = h;
          night = options.night();
          victory = false;
          scriptMusic = undefined;
          void audio.preload([h?.musicDay ?? 0, h?.musicNight ?? 0].filter((n) => n > 0));
          void updateMusic();
        });
      }

      if (combat !== inCombat) {
        victory = !combat && won;
        won = false;
        inCombat = combat;
        void updateMusic();
      }

      for (const e of all) {
        const hp = Number(e.data["hp"] ?? -1);
        const used = Number(e.data["used"] ?? 0);
        const alert = e.data["alert"] === true;
        const species = Number(e.data["species"] ?? 0);
        const before = seen.get(e.id);
        const at = { source: sourceOf(e), x: e.x, y: e.y } as const;
        if (!before) {
          if (e.data["ball"] !== undefined) void audio.play("ball-throw", { ...at, kind: "effect" });
          if (species > 0) void audio.preloadCry(species);
          // A player's combatant appears: it was just sent out.
          if (hp > 0 && e.data["owner"] !== "wild") void audio.cry(species, { ...at, kind: "cry" });
        } else {
          if (before.hp > 0 && hp === 0) {
            void audio.play("faint", { ...at, kind: "effect" });
            void audio.cry(species, { ...at, kind: "cry", rate: cues?.mix.faintCryRate ?? 0.85 });
          }
          if (used > before.used && cues) {
            const move = Number(e.data["usedMove"] ?? 0);
            void audio.play(moveSound(cues, hasTrack, move, archetypeOf.get(move) ?? ""), { ...at, kind: "effect" });
          }
          if (alert && !before.alert) void audio.cry(species, { ...at, kind: "cry" });
        }
        seen.set(e.id, { hp, used, alert });
      }
      for (const id of seen.keys()) if (!byId.has(id)) seen.delete(id);

      for (const ev of events) {
        if (ev.kind !== "hit") continue;
        const target = byId.get(ev.target);
        const source = sourceOf(byId.get(ev.attacker)) === "own" || sourceOf(target) === "own" ? "own" : "other";
        void audio.play(ev.effectiveness > 1 ? "hit-super" : ev.effectiveness < 1 ? "hit-weak" : "hit", { source, kind: "effect", x: target?.x ?? listener.x, y: target?.y ?? listener.y });
      }
    },

    companion(ev: CompanionEvent): void {
      if (ev.type === "exp-gain" && inCombat) won = true;
      else if (ev.type === "player-mode" && (ev.mode === "bike") !== bike) {
        bike = ev.mode === "bike";
        void updateMusic();
      }
      else if (ev.type === "trainerBattleStart" && ev.player === options.playerId()) {
        trainer = ev.music;
        void updateMusic();
      } else if (ev.type === "trainerBattleEnd" && ev.prize !== undefined) {
        won = true;
        // The fight may have ended in an earlier frame than this message.
        if (!inCombat) {
          won = false;
          victory = true;
          void updateMusic();
        }
      }
      else if (ev.type === "trainerBattleEnd" && ev.result !== "won" && !victory) trainer = undefined;
      else if (ev.type === "progression" && ev.item.kind !== "learn") void audio.play(ev.item.kind === "evolve" ? "evolution" : "level-up", { source: "ui", kind: "effect" });
      else if (ev.type === "capture") {
        // The capture lines and the renderer's shakes keep this rhythm.
        const source = ev.player === options.playerId() ? "own" : "other";
        for (let i = 1; i <= ev.shakes; i++) setTimeout(() => void audio.play("ball-shake", { source, kind: "effect" }), i * SHAKE_MS);
        setTimeout(() => void audio.play(ev.caught ? "ball-catch" : "ball-escape", { source, kind: "effect" }), (ev.shakes + 1) * SHAKE_MS);
      }
    },
  };
}

/** The title screen's music. */
export async function playTitleMusic(): Promise<void> {
  const i = await index;
  void audio.setMusic((cues && i?.byName.get(cues.music.title)?.id) || null);
}
