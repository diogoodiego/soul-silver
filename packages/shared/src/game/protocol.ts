import { z } from "zod";
import { AI_STATES } from "../ai/controller.ts";
import { EMOTIONS } from "../companion/schemas.ts";
import { TRAINER_MUSIC } from "../events/schemas.ts";
import { stats } from "../game-data/common.ts";
import { BOX_COUNT, BOX_NAME_MAX, BOX_SLOTS, progressionItem, saveSchema } from "../save/schema.ts";
import { BERRY_STAGES } from "../items/world.ts";
import { PLAYER_MODES, RODS } from "../field/schemas.ts";
import { ENTITY_KINDS } from "./entity.ts";
import { STATUS_IDS } from "../combat/schemas.ts";
import { PLAYER_NAME_MAX } from "./limits.ts";

// Client <-> game server messages (spec 010, contracts/game-protocol.md). Validated on arrival on both sides.

const count = () => z.number().int().nonnegative();
/** The most items a script choice menu has (spec 023). */
const MENU_ITEMS_MAX = 32;
/** Why a field move, ride or Fly was refused (spec 025). */
/** Block H: the options around a person; talk for anyone, sell beside shop, the rest for the person whose entity data.role names it. */
export const NPC_ACTIONS = ["talk", "shop", "sell", "heal", "battle"] as const;
export type NpcAction = (typeof NPC_ACTIONS)[number];

export const FIELD_REFUSALS =["badge", "move", "notHere", "indoors", "notVisited", "notAllowed", "busy"] as const;
const battleStats = stats(0, 0xffff);
const direction = z.enum(["north", "south", "east", "west"]);
/** A text id, "bank:index". */
const textId = z.string().regex(/^\d{4}:\d+$/);
/** PHONE_CONTACT_* (spec 026). */
const phoneContact = z.number().int().min(0).max(74);
const phoneLog = z.array(z.strictObject({ contact: phoneContact, direction: z.enum(["in", "out"]), at: z.iso.datetime() })).max(20);

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
const arenaTeam = z.array(arenaCombatant).min(1).max(6);
/**
 * The dev arena: the player's trainer and team against an NPC trainer (its id in the extraction, with a team of the
 * tester's choosing) or wild Pokémon with no trainer, fighting with the wild AI or standing still as targets.
 */
export const arenaSpec = z.strictObject({
  trainer: z.strictObject({ name: z.string().trim().min(1).max(PLAYER_NAME_MAX), character: z.enum(["male", "female"]) }),
  team: arenaTeam,
  foe: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("wild"), behavior: z.enum(["ai", "idle"]), team: arenaTeam }),
    z.strictObject({ kind: z.literal("trainer"), trainer: count(), team: arenaTeam }),
  ]),
  /** Protocol 39: an indoor map whose ring (item V.3) the arena is fought in; absent, the open field. */
  ring: count().optional(),
});
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

