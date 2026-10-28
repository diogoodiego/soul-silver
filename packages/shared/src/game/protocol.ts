import { z } from "zod";
import { AI_STATES } from "../ai/controller.ts";
import { EMOTIONS } from "../companion/schemas.ts";
import { TRAINER_MUSIC } from "../events/schemas.ts";
import { stats } from "../game-data/common.ts";
import { BOX_COUNT, BOX_NAME_MAX, BOX_SLOTS, progressionItem, saveSchema } from "../save/schema.ts";
import { ENTITY_KINDS } from "./entity.ts";
import { PLAYER_NAME_MAX } from "./limits.ts";

// Client <-> game server messages (spec 010, contracts/game-protocol.md). Validated on arrival on both sides.

const count = () => z.number().int().nonnegative();
/** The most items a script choice menu has (spec 023). */
const MENU_ITEMS_MAX = 32;
const battleStats = stats(0, 0xffff);
const direction = z.enum(["north", "south", "east", "west"]);
/** A text id, "bank:index". */
const textId = z.string().regex(/^\d{4}:\d+$/);

export const playerInput = z.strictObject({
  seq: count(),
  /** Stick or keyboard vector; each axis in [-1, 1]. A length above 1 is normalized by the step, not rejected. */
  move: z.strictObject({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) }),
  run: z.boolean(),
  /** Move slots 1–4 are bits 0–3 (spec 013), then BUTTON bits; actions start on the press, not while held. */
  buttons: count(),
  /** Aim in the world plane, each axis in [-1, 1]; absent or zero means the way the entity faces. */
  aim: z.strictObject({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) }).optional(),
});
export type PlayerInput = z.infer<typeof playerInput>;

/** Input buttons past the move slots (specs 013, 014 and 015, contracts/game-protocol-v7.md). */
export const BUTTON = { dash: 1 << 4, combat: 1 << 5, recall: 1 << 6, interact: 1 << 7, throw: 1 << 8 } as const;

/** A combatant of the dev arena (spec 013, contracts/game-protocol-v5.md). */
export const arenaCombatant = z.strictObject({
  species: z.number().int().min(1).max(0x3ff),
  level: z.number().int().min(1).max(100),
  moves: z.array(count()).min(1).max(4),
});
export type ArenaCombatant = z.infer<typeof arenaCombatant>;
export const arenaSpec = z.strictObject({ a: arenaCombatant, b: arenaCombatant });
export type ArenaSpec = z.infer<typeof arenaSpec>;

/** A party index or a PC box slot (spec 023); a party index past the end withdraws to the end. */
export const pcSlot = z.discriminatedUnion("where", [
  z.strictObject({ where: z.literal("party"), index: z.number().int().min(0).max(5) }),
  z.strictObject({ where: z.literal("box"), box: z.number().int().min(0).max(BOX_COUNT - 1), index: z.number().int().min(0).max(BOX_SLOTS - 1) }),
]);
export type PcSlot = z.infer<typeof pcSlot>;

