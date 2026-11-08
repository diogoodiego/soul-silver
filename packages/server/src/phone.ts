// The Pokégear phone on the server (spec 026, US4): counts each player's tile steps, rings with the
// original's rules (shared/phone/calls.ts), holds a call while the player is busy, and plays the
// extracted call scripts. Rematches (research R7.4): a REMATCH call sets `seeking`; the trainer's next
// talk fights the rematch team, and winning it clears `seeking` (scr_seq_0953.s, ScrCmd_462).
import type { ServerMessage } from "@soulsilver/shared/game";
import type { TextBuffer } from "@soulsilver/shared/script";
import { callDue, GREETING_BANK, NO_GREETING, parsePhoneFile, pickCallScript, rematchTrainer, REMATCH_GROUP_FLAG, SCRIPT_REMATCH, type PhoneBook, type PhoneContact, type ScriptedCalls, type PhoneCallers } from "@soulsilver/shared/phone";
import type { PhoneSave } from "@soulsilver/shared/save";
import { formatTextId } from "@soulsilver/shared/text";
import { timeOfDay } from "@soulsilver/shared/wild";
import callersJson from "../../../content/phone/callers.json" with { type: "json" };
import scriptedCallsJson from "../../../content/phone/scripted-calls.json" with { type: "json" };
import type { World } from "./world";

const scriptedFile = parsePhoneFile("phone-scripted-calls", scriptedCallsJson, "content/phone/scripted-calls.json");
if (!scriptedFile.ok) throw new Error(`${scriptedFile.error.file}: ${scriptedFile.error.path}: ${scriptedFile.error.problem}`);
const SCRIPTED: ScriptedCalls = scriptedFile.data.value;
const callersFile = parsePhoneFile("phone-callers", callersJson, "content/phone/callers.json");
if (!callersFile.ok) throw new Error(`${callersFile.error.file}: ${callersFile.error.path}: ${callersFile.error.problem}`);
const CALLERS: PhoneCallers = callersFile.data.value;

/** The PHONE_SCRIPT a script's call plays (SetPhoneCall with isScriptedCall 2); undefined when not listed. */
export const scriptedCallOf = (caller: number, index: number) => SCRIPTED.calls.find((c) => c.caller === caller)?.scripts[index];

/** FLAG_BEAT_RADIO_TOWER_ROCKETS (flags.h): no rematch call before it (phone_scripts_generic.c). */
export const FLAG_RADIO_TOWER = 0xc6;
/** PHONE_CONTACT_KENJI: his rematch is by day only (PhoneBookTrainerGetRematchInfo). */
const KENJI = 16;
const LOG_MAX = 20;
const TILE_PX = 16;
const BAND = { morning: 0, day: 1, night: 2 } as const;
/** SPECIES_RATTATA: what a call names when there is no team or no wild table (phone_scripts_generic.c). */
const RATTATA = 19;
/** PHONESCRIPTTYPE_UNK1, _FLAG and _WORD (phone_scripts.h). */
const SCRIPT_UNK1 = 1;
const SCRIPT_FLAG = 2;
const SCRIPT_WORD = 5;
/** PHONE_SCRIPT_NONE: the caller's own flow plays (Mom's savings, scriptType 4). */
const MOM_FLOW = 0;
/** PHONECALLTYPE_MOM. */
const MOM_TYPE = 1;
/** FLAG_SYS_MOMS_SAVINGS (flags.h). */
export const FLAG_MOMS_SAVINGS = 0x986;
/** "Save some money", "Don't save money" (sContextMenuParam[2], msg_0271 8 and 9). */
const SAVINGS_CHOICES = ["0271:8", "0271:9"];
/** TRAINERCLASS_FISHERMAN: names a Good Rod catch. */
const FISHERMAN = 11;

export interface PhoneOptions {
  book: PhoneBook | undefined;
  world: World;
  rng: { nextInt(n: number): number };
  weekday(): number;
  hour(): number;
  bands: { morning: number; day: number; night: number };
  /** Whether the map takes calls (the header's incomingCalls). */
  rings(area: string): boolean;
  /** In combat, a cutscene or a menu: the call waits. */
  busy(playerId: number): boolean;
  /** ISO time for the call log. */
  now(): string;
  /** For the calls' texts (PhoneCall_InitMsgDataAndBufferNames): an area's MAPSEC, a trainer's team, a map's wild species by band. */
  mapsec?: ((area: string) => number | undefined) | undefined;
  team?: ((trainer: number) => number[]) | undefined;
  wild?: ((map: number, band: number, fisherman: boolean) => number[]) | undefined;
  /** A trainer's flag (trainer-battle.ts), to see which rematch steps were beaten. */
  trainerFlag?: ((trainer: number) => number) | undefined;
  /** A call a script placed (RunPhoneCall) was answered: the script goes on. */
  onScriptedEnd?: ((playerId: number) => void) | undefined;
}