/** Spec 028.2: one side of a trade, party indices and bag items. */
export const tradeOffer = z.strictObject({
  party: z.array(z.number().int().min(0).max(5)).max(6),
  items: z.array(z.strictObject({ item: count(), count: z.number().int().min(1).max(999) })).max(20),
});
export type TradeOffer = z.infer<typeof tradeOffer>;
export const TRADE_PHASES = ["invited", "waiting", "open", "final", "done", "cancelled"] as const;
/** Spec 028.5: a duel's rules, chosen by who invites. `level`: the party as it is, or every member at level 50. */
export const duelRules = z.strictObject({ level: z.enum(["current", "50"]), team: z.number().int().min(1).max(6) });
export type DuelRules = z.infer<typeof duelRules>;
export const DUEL_PHASES = ["invited", "waiting", "fighting", "ended"] as const;
export const DUEL_RESULTS = ["won", "lost", "cancelled", "aborted"] as const;

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
    /** R.1: checked by the host's network socket before the hello reaches the session; the session ignores it. */
    roomPassword: z.string().max(64).optional(),
    arena: arenaSpec.optional(),
  }),
  z.strictObject({ type: z.literal("save-ack"), rev: count() }),
  playerInput.extend({ type: z.literal("input") }),
  z.strictObject({ type: z.literal("leave") }),
  /** Quick swap in combat (spec 014); ignored on cooldown, fainted, already out or outside combat. */
  z.strictObject({ type: z.literal("swap"), partyIndex: z.number().int().min(0).max(5) }),
  /** v37: the quick swap on the field: this member follows the trainer (and goes out first), the party order stays. */
  z.strictObject({ type: z.literal("set-follower"), partyIndex: z.number().int().min(0).max(5) }),
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
  /** "Estou preso" (spec 024): back to the last Pokémon Center or home; the server may refuse it. */
  z.strictObject({ type: z.literal("rescue") }),
  /** Moves a party member to another slot (spec 017); refused in combat or with a bad index. */
  z.strictObject({ type: z.literal("reorder-party"), from: z.number().int().min(0).max(5), to: z.number().int().min(0).max(5) }),
  /** Uses a bag item on a party member outside combat (spec 017); `moveIndex` is the move an Ether, PP Up or PP Max acts on (spec 027). */
  z.strictObject({ type: z.literal("use-item"), item: count(), partyIndex: z.number().int().min(0).max(5), moveIndex: z.number().int().min(0).max(3).optional() }),
  /** Spec 027: the trainer uses an item on the Pokémon out, in combat; it takes a while and then cools down. */
  z.strictObject({ type: z.literal("use-item-combat"), item: count() }),
  /** Spec 027: gives a party member a bag item to hold, or takes its item back to the bag with null. */
  z.strictObject({ type: z.literal("set-held"), partyIndex: z.number().int().min(0).max(5), item: count().nullable() }),
  /** Spec 027: the Berry Pots (item 470). */
  z.strictObject({ type: z.literal("berry-plant"), pot: z.number().int().min(0).max(3), item: count() }),
  z.strictObject({ type: z.literal("berry-harvest"), pot: z.number().int().min(0).max(3) }),
  /** Turns the AI debug overlay's data on or off for this client (spec 019); off on every connection. */
  z.strictObject({ type: z.literal("debugAi"), on: z.boolean() }),
  /** Answers the script request `id` (spec 020): 0 yes / 1 no, or the index picked; nothing for a plain confirm. */
  z.strictObject({
    type: z.literal("script-answer"),
    id: count(),
    answer: z.number().int().min(0).max(MENU_ITEMS_MAX).optional(),
    /** The name typed for a name request (spec 024). */
    text: z.string().max(PLAYER_NAME_MAX).optional(),
  }),
  /** The script debugger (spec 020); off on every connection. Flag changes only with it on, in development builds. */
  z.strictObject({ type: z.literal("debugScript"), on: z.boolean() }),
  z.strictObject({ type: z.literal("debugSetFlag"), flag: z.number().int().min(1).max(0xffff), on: z.boolean() }),
  /** Spec 024: development builds and the golden path only; moves the player to a tile of a map. */
  z.strictObject({ type: z.literal("debugWarp"), map: z.number().int().min(0).max(0xffff), tx: z.number().int().min(0), ty: z.number().int().min(0) }),
  /** Spec 024: development builds and the golden path only; every party member's HP, capped at its maximum. */
  z.strictObject({ type: z.literal("debugSetHp"), hp: z.number().int().min(1) }),
  /** Spec 025: interact with a field obstacle; the server answers with field-prompt when a move can clear it. */
  z.strictObject({ type: z.literal("field-interact"), objectId: count() }),
  /** Block H: an option around the person in front; the server checks the person is in reach and offers it (data.role). */
  z.strictObject({ type: z.literal("npc-action"), npcId: count(), action: z.enum(NPC_ACTIONS) }),
  /** Spec 025: use a field move by its key in content/field/moves.json; `objectId` is the obstacle it acts on. */
  z.strictObject({ type: z.literal("field-use"), move: z.string().regex(/^[a-z][A-Za-z]*$/), objectId: count().optional() }),
  z.strictObject({ type: z.literal("field-mount"), mode: z.enum(["bike", "surf"]) }),
  z.strictObject({ type: z.literal("field-dismount") }),
  z.strictObject({ type: z.literal("field-fish"), rod: z.enum(RODS) }),
  /** Reacts to a bite; only counts inside the reaction window. */
  z.strictObject({ type: z.literal("field-reel") }),
  z.strictObject({ type: z.literal("field-fly"), area: z.string().min(1) }),
  /** Spec 025: development builds and the golden path only, like debugWarp. */
  z.strictObject({ type: z.literal("debugGiveBadge"), badge: z.number().int().min(0).max(15) }),
  z.strictObject({ type: z.literal("debugTeachMove"), slot: z.number().int().min(0).max(5), move: z.number().int().min(1).max(0xffff) }),
  z.strictObject({ type: z.literal("debugGiveItem"), item: z.number().int().min(1).max(0xffff), count: z.number().int().min(1).max(999) }),
  /** Spec 027: development builds and the golden path only; a status on the Pokémon the player controls in combat. */
  z.strictObject({ type: z.literal("debugSetStatus"), status: z.enum(STATUS_IDS) }),
  /** Spec 026: development builds and the golden path only; changes the session's clock for every player. */
  z.strictObject({
    type: z.literal("debugSetClock"),
    clock: z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("host") }),
      z.strictObject({ mode: z.literal("fixed"), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59).optional(), weekday: z.number().int().min(0).max(6).optional() }),
      z.strictObject({ mode: z.literal("advance"), minutes: z.number().int().min(1).max(7 * 24 * 60) }),
    ]),
  }),
  /** The host picks the time of day the game runs from (it keeps running); null is the PC's clock. */
  z.strictObject({ type: z.literal("setClock"), minuteOfDay: z.number().int().min(0).max(1439).nullable() }),
  /** Spec 026: the Pokégear. A call to a registered number; answering a ringing call, `choice` for its question. */
  z.strictObject({ type: z.literal("phoneDial"), contact: phoneContact }),
  z.strictObject({ type: z.literal("phoneAnswer"), callId: count(), choice: z.number().int().min(0).max(3).optional() }),
  /** A radio show by its key in content/radio/channels.json; null turns the radio off. */
  z.strictObject({ type: z.literal("radioTune"), channel: z.string().regex(/^[a-z][A-Za-z]*$/).nullable() }),
  /** The player counts as in a menu while the Pokégear is open. */
  z.strictObject({ type: z.literal("gearOpen") }),
  z.strictObject({ type: z.literal("gearClose") }),
  /** Block H: the phone's Save app; the server sends a save at once (at most one a second). */
  z.strictObject({ type: z.literal("save-now") }),
  /** Block H: the Trainer Card app opened; the server answers with a fresh `trainer-card` (play time runs). */
  z.strictObject({ type: z.literal("trainer-card-request") }),
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
  /** Spec 028.2: a trade with a player nearby; the flow only, nothing changes hands yet. */
  z.strictObject({ type: z.literal("trade-propose"), to: count() }),
  z.strictObject({ type: z.literal("trade-answer"), accept: z.boolean() }),
  z.strictObject({ type: z.literal("trade-offer"), offer: tradeOffer }),
  z.strictObject({ type: z.literal("trade-confirm") }),
  z.strictObject({ type: z.literal("trade-cancel") }),
  /** Spec 028.5: a duel with a player nearby, in an arena of its own; nothing is won or lost. */
  z.strictObject({ type: z.literal("duel-invite"), to: count(), rules: duelRules }),
  z.strictObject({ type: z.literal("duel-answer"), accept: z.boolean() }),
  z.strictObject({ type: z.literal("duel-cancel") }),
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