export const SHOP_REFUSALS = ["money", "stock", "bag-full", "not-owned", "unsellable", "invalid"] as const;
export type ShopRefusal = (typeof SHOP_REFUSALS)[number];
export const PC_REFUSALS = ["occupied", "empty", "last-fighter", "full", "invalid"] as const;
export type PcRefusal = (typeof PC_REFUSALS)[number];

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
  /** Quick swap in combat (spec 014); ignored on cooldown, fainted, already out or outside combat. */
  z.strictObject({ type: z.literal("swap"), partyIndex: z.number().int().min(0).max(5) }),
  /** The ball the next throw uses (spec 015); ignored when it is not in the bag. */
  z.strictObject({ type: z.literal("select-ball"), item: count() }),
  /** Replies to the head of the progression queue (spec 016); ignored in combat or when the head is of another kind. */
  z.strictObject({ type: z.literal("progression-ack") }),
  /** `forget` is the slot the new move replaces; null keeps the four moves. */
  z.strictObject({ type: z.literal("learn-answer"), forget: z.number().int().min(0).max(3).nullable() }),
  /** false is the cancel button. */
  z.strictObject({ type: z.literal("evolve-answer"), accept: z.boolean() }),
  /** The full menu opened or closed (spec 017): the player shows as busy; refused in combat. */
  z.strictObject({ type: z.literal("menu"), open: z.boolean() }),
  /** Moves a party member to another slot (spec 017); refused in combat or with a bad index. */
  z.strictObject({ type: z.literal("reorder-party"), from: z.number().int().min(0).max(5), to: z.number().int().min(0).max(5) }),
  /** Uses a bag item on a party member outside combat (spec 017); only potions for now. */
  z.strictObject({ type: z.literal("use-item"), item: count(), partyIndex: z.number().int().min(0).max(5) }),
  /** Turns the AI debug overlay's data on or off for this client (spec 019); off on every connection. */
  z.strictObject({ type: z.literal("debugAi"), on: z.boolean() }),
  /** Answers the script request `id` (spec 020): 0 yes / 1 no, or the index picked; nothing for a plain confirm. */
  z.strictObject({ type: z.literal("script-answer"), id: count(), answer: z.number().int().min(0).max(MENU_ITEMS_MAX).optional() }),
  /** The script debugger (spec 020); off on every connection. Flag changes only with it on, in development builds. */
  z.strictObject({ type: z.literal("debugScript"), on: z.boolean() }),
  z.strictObject({ type: z.literal("debugSetFlag"), flag: z.number().int().min(1).max(0xffff), on: z.boolean() }),
  /** Spec 022: the player closed the challenge line of the trainer that spotted them; the battle may start. */
  z.strictObject({ type: z.literal("trainer-ready") }),
  /** Spec 023: shop and PC requests, refused without an open session. */
  z.strictObject({ type: z.literal("shop-buy"), item: count(), qty: z.number().int().min(1).max(99) }),
  z.strictObject({ type: z.literal("shop-sell"), item: count(), qty: z.number().int().min(1).max(999) }),
  z.strictObject({ type: z.literal("shop-leave") }),
  z.strictObject({ type: z.literal("pc-move"), from: pcSlot, to: pcSlot }),
  z.strictObject({ type: z.literal("pc-rename"), box: z.number().int().min(0).max(BOX_COUNT - 1), name: z.string().min(1).max(BOX_NAME_MAX) }),
  z.strictObject({ type: z.literal("pc-items"), dir: z.enum(["deposit", "withdraw"]), item: count(), qty: z.number().int().min(1).max(999) }),
  z.strictObject({ type: z.literal("pc-leave") }),
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

/** `no-escape` is the original's refusal in a trainer battle (spec 022). */
export const NOTICE_CODES = ["no-balls", "storage-full", "ball-returned", "menu-blocked", "action-refused", "item-unavailable", "no-escape"] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number];

export const CLOSE_REASONS =["host-left", "closed-by-host"] as const;
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

const point = z.strictObject({ x: z.number(), y: z.number() });

/** One AI in the debug overlay (spec 019, FR-033). */
export const aiDebugRow = z.strictObject({
  entityId: count(),
  state: z.enum(AI_STATES),
  target: count().nullable(),
  sight: z.strictObject({ rangePx: z.number().nonnegative(), angleDeg: z.number().min(0).max(360), facing: point }),
  lastSeen: point.nullable(),
  zone: z.strictObject({ x: z.number(), y: z.number(), radiusPx: z.number().nonnegative() }),
  scores: z.array(z.strictObject({ slot: z.number().int().min(0).max(3), move: count(), damage: z.number(), hit: z.number(), utility: z.number(), score: z.number() })).max(4),
  chosenSlot: z.number().int().min(0).max(3).nullable(),
});
export type AiDebugRow = z.infer<typeof aiDebugRow>;

const textBuffer = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("player") }),
  z.strictObject({ kind: z.literal("species"), id: count() }),
  z.strictObject({ kind: z.literal("number"), value: z.number().int() }),
]);
const scriptSound = z.enum(["se", "fanfare", "cry"]);

/** Who a cutscene step moves (spec 021): a map object by person id, or the player or their companion. */
const cutsceneActor = z.union([z.strictObject({ person: count() }), z.enum(["player", "companion"])]);
export const cutsceneStep = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("walk"), actor: cutsceneActor, dir: direction, count: count() }),
  z.strictObject({ kind: z.literal("face"), actor: cutsceneActor, dir: direction }),
  z.strictObject({ kind: z.literal("wait"), ticks: count() }),
  z.strictObject({ kind: z.literal("jump"), actor: cutsceneActor, dir: direction, count: count() }),
  z.strictObject({ kind: z.literal("show"), actor: cutsceneActor }),
  z.strictObject({ kind: z.literal("hide"), actor: cutsceneActor }),
  z.strictObject({ kind: z.literal("camera-move"), x: z.number().finite(), y: z.number().finite(), ticks: count() }),
  z.strictObject({ kind: z.literal("camera-lock"), actor: cutsceneActor }),
  z.strictObject({ kind: z.literal("camera-release") }),
  z.strictObject({ kind: z.literal("camera-shake"), amplitude: z.number().nonnegative().finite(), ticks: count() }),
]);
export type CutsceneStep = z.infer<typeof cutsceneStep>;
export type CutsceneActor = z.infer<typeof cutsceneActor>;

