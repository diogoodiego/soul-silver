import { z } from "zod";
import { saveSchema } from "../save/schema.ts";
import { ENTITY_KINDS } from "./entity.ts";

// Client <-> game server messages (spec 010, contracts/game-protocol.md). Validated on arrival on both sides.

const count = () => z.number().int().nonnegative();
const direction = z.enum(["north", "south", "east", "west"]);

export const playerInput = z.strictObject({
  seq: count(),
  /** Stick or keyboard vector; each axis in [-1, 1]. A length above 1 is normalized by the step, not rejected. */
  move: z.strictObject({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) }),
  run: z.boolean(),
  /** Move slots 1–4 are bits 0–3 (spec 013); a move starts on the press, not while held. */
  buttons: count(),
  /** Aim in the world plane, each axis in [-1, 1]; absent or zero means the way the entity faces. */
  aim: z.strictObject({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) }).optional(),
});
export type PlayerInput = z.infer<typeof playerInput>;

/** A combatant of the dev arena (spec 013, contracts/game-protocol-v5.md). */
export const arenaCombatant = z.strictObject({
  species: z.number().int().min(1).max(0x3ff),
  level: z.number().int().min(1).max(100),
  moves: z.array(count()).min(1).max(4),
});
export type ArenaCombatant = z.infer<typeof arenaCombatant>;
export const arenaSpec = z.strictObject({ a: arenaCombatant, b: arenaCombatant });
export type ArenaSpec = z.infer<typeof arenaSpec>;

export const clientMessage = z.discriminatedUnion("type", [
  /**
   * `save` is checked by the session (migrate, schema, coherence) so a bad one is rejected with a reason.
   * `arena` is only accepted by a server started with the dev arena.
   */
  z.strictObject({
    type: z.literal("hello"),
    protocolVersion: count(),
    save: z.unknown(),
    resumeToken: z.string().min(1).max(64).optional(),
    arena: arenaSpec.optional(),
  }),
  z.strictObject({ type: z.literal("save-ack"), rev: count() }),
  playerInput.extend({ type: z.literal("input") }),
  z.strictObject({ type: z.literal("leave") }),
]);
export type ClientMessage = z.infer<typeof clientMessage>;

const entityFields = {
  kind: z.enum(ENTITY_KINDS),
  area: z.string(),
  x: z.number(),
  y: z.number(),
  level: count(),
  facing: direction,
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
};

const entity = z.strictObject({ id: count(), ...entityFields });
const entityDelta = z.strictObject({ id: count(), ...z.object(entityFields).partial().shape });

export const tickMetrics = z.strictObject({
  lastMs: z.number().nonnegative(),
  avgMs: z.number().nonnegative(),
  maxMs: z.number().nonnegative(),
  overruns: count(),
});
export type TickMetrics = z.infer<typeof tickMetrics>;

export const REJECT_CODES = ["protocol-mismatch", "session-full", "session-closed", "invalid-save", "save-too-new", "name-taken", "invalid-message"] as const;
export type RejectCode = (typeof REJECT_CODES)[number];

export const CLOSE_REASONS = ["host-left", "closed-by-host"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const HIT_KINDS = ["hit", "immune", "tick", "heal", "status", "stages", "failed"] as const;
export type HitKind = (typeof HIT_KINDS)[number];

/** Something combat did, for the feedback (spec 013, data-model.md). */
export const hitEvent = z.strictObject({
  kind: z.enum(HIT_KINDS),
  /** The entity that used the move; the target itself for status ticks. */
  attacker: count(),
  target: count(),
  /** Move id; 0 for status ticks. */
  move: count(),
  /** HP lost, or healed for "heal". */
  amount: count(),
  /** 0, 0.25, 0.5, 1, 2 or 4; 1 when it does not apply. */
  effectiveness: z.number().nonnegative(),
  crit: z.boolean(),
  /** Knockback direction times distance, in pixels. */
  push: z.strictObject({ x: z.number(), y: z.number() }),
  /** Status applied, or ticking. */
  status: z.string().optional(),
});
export type HitEvent = z.infer<typeof hitEvent>;

export const serverMessage = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("welcome"),
    protocolVersion: count(),
    playerId: count(),
    entityId: count(),
    tick: count(),
    tickRateHz: z.literal(20),
    resumeToken: z.string(),
    /** True when this connection took over a reserved player (reconnect). */
    resumed: z.boolean(),
  }),
  z.strictObject({ type: z.literal("save"), save: saveSchema }),
  z.strictObject({ type: z.literal("reject"), code: z.enum(REJECT_CODES), message: z.string(), serverProtocolVersion: count() }),
  z.strictObject({
    type: z.literal("state"),
    tick: count(),
    /** Last input seq applied for this client; -1 before any. */
    lastInput: z.number().int().min(-1),
    full: z.boolean(),
    spawned: z.array(entity),
    changed: z.array(entityDelta),
    removed: z.array(count()),
  }),
  z.strictObject({ type: z.literal("debug"), metrics: tickMetrics }),
  z.strictObject({ type: z.literal("combat-event"), tick: count(), events: z.array(hitEvent) }),
  z.strictObject({ type: z.literal("session-closed"), reason: z.enum(CLOSE_REASONS) }),
]);
export type ServerMessage = z.infer<typeof serverMessage>;
export type StateMessage = Extract<ServerMessage, { type: "state" }>;

export function protocolMismatchMessage(server: number, client: number): string {
  return `Versão do protocolo incompatível: servidor ${server}, cliente ${client}. Atualize o jogo.`;
}