export const REJECT_CODES = ["protocol-mismatch", "session-full", "session-closed", "invalid-save", "save-too-new", "name-taken", "invalid-message", "wrong-password"] as const;
export type RejectCode = (typeof REJECT_CODES)[number];

/** `no-escape` is the original's refusal in a trainer battle (spec 022). */
export const NOTICE_CODES = ["no-balls", "storage-full", "ball-returned", "menu-blocked", "action-refused", "item-unavailable", "no-escape", "launch-refused", "item-busy", "item-not-compatible", "bag-full", "not-ready", "repel-ended", "trade-far", "trade-busy"] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number];

export const CLOSE_REASONS =["host-left", "closed-by-host"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

/** "held" (spec 027): a held item acted; `item` says which, `amount` is the HP it gave back. */
export const HIT_KINDS = ["hit", "immune", "tick", "heal", "status", "stages", "failed", "held"] as const;
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
  /** Spec 027: the held item that acted. */
  item: count().optional(),
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
  /** Spec 024: BufferRivalsName; the server sends the name the save holds. */
  z.strictObject({ kind: z.literal("rival"), name: z.string().max(PLAYER_NAME_MAX) }),
  /** Spec 024: a name the server knows (a party nickname, the friend's name). */
  z.strictObject({ kind: z.literal("name"), name: z.string().min(1).max(PLAYER_NAME_MAX) }),
  /** Spec 024: the receive-item std script's item and pocket (POCKET_KEYS index). */
  z.strictObject({ kind: z.literal("item"), id: count() }),
  z.strictObject({ kind: z.literal("pocket"), id: z.number().int().min(0).max(7) }),
  /** Spec 026: a place by its MAPSEC (the map names bank), and a text by id (a phone contact's name). */
  z.strictObject({ kind: z.literal("place"), mapsec: z.number().int().min(0).max(0xffff) }),
  z.strictObject({ kind: z.literal("text"), text: textId }),
  /** Spec 027: a move by id (the move a TM teaches). */
  z.strictObject({ kind: z.literal("move"), id: count() }),
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
  z.strictObject({ kind: z.literal("menu"), items: z.array(textId).min(1).max(MENU_ITEMS_MAX), cancel: z.boolean(), buffers: z.record(z.string(), textBuffer) }),
  z.strictObject({ kind: z.literal("starter"), species: z.array(count()).min(1).max(6) }),
  /** Spec 024: NameRival, or NicknameInput for `species`; answered with script-answer `text`, empty to keep the default name. */
  z.strictObject({ kind: z.literal("name"), purpose: z.enum(["rival", "nickname"]), species: count().optional() }),
  z.strictObject({ kind: z.literal("wait-fade") }),
  z.strictObject({ kind: z.literal("wait-sound"), sound: scriptSound }),
  /** Spec 021: the client stages these steps and answers when they end; actors it controls stop following the server. */
  z.strictObject({ kind: z.literal("cutscene"), actors: z.array(cutsceneActor).max(16), steps: z.array(cutsceneStep).max(512) }),
  /** Spec 027: Kurt asks which apricorn colour to make into balls (ScrCmd_739); answered with the colour, 7 to cancel. */
  z.strictObject({ kind: z.literal("apricorn"), counts: z.array(count()).length(7) }),
  /** Spec 029: the Day Care asks which party member to leave (ScrCmd_551); answered with the slot, past the party to cancel. */
  z.strictObject({ kind: z.literal("party") }),
  /** Spec 029.4: the hatch animation (EggHatchAnim) for the species that hatched; answered when it ends. */
  z.strictObject({ kind: z.literal("hatch"), species: count() }),
]);
export type ScriptRequestMessage = z.infer<typeof scriptRequest>;