/** What a running script waits for from this client (spec 020); the server's own waits never come here. */
export const scriptRequest = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("say"), text: z.string().min(1), buffers: z.record(z.string(), textBuffer) }),
  z.strictObject({ kind: z.literal("yes-no") }),
  /** Spec 023: a choice list (text ids); the answer is the index, or the item count to cancel. */
  z.strictObject({ kind: z.literal("menu"), items: z.array(textId).min(1).max(MENU_ITEMS_MAX), cancel: z.boolean() }),
  z.strictObject({ kind: z.literal("starter"), species: z.array(count()).min(1).max(6) }),
  z.strictObject({ kind: z.literal("wait-fade") }),
  z.strictObject({ kind: z.literal("wait-sound"), sound: scriptSound }),
  /** Spec 021: the client stages these steps and answers when they end; actors it controls stop following the server. */
  z.strictObject({ kind: z.literal("cutscene"), actors: z.array(cutsceneActor).max(16), steps: z.array(cutsceneStep).max(512) }),
]);
export type ScriptRequestMessage = z.infer<typeof scriptRequest>;

export const scriptEvent = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("close-msg") }),
  z.strictObject({ kind: z.literal("fade"), type: count(), color: count(), duration: count() }),
  z.strictObject({ kind: z.literal("sound"), sound: scriptSound, id: count() }),
  z.strictObject({ kind: z.literal("bgm"), id: count().nullable() }),
]);

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
  /** What each nearby AI thinks (spec 019, contracts/game-protocol-v11.md); only to clients that asked. */
  z.strictObject({ type: z.literal("aiDebug"), tick: count(), ais: z.array(aiDebugRow) }),
  z.strictObject({ type: z.literal("combat-event"), tick: count(), events: z.array(hitEvent) }),
  z.strictObject({ type: z.literal("session-closed"), reason: z.enum(CLOSE_REASONS) }),
  /** The entity this client now moves and the camera follows: the trainer, or the Pokémon in combat (spec 014). */
  z.strictObject({ type: z.literal("control"), entityId: count() }),
  /** The party as the swap picker shows it; `active` is the member out in combat. */
  z.strictObject({
    type: z.literal("party"),
    members: z
      .array(
        z.strictObject({
          species: count(),
          level: count(),
          hp: count(),
          hpMax: count(),
          /** Spec 017, for the party screen; absent when the species data is missing. */
          moves: z.array(count()).max(4).optional(),
          stats: battleStats.optional(),
          nature: z.number().int().min(0).max(24).optional(),
          ability: count().optional(),
          exp: count().optional(),
          /** Experience at the next level; equal to exp at level 100. */
          expNext: count().optional(),
        }),
      )
      .max(6),
    active: count().optional(),
  }),
  /** Who is in the session (v12), sent to everyone whenever someone joins or leaves. */
  z.strictObject({ type: z.literal("players"), players: z.array(z.strictObject({ id: count(), name: z.string().min(1).max(PLAYER_NAME_MAX), host: z.boolean() })).max(4) }),
  z.strictObject({ type: z.literal("reaction"), companionId: count(), species: count(), emotion: z.enum(EMOTIONS), bank: count(), text: count() }),
  /** The Pokémon out fainted; `canContinue` is false when nobody is left (a blackout follows). */
  z.strictObject({ type: z.literal("fainted"), partyIndex: count(), canContinue: z.boolean() }),
  z.strictObject({ type: z.literal("blackout"), moneyLost: count(), area: z.string() }),
  /** A ball hit a wild Pokémon (spec 015): clients play `shakes`, then the result. Sent to the whole area. */
  z.strictObject({ type: z.literal("capture"), wildId: count(), player: count(), ball: count(), shakes: z.number().int().min(0).max(3), caught: z.boolean() }),
  /** To the catcher only, once the shakes are over. */
  z.strictObject({ type: z.literal("captured"), species: count(), to: z.enum(["party", "storage"]) }),
  /** The whole bag (spec 017; only the balls before) and the ball the next throw uses; on join and on change. */
  z.strictObject({ type: z.literal("bag"), items: z.array(z.strictObject({ item: count(), count: z.number().int().min(1).max(999) })), selected: count().optional() }),
  z.strictObject({ type: z.literal("pokedex"), seen: z.array(count()), caught: z.array(count()) }),
  z.strictObject({ type: z.literal("notice"), code: z.enum(NOTICE_CODES) }),
  /** A participant's share when a foe fell (spec 016); shown in combat, nothing to decide. */
  z.strictObject({ type: z.literal("exp-gain"), partyIndex: z.number().int().min(0).max(5), amount: count() }),
  /**
   * The head of the progression queue, only out of combat. A level-up carries the new stats and the gains;
   * a learn carries the moves known now (four means the player picks one to forget).
   */
  z.strictObject({ type: z.literal("progression"), item: progressionItem, stats: battleStats.optional(), gains: battleStats.optional(), moves: z.array(count()).max(4).optional() }),
  /** A script waits for this client (spec 020); answered with script-answer and the same id. */
  z.strictObject({ type: z.literal("script"), id: count(), request: scriptRequest }),
  z.strictObject({ type: z.literal("script-event"), event: scriptEvent }),
  /** The player cannot move while a script of theirs runs. */
  z.strictObject({ type: z.literal("script-lock"), locked: z.boolean() }),
  /** Where this player's script is, and their flags and variables; only to clients that asked (spec 020, FR-011). */
  z.strictObject({
    type: z.literal("script-debug"),
    at: z.strictObject({ file: count(), entry: count(), pc: count(), command: z.string(), depth: count() }).nullable(),
    flags: z.array(count()),
    vars: z.record(z.string(), count()),
  }),
  /** Spec 022: only to the player spotted; the client shows the "!", walks the trainer over `tiles`, then its challenge line (a text id). */
  z.strictObject({ type: z.literal("trainerSpotted"), npcId: count(), trainerId: count(), tiles: count(), intro: textId.optional() }),
  /** A trainer's line outside battle: what a defeated trainer says when talked to. */
  z.strictObject({ type: z.literal("trainerSay"), text: textId }),
  /** To everyone in the area, so all see the arena; only `player` fights in it. */
  z.strictObject({
    type: z.literal("trainerBattleStart"),
    battleId: count(),
    player: count(),
    trainerId: count(),
    arena: z.strictObject({ area: z.string(), x: z.number().finite(), y: z.number().finite(), radiusPx: z.number().positive() }),
    music: z.enum(TRAINER_MUSIC),
    double: z.boolean(),
  }),
  z.strictObject({ type: z.literal("trainerSendOut"), battleId: count(), slot: z.number().int().min(0).max(5), entityId: count() }),
  z.strictObject({ type: z.literal("trainerItem"), battleId: count(), item: count(), target: count() }),
  /** `prize` and the trainer's `defeat` line (a text id) only to the player who won. */
  z.strictObject({ type: z.literal("trainerBattleEnd"), battleId: count(), result: z.enum(["won", "lost", "aborted"]), prize: count().optional(), defeat: textId.optional() }),
  /**
   * Spec 023: a mart opened by the script. Buying, `stock` is what this player's badges reach; selling, it
   * is what in the bag sells, at the sale price, and comes again after each sale.
   */
  z.strictObject({ type: z.literal("shopOpen"), shopId: count(), mode: z.enum(["buy", "sell"]), money: count(), stock: z.array(z.strictObject({ item: count(), price: count() })) }),
  /** Answers every shop request with the balance after it; a refusal changed nothing. */
  z.strictObject({ type: z.literal("shopResult"), ok: z.boolean(), reason: z.enum(SHOP_REFUSALS).optional(), money: count() }),
  z.strictObject({ type: z.literal("shopClose") }),
  /** The PC opened; boxes and items are read from the player's `save` message. */
  z.strictObject({ type: z.literal("pcOpen") }),
  z.strictObject({ type: z.literal("pcResult"), ok: z.boolean(), reason: z.enum(PC_REFUSALS).optional() }),
  z.strictObject({ type: z.literal("pcClose") }),
]);
export type ServerMessage = z.infer<typeof serverMessage>;
export type StateMessage = Extract<ServerMessage, { type: "state" }>;

export function protocolMismatchMessage(server: number, client: number): string {
  return `Versão do protocolo incompatível: servidor ${server}, cliente ${client}. Atualize o jogo.`;
}
