import { applyDelta, serverMessage, type AiDebugRow, type ArenaSpec, type CloseReason, type Entity, type HitEvent, type MoveInput, type ServerMessage, type TickMetrics, type WorldLookup } from "@soulsilver/shared/game";
import { createInterpolator } from "./interpolation";
import { createPredictor } from "./prediction";

// The renderer's side of the game protocol (spec 010): handshake, inputs, state, prediction and interpolation.

export interface GameConnectionOptions {
  /** The player save; the server validates it and spawns the player where it says. */
  save: unknown;
  protocolVersion: number;
  send(msg: unknown): void;
  /** The same maps the server simulates; unknown maps are open ground. */
  world: WorldLookup;
  log?(message: string): void;
  /** Asks for the dev arena (spec 013); only development servers accept it. */
  arena?: ArenaSpec | undefined;
}

export type GameStatus = "connecting" | "playing" | "rejected" | "closed";

/** Companion and fight messages (spec 014), and bag, Pokédex and capture ones (spec 015), for the screen. */
export type CompanionEvent = Extract<ServerMessage, { type: "party" | "reaction" | "fainted" | "blackout" | "capture" | "captured" | "bag" | "pokedex" | "notice" | "exp-gain" | "progression" }>;

export function createGameConnection(options: GameConnectionOptions) {
  const entities = new Map<number, Entity>();
  const predictor = createPredictor(options.world);
  const interpolator = createInterpolator();
  let status: GameStatus = "connecting";
  let rejectMessage: string | undefined;
  let closeReason: CloseReason | "disconnected" | undefined;
  let entityId: number | undefined;
  let playerId: number | undefined;
  let metrics: TickMetrics | undefined;
  /** The last AI debug rows (spec 019); only sent while the overlay is on. */
  let aiDebug: AiDebugRow[] = [];
  let tick = 0;
  let seq = 0;
  let combatEvents: HitEvent[] = [];
  let companionEvents: CompanionEvent[] = [];
  /** Only the trainer walks the tile-based step; a Pokémon in combat is shown as the server has it. */
  const predicting = () => entityId === undefined || entities.get(entityId)?.kind === "player";

  function receive(raw: unknown, now: number): void {
    const parsed = serverMessage.safeParse(raw);
    if (!parsed.success) {
      options.log?.(`Discarded invalid server message: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      return;
    }
    const msg = parsed.data;
    switch (msg.type) {
      case "welcome":
        entityId = msg.entityId;
        playerId = msg.playerId;
        return;
      case "reject":
        status = "rejected";
        rejectMessage = msg.message;
        return;
      case "session-closed":
        status = "closed";
        closeReason = msg.reason;
        return;
      case "save":
        // The main process writes it and acknowledges.
        return;
      case "aiDebug":
        aiDebug = msg.ais;
        return;
      case "debug":
        metrics = msg.metrics;
        return;
      case "combat-event":
        combatEvents.push(...msg.events);
        return;
      case "control":
        // The trainer, or the Pokémon out in combat: input, camera and aim follow it.
        entityId = msg.entityId;
        return;
      case "party":
      case "reaction":
      case "fainted":
      case "blackout":
      case "capture":
      case "captured":
      case "bag":
      case "pokedex":
      case "notice":
      case "exp-gain":
      case "progression":
        companionEvents.push(msg);
        return;
      case "state": {
        if (msg.full) entities.clear();
        for (const e of msg.spawned) entities.set(e.id, e);
        for (const d of msg.changed) {
          const e = entities.get(d.id);
          if (e) entities.set(d.id, applyDelta(e, d));
        }
        for (const id of msg.removed) entities.delete(id);
        tick = msg.tick;
        const self = entityId === undefined ? undefined : entities.get(entityId);
        if (self) {
          if (predicting()) predictor.reconcile(self, msg.lastInput, now);
          status = "playing";
        }
        interpolator.push(msg.tick, now, [...entities.values()].filter((e) => e.id !== entityId || !predicting()));
        return;
      }
    }
  }

  return {
    start(): void {
      options.send({ type: "hello", protocolVersion: options.protocolVersion, save: options.save, ...(options.arena ? { arena: options.arena } : {}) });
    },
    receive,
    /** One per local tick while playing; a zero vector means standing still. */
    sendInput(move: MoveInput["move"], run: boolean, now: number, buttons = 0, aim?: MoveInput["move"]): void {
      if (status !== "playing") return;
      const input = { seq: seq++, move, run, buttons, ...(aim ? { aim } : {}) };
      if (predicting()) predictor.apply(input, now);
      options.send({ type: "input", ...input });
    },
    view(now: number): { self: Entity | undefined; others: Entity[] } {
      const sampled = interpolator.sample(now);
      if (predicting()) return { self: predictor.view(now), others: sampled };
      return { self: sampled.find((e) => e.id === entityId), others: sampled.filter((e) => e.id !== entityId) };
    },
    /** Combat events received since the last call. */
    takeCombatEvents(): HitEvent[] {
      const out = combatEvents;
      combatEvents = [];
      return out;
    },
    /** Companion and fight messages received since the last call. */
    takeCompanionEvents(): CompanionEvent[] {
      const out = companionEvents;
      companionEvents = [];
      return out;
    },
    /** The server closed the connection without a session-closed (e.g. it was dropped). */
    disconnected(): void {
      if (status !== "connecting" && status !== "playing") return;
      status = "closed";
      closeReason = "disconnected";
    },
    get status() {
      return status;
    },
    get closeReason() {
      return closeReason;
    },
    get rejectMessage() {
      return rejectMessage;
    },
    get entityId() {
      return entityId;
    },
    /** Owner of this player's Pokémon and balls (`data.owner`). */
    get playerId() {
      return playerId;
    },
    get aiDebug() {
      return aiDebug;
    },
    get metrics() {
      return metrics;
    },
    get tick() {
      return tick;
    },
  };
}

export type GameConnection = ReturnType<typeof createGameConnection>;