export const scriptEvent = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("close-msg") }),
  z.strictObject({ kind: z.literal("fade"), type: count(), color: count(), duration: count() }),
  z.strictObject({ kind: z.literal("sound"), sound: scriptSound, id: count() }),
  z.strictObject({ kind: z.literal("bgm"), id: count().nullable() }),
  z.strictObject({ kind: z.literal("bgm-reset") }),
  /** Spec 024: the map's script props (the starter balls), replacing any before; x, z in the map's units, its top-left corner 0. */
  z.strictObject({
    kind: z.literal("props"),
    area: z.string(),
    /** Spec 030.5: `pose`, the building in that animation pose (props/<model>-<pose>); absent, as extracted. */
    props: z.array(z.strictObject({ model: count(), x: z.number(), y: z.number(), z: z.number(), pose: z.number().int().min(0).max(7).optional() })).max(16),
  }),
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
  /** Block H: what the Trainer Card app shows; sent on joining, when money or badges change, and on request. */
  z.strictObject({
    type: z.literal("trainer-card"),
    name: saveSchema.shape.name,
    trainerId: saveSchema.shape.trainerId,
    money: saveSchema.shape.money,
    badgeSet: saveSchema.shape.badgeSet,
    playTimeMs: saveSchema.shape.playTimeMs,
    startedAt: saveSchema.shape.startedAt,
    /** Pokédex counts, and how many teams entered the Hall of Fame. */
    seen: count(),
    caught: count(),
    hallOfFame: count(),
  }),
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
          /** Spec 024: absent shows the species' name. */
          nickname: z.string().min(1).max(10).optional(),
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
          /** Experience at the start of the current level, for the HUD level bar. */
          expLevel: count().optional(),
          /** Spec 027: the item it holds, and the PP Ups on each move. */
          held: count().optional(),
          ppUps: z.array(z.number().int().min(0).max(3)).max(4).optional(),
          /** Spec 029.2: an egg; it is never sent out. */
          egg: z.literal(true).optional(),
        }),
      )
      .max(6),
    active: count().optional(),
    /** v37: the member following the trainer on the field (the one chosen with the quick swap, else the first able to fight). */
    lead: z.number().int().min(0).max(5).optional(),
  }),
  /** Who is in the session (v12), sent to everyone whenever someone joins or leaves. */
  z.strictObject({ type: z.literal("players"), players: z.array(z.strictObject({ id: count(), name: z.string().min(1).max(PLAYER_NAME_MAX), host: z.boolean(), area: z.string() })).max(4) }),
  z.strictObject({ type: z.literal("reaction"), companionId: count(), species: count(), emotion: z.enum(EMOTIONS), bank: count(), text: count() }),
  /** The Pokémon out fainted; `canContinue` is false when nobody is left (a blackout follows). */
  z.strictObject({ type: z.literal("fainted"), partyIndex: count(), canContinue: z.boolean() }),
  z.strictObject({ type: z.literal("blackout"), moneyLost: count(), area: z.string() }),
  z.strictObject({ type: z.literal("rescued") }),
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
    /** `file` is -1 for Prof. Oak's intro, a script with no file of its own. */
    at: z.strictObject({ file: z.number().int().min(-1), entry: count(), pc: count(), command: z.string(), depth: count() }).nullable(),
    flags: z.array(count()),
    vars: z.record(z.string(), count()),
    /** Spec 024: the current map's objects, the flag that hides each one and whether it shows now. */
    objects: z.array(z.strictObject({ id: count(), sprite: count(), hideFlag: count().nullable(), visible: z.boolean() })),
    /** Spec 024: the map's scripts and triggers, their condition as text and whether it holds now. */
    triggers: z.array(z.strictObject({ kind: z.enum(["mapScript", "trigger"]), script: z.string(), condition: z.string(), met: z.boolean() })),
    /** Spec 024: the latest flag and variable changes, oldest first; `script` is "file:entry" or "dev". */
    changes: z.array(z.strictObject({ tick: count(), kind: z.enum(["flag", "var"]), id: count(), value: count(), script: z.string() })).max(64),
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
  /** Block H: the nurse healed the party from the heal option, without her script. */
  z.strictObject({ type: z.literal("healed") }),
  /** The PC opened (spec 023); every answer carries the boxes and items as they are now; party and bag come in their own messages. */
  z.strictObject({ type: z.literal("pcOpen"), boxes: saveSchema.shape.boxes, pcItems: saveSchema.shape.pcItems }),
  z.strictObject({ type: z.literal("pcResult"), ok: z.boolean(), reason: z.enum(PC_REFUSALS).optional(), boxes: saveSchema.shape.boxes, pcItems: saveSchema.shape.pcItems }),
  z.strictObject({ type: z.literal("pcClose") }),
  /** Spec 028.2: the trade as this player sees it; `confirmed` resets whenever an offer changes. */
  z.strictObject({ type: z.literal("tradeState"), phase: z.enum(TRADE_PHASES), partner: count(), mine: tradeOffer, theirs: tradeOffer, confirmed: z.strictObject({ mine: z.boolean(), theirs: z.boolean() }) }),
  /** Spec 028.5: the duel as this player sees it; `arena` while fighting, `result` once ended. */
  z.strictObject({ type: z.literal("duelState"), phase: z.enum(DUEL_PHASES), partner: count(), rules: duelRules, arena: z.strictObject({ area: z.string(), x: z.number(), y: z.number(), radiusPx: z.number() }).optional(), result: z.enum(DUEL_RESULTS).optional() }),
  /** Spec 025: a field move can clear the obstacle; `user` is the party index that would use it. Answered with field-use. */
  z.strictObject({ type: z.literal("field-prompt"), move: z.string().regex(/^[a-z][A-Za-z]*$/), user: z.number().int().min(0).max(5), dialog: textId.optional() }),
  z.strictObject({ type: z.literal("field-result"), ok: z.boolean(), reason: z.enum(FIELD_REFUSALS).optional() }),
  /** Only to the player who cleared the obstacle (principle VII). */
  z.strictObject({ type: z.literal("field-removed"), objectId: count() }),
  z.strictObject({ type: z.literal("player-mode"), mode: z.enum(PLAYER_MODES) }),
  /** `windowMs` comes with the bite: the time left to react. */
  z.strictObject({ type: z.literal("field-fishing"), state: z.enum(["waiting", "bite", "hooked", "escaped"]), windowMs: count().optional() }),
  z.strictObject({ type: z.literal("field-fly-map"), points: z.array(z.strictObject({ area: z.string().min(1), flypoint: z.number().int().min(0).max(37) })) }),
  /** While surfing: which party members may be launched. */
  z.strictObject({ type: z.literal("field-launchable"), launchable: z.array(z.boolean()).max(6) }),
  z.strictObject({ type: z.literal("field-lit"), lit: z.boolean() }),
  /** Spec 027: this player's item use in combat (ticks of the server) and the Repel in effect; absent fields are none. */
  z.strictObject({ type: z.literal("items-state"), useEndsTick: count().optional(), cooldownUntilTick: count().optional(), repelEndsAt: z.iso.datetime().optional() }),
  /** Spec 027: the Dowsing MCHN, while it is on: bearing (0 north, clockwise) and closeness of the nearest hidden item; none in range without fields. */
  z.strictObject({ type: z.literal("dowse"), dir: z.number().int().min(0).max(359).optional(), near: z.number().min(0).max(1).optional() }),
  z.strictObject({ type: z.literal("berry-pots"), pots: z.array(z.strictObject({ berry: count(), stage: z.enum(BERRY_STAGES) }).nullable()).length(4) }),
  z.strictObject({ type: z.literal("apricorn-box"), counts: z.array(count()).length(7) }),
  /** Spec 027: an item that came to the bag without a script: the companion found it, or a Berry Pot gave it. */
  z.strictObject({ type: z.literal("item-found"), item: count(), count: z.number().int().min(1).max(999), source: z.enum(["companion", "berry"]) }),
  /** Spec 026: the session's clock, the same for every player; the client runs it on between messages. */
  z.strictObject({ type: z.literal("clock"), minuteOfDay: z.number().int().min(0).max(1439), weekday: z.number().int().min(0).max(6), fixed: z.boolean() }),
  /** Spec 026: a call, never while the player is busy; `choices` asks a question, answered with phoneAnswer. */
  z.strictObject({
    type: z.literal("phone-call"),
    callId: count(),
    contact: phoneContact,
    /** Message 0 of the contact's bank (GetPhoneBookEntryName). */
    name: textId,
    direction: z.enum(["in", "out"]),
    lines: z.array(textId).min(1).max(16),
    choices: z.array(textId).min(2).max(4).optional(),
    buffers: z.record(z.string(), textBuffer).optional(),
  }),
  /** `name`: message 0 of the contact's bank. */
  z.strictObject({ type: z.literal("phone-state"), contacts: z.array(z.strictObject({ id: phoneContact, name: textId, seeking: z.boolean() })).max(75), log: phoneLog }),
  /** The shows this place receives; `lines` is what the tuned one says now. */
  z.strictObject({
    type: z.literal("radio-state"),
    shows: z.array(z.strictObject({ id: z.string().regex(/^[a-z][A-Za-z]*$/), bank: count() })),
    tuned: z.string().regex(/^[a-z][A-Za-z]*$/).nullable(),
    lines: z.array(textId).max(64).optional(),
  }),
  /** The Pokégear map: places this player visited and where the others of the session are. */
  z.strictObject({
    type: z.literal("gear-map"),
    visited: z.array(z.string().min(1)),
    others: z.array(z.strictObject({ name: z.string().min(1).max(PLAYER_NAME_MAX), area: z.string().min(1), x: z.number().finite(), y: z.number().finite() })).max(3),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessage>;
export type StateMessage = Extract<ServerMessage, { type: "state" }>;

export function protocolMismatchMessage(server: number, client: number): string {
  return `Versão do protocolo incompatível: servidor ${server}, cliente ${client}. Atualize o jogo.`;
}