export interface Caller {
  playerId: number;
  entityId: number;
  character: "male" | "female";
  /** The player's save part, changed in place. */
  phone: PhoneSave;
  flags: Set<number>;
  send(msg: ServerMessage): void;
}

interface Ringing {
  id: number;
  contact: number;
  script: number;
  direction: "in" | "out";
  story: boolean;
  scripted: boolean;
  /** Mom's savings question (spec 026): the question waits for a choice, the reply ends the call. */
  mom?: "ask" | "reply" | undefined;
}

interface State {
  who: Caller;
  steps: number;
  tile: string;
  /** A call due while the player was busy (random ones are never saved). */
  held: { contact: number; script: number; story: boolean } | undefined;
  ringing: Ringing | undefined;
}

export function createPhone(options: PhoneOptions) {
  const states = new Map<number, State>();
  let nextId = 0;
  const book = options.book;
  const contactOf = (id: number) => book?.contacts.find((c) => c.id === id);
  const scriptOf = (id: number) => book?.scripts.find((s) => s.id === id);
  const tileOf = (s: State) => {
    const e = options.world.get(s.who.entityId);
    return e ? `${e.area}:${Math.floor(e.x / TILE_PX)},${Math.floor(e.y / TILE_PX)}` : "";
  };
  const areaOf = (s: State) => options.world.get(s.who.entityId)?.area ?? "";

  function sendState(s: State): void {
    const p = s.who.phone;
    s.who.send({ type: "phone-state", contacts: p.contacts.map((id) => ({ id, name: formatTextId(contactOf(id)?.bank ?? 0, 0), seeking: p.seeking.includes(id) })), log: p.log.map((l) => ({ ...l })) });
  }

  /**
   * GearPhoneCall_Mother: a script's call asks with message 22; a call to her opens with her intro (7 + the map's
   * momCallIntroParam) and asks with 27 (saving) or 28 (not), the balance being 0 here. Then the choice (msg_0271 8 and 9).
   * shortcut: momCallIntroParam is not in the extracted headers, so every place has intro 7; the gift queue is never full.
   */
  function momAsk(s: State, contact: PhoneContact, direction: "in" | "out", scripted: boolean): number {
    const id = ++nextId;
    s.ringing = { id, contact: contact.id, script: MOM_FLOW, direction, story: false, scripted, mom: "ask" };
    const msg = (n: number) => formatTextId(contact.bank, n);
    const lines = scripted ? [msg(22)] : [msg(7), msg(s.who.flags.has(FLAG_MOMS_SAVINGS) ? 27 : 28)];
    s.who.send({ type: "phone-call", callId: id, contact: contact.id, name: msg(0), direction, lines, choices: SAVINGS_CHOICES, buffers: buffersFor(s, contact) });
    return id;
  }

  function ring(s: State, contact: PhoneContact, script: number, direction: "in" | "out", story: boolean, scripted = false): number | undefined {
    if (script === MOM_FLOW && contact.type === MOM_TYPE) return momAsk(s, contact, direction, scripted);
    const def = scriptOf(script);
    if (!def) return undefined;
    const id = ++nextId;
    s.ringing = { id, contact: contact.id, script, direction, story, scripted };
    const female = s.who.character === "male" ? 0 : 1;
    const lines = [formatTextId(contact.bank, def.lines[female])];
    // PhoneCall_PrintGreeting: row unkC, index band * 2 + incoming * 6, the female line after the male one.
    const row = contact.greeting === NO_GREETING ? undefined : book?.greetings[contact.greeting];
    const greeting = row?.[BAND[timeOfDay(options.hour(), options.bands)] * 2 + (direction === "in" ? 6 : 0) + female];
    if (greeting !== undefined) lines.unshift(formatTextId(GREETING_BANK, greeting));
    s.who.send({ type: "phone-call", callId: id, contact: contact.id, name: formatTextId(contact.bank, 0), direction, lines, buffers: buffersFor(s, contact, def) });
    return id;
  }

  /** PhoneCall_InitMsgDataAndBufferNames, and GearPhoneCall_Generic's two species for a trainer. */
  function buffersFor(s: State, contact: PhoneContact, def?: { type: number; param0: number; param1: number }): Record<number, TextBuffer> {
    const pick = (list: number[]) => (list.length ? list[options.rng.nextInt(list.length)]! : RATTATA);
    const place = (area: string): TextBuffer[] => {
      const mapsec = options.mapsec?.(area);
      return mapsec === undefined ? [] : [{ kind: "place", mapsec }];
    };
    const out: Record<number, TextBuffer> = { 0: { kind: "player" }, 1: { kind: "text", text: formatTextId(contact.bank, 0) } };
    const [here] = place(areaOf(s));
    const [theirs] = place(String(contact.map));
    if (here) out[2] = here;
    if (theirs) out[3] = theirs;
    // PHONESCRIPTTYPE_WORD: one of param0 messages from param1 in buffer 4.
    if (def?.type === SCRIPT_WORD && def.param0 > 0) out[4] = { kind: "text", text: formatTextId(contact.bank, def.param1 + options.rng.nextInt(def.param0)) };
    if (contact.type === 0) {
      out[10] = { kind: "species", id: pick(options.team?.(contact.trainer) ?? []) };
      const band = BAND[timeOfDay(options.hour(), options.bands)];
      out[11] = { kind: "species", id: pick(options.wild?.(contact.map, band, contact.trainerClass === FISHERMAN) ?? []) };
    }
    return out;
  }

  function incomingScript(s: State, contact: PhoneContact): number | undefined {
    const band = BAND[timeOfDay(options.hour(), options.bands)];
    const ctx = { contact, seeking: s.who.phone.seeking.includes(contact.id), radioTower: s.who.flags.has(FLAG_RADIO_TOWER), weekday: options.weekday(), band, isRematch: (id: number) => scriptOf(id)?.type === SCRIPT_REMATCH };
    return pickCallScript(contact.incoming, ctx, options.rng);
  }

  /** GetPhoneBookRematch (PhoneBookTrainerGetRematchInfo): the rematch trainer while `seeking`, else 0. */
  function rematch(playerId: number, id: number): number {
    const s = states.get(playerId);
    const contact = contactOf(id);
    if (!s || !contact || !book || !s.who.phone.seeking.includes(id)) return 0;
    if (id === KENJI && timeOfDay(options.hour(), options.bands) !== "day") return 0;
    const flag = options.trainerFlag;
    return rematchTrainer(book.rematchSets, contact.trainer, (t) => !!flag && s.who.flags.has(flag(t)), (n) => s.who.flags.has(REMATCH_GROUP_FLAG(n)));
  }

  /** The first rule of the caller that holds; undefined when none does, or the call is not ported. */
  function specialScript(s: State, caller: number, here: boolean): number | undefined {
    const rule = CALLERS.callers.find((c) => c.caller === caller)?.outgoing.find((r) => (r.local ? here : true) && (r.unless === undefined || !s.who.flags.has(r.unless)) && (r.if === undefined || s.who.flags.has(r.if)));
    return rule?.scripts.length ? rule.scripts[options.rng.nextInt(rule.scripts.length)] : undefined;
  }

  function deliver(s: State): void {
    if (!s.held || s.ringing || options.busy(s.who.playerId) || !options.rings(areaOf(s))) return;
    const contact = contactOf(s.held.contact);
    const held = s.held;
    s.held = undefined;
    if (contact) ring(s, contact, held.script, "in", held.story);
  }

  return {
    join(who: Caller): void {
      const s: State = { who, steps: 0, tile: "", held: undefined, ringing: undefined };
      s.tile = tileOf(s);
      states.set(who.playerId, s);
    },
    /** The numbers and the log, to a player who just got their welcome. */
    sync(playerId: number): void {
      const s = states.get(playerId);
      if (s) sendState(s);
    },
    leave(playerId: number): void {
      states.delete(playerId);
    },
    /** After movement: count a step onto a new tile, roll a call on it, ring what waits once the player is free. */
    step(): void {
      if (!book) return;
      for (const s of states.values()) {
        const tile = tileOf(s);
        if (tile !== s.tile) {
          s.tile = tile;
          s.steps++;
          const area = areaOf(s);
          if (!s.held && !s.ringing && options.rings(area)) {
            const p = s.who.phone;
            const due = callDue({ steps: s.steps, contacts: p.contacts, called: p.called, pending: p.pending }, book.contacts, Number(area), options.rng);
            s.steps = due.steps;
            p.called = due.called;
            const c = due.call && contactOf(due.call.caller);
            if (due.call && c) {
              const script = "story" in due.call ? due.call.story : incomingScript(s, c);
              if (script) s.held = { contact: c.id, script, story: "story" in due.call };
            }
          }
        }
        deliver(s);
      }
    },
    /** The player hung up a ringing call. False when no such call rings. */
    answer(playerId: number, callId: number, choice?: number): boolean {
      const s = states.get(playerId);
      const r = s?.ringing;
      if (!s || !r || r.id !== callId) return false;
      if (r.mom === "ask") {
        if (choice !== 0 && choice !== 1) return false;
        // Save_VarsFlags_MomsSavingsFlagAction, then her reply (25 or 26) as the rest of the same call.
        if (choice === 0) s.who.flags.add(FLAG_MOMS_SAVINGS);
        else s.who.flags.delete(FLAG_MOMS_SAVINGS);
        const contact = contactOf(r.contact)!;
        const id = ++nextId;
        s.ringing = { ...r, id, mom: "reply" };
        s.who.send({ type: "phone-call", callId: id, contact: contact.id, name: formatTextId(contact.bank, 0), direction: r.direction, lines: [formatTextId(contact.bank, choice === 0 ? 25 : 26)], buffers: buffersFor(s, contact) });
        return true;
      }
      s.ringing = undefined;
      const p = s.who.phone;
      const def = scriptOf(r.script);
      if (def?.type === SCRIPT_REMATCH && p.contacts.includes(r.contact) && !p.seeking.includes(r.contact)) p.seeking.push(r.contact);
      // PHONESCRIPTTYPE_UNK1 and FLAG: param0 sets or clears the flag param1.
      if (def && (def.type === SCRIPT_UNK1 || def.type === SCRIPT_FLAG)) {
        if (def.param0) s.who.flags.add(def.param1);
        else s.who.flags.delete(def.param1);
      }
      if (r.story) {
        const i = p.pending.findIndex((q) => q.caller === r.contact && q.call === r.script);
        if (i >= 0) p.pending.splice(i, 1);
      }
      p.log.push({ contact: r.contact, direction: r.direction, at: options.now() });
      if (p.log.length > LOG_MAX) p.log.splice(0, p.log.length - LOG_MAX);
      sendState(s);
      if (r.scripted) options.onScriptedEnd?.(playerId);
      return true;
    },
    /**
     * The player calls a registered number, from the Pokégear (so the open menu does not hold it; the session refuses
     * it in a script or a fight). A trainer plays their local script on their map, else their outgoing list
     * (PhoneCall_GetScriptId_Generic); Elm and Mom follow their own rules (content/phone/callers.json).
     * shortcut: the other special callers (Oak, Bill, the Day-Care…) are not listed and refuse the call; none is
     * reached before Violet City. False when the call cannot be placed.
     */
    dial(playerId: number, id: number): boolean {
      const s = states.get(playerId);
      const contact = contactOf(id);
      if (!s || !contact || !s.who.phone.contacts.includes(id) || s.ringing || !options.rings(areaOf(s))) return false;
      const band = BAND[timeOfDay(options.hour(), options.bands)];
      const ctx = { contact, seeking: s.who.phone.seeking.includes(id), radioTower: s.who.flags.has(FLAG_RADIO_TOWER), weekday: options.weekday(), band, isRematch: (n: number) => scriptOf(n)?.type === SCRIPT_REMATCH };
      const here = String(contact.map) === areaOf(s);
      const script = contact.type === 0 ? (here ? contact.localScript : pickCallScript(contact.outgoing, ctx, options.rng)) : specialScript(s, contact.id, here);
      return script !== undefined && ring(s, contact, script, "out", false) !== undefined;
    },
    /** A script's call (SetPhoneCall, RunPhoneCall): rings now, as the scene goes on only once it is answered. */
    scriptedCall(playerId: number, caller: number, script: number): boolean {
      const s = states.get(playerId);
      const contact = contactOf(caller);
      if (!s || !contact || s.ringing) return false;
      return ring(s, contact, script, "in", false, true) !== undefined;
    },
    /** RegisterGearNumber. */
    register(playerId: number, id: number): void {
      const s = states.get(playerId);
      if (!s || s.who.phone.contacts.includes(id) || !contactOf(id)) return;
      s.who.phone.contacts.push(id);
      sendState(s);
    },
    registered: (playerId: number, id: number) => states.get(playerId)?.who.phone.contacts.includes(id) ?? false,
    rematch,
    /** The rematch trainer for a beaten base trainer (LoadPhoneDat, then GetPhoneBookRematch), with the contact; 0 for none. */
    rematchOfTrainer(playerId: number, trainer: number): { contact: number; trainer: number } | undefined {
      const contact = book?.contacts.find((c) => c.trainer === trainer && trainer !== 0);
      const s = states.get(playerId);
      if (!contact || !s?.who.phone.contacts.includes(contact.id)) return undefined;
      const id = rematch(playerId, contact.id);
      return id ? { contact: contact.id, trainer: id } : undefined;
    },
    /** ScrCmd_462: the rematch was won, the trainer stops seeking it. */
    rematchWon(playerId: number, id: number): void {
      const s = states.get(playerId);
      if (!s) return;
      const p = s.who.phone;
      p.seeking = p.seeking.filter((c) => c !== id);
      sendState(s);
    },
    /** The contact a trainer is, if any (LoadPhoneDat). */
    contactOfTrainer: (trainer: number) => (trainer === 0 ? undefined : book?.contacts.find((c) => c.trainer === trainer)),
  };
}

export type Phone = ReturnType<typeof createPhone>;
