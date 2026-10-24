import { applyDelta, serverMessage, type CloseReason, type Entity, type MoveInput, type TickMetrics, type WorldLookup } from "@soulsilver/shared/game";
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
}

export type GameStatus = "connecting" | "playing" | "rejected" | "closed";

export function createGameConnection(options: GameConnectionOptions) {
  const entities = new Map<number, Entity>();
  const predictor = createPredictor(options.world);
  const interpolator = createInterpolator();
  let status: GameStatus = "connecting";
  let rejectMessage: string | undefined;
  let closeReason: CloseReason | "disconnected" | undefined;
  let entityId: number | undefined;
  let metrics: TickMetrics | undefined;
  let tick = 0;
  let seq = 0;

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
      case "debug":
        metrics = msg.metrics;
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
          predictor.reconcile(self, msg.lastInput, now);
          status = "playing";
        }
        interpolator.push(msg.tick, now, [...entities.values()].filter((e) => e.id !== entityId));
        return;
      }
    }
  }

  return {
    start(): void {
      options.send({ type: "hello", protocolVersion: options.protocolVersion, save: options.save });
    },
    receive,
    /** One per local tick while playing; a zero vector means standing still. */
    sendInput(move: MoveInput["move"], run: boolean, now: number, buttons = 0): void {
      if (status !== "playing") return;
      const input = { seq: seq++, move, run, buttons };
      predictor.apply(input, now);
      options.send({ type: "input", ...input });
    },
    view(now: number): { self: Entity | undefined; others: Entity[] } {
      return { self: predictor.view(now), others: interpolator.sample(now) };
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
    get metrics() {
      return metrics;
    },
    get tick() {
      return tick;
    },
  };
}

export type GameConnection = ReturnType<typeof createGameConnection>;
