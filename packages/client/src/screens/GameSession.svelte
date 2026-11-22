<script lang="ts">
  // The game screen: renderer, input, pause menu and the debug overlay (specs 010, 011 and 012);
  // the companion's reactions, the quick swap and the fight notices (spec 014); progression after a fight (spec 016);
  // the combat HUD, the dialog box, the full menu that never pauses the world and the busy mark (spec 017).
  import Button from "../ui/Button.svelte";
  import { CUTSCENE_TEXT_BOOST, PROTOCOL_VERSION } from "@soulsilver/shared";
  import { BUTTON, PLAYER_NAME_MAX, surfable, talkTile, tileAt, type CutsceneActor, type NpcAction, type CutsceneStep, type Entity, type PcSlot, type ServerMessage, type TickMetrics, type TradeOffer, type DuelRules, type WorldMap } from "@soulsilver/shared/game";
  import { POCKET_KEYS, type ItemRecord } from "@soulsilver/shared/game-data";
  import { formatText, parseTextId, screenText, textVariables } from "@soulsilver/shared/text";
  import { onMount, untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { audio, createAudioReactions } from "../audio";
  import { leadIndex } from "@soulsilver/shared/companion";
  import BattleOver from "../game/BattleOver.svelte";
  import CombatHud from "../game/CombatHud.svelte";
  import type { MenuPage } from "../game/menu-page";
  import MovePanel from "../game/MovePanel.svelte";
  import TrainerCall from "../game/TrainerCall.svelte";
  import NpcActions from "../hud/NpcActions.svelte";
  import { NPC_KEYS } from "../hud/npc-keys";
  import OnlinePanel from "../game/OnlinePanel.svelte";
  import TradePanel from "../game/TradePanel.svelte";
  import DuelPanel from "../game/DuelPanel.svelte";
  import { createDialogQueue } from "../game/dialog-queue";
  import DialogBox from "../game/DialogBox.svelte";
  import CallScreen from "../gear/CallScreen.svelte";
  import { regionView } from "../gear/region";
  import ScriptDebug from "../game/ScriptDebug.svelte";
  import Shop from "../game/Shop.svelte";
  import StarterChoice from "../game/StarterChoice.svelte";
  import HatchScene from "../game/HatchScene.svelte";
  import NameInput from "../game/NameInput.svelte";
  import PcPanel from "../game/PcPanel.svelte";
  import { BANK, bankTexts, itemRecords, moveTypes } from "../game/game-data";
  import PauseMenu from "../game/PauseMenu.svelte";
  import Minimap from "../hud/Minimap.svelte";
  import PartyStrip from "../hud/PartyStrip.svelte";
  import BallPicker from "../hud/BallPicker.svelte";
  import BallIcon from "../hud/BallIcon.svelte";
  import PhoneDex from "../hud/PhoneDex.svelte";
  import KeyHints from "../ui/KeyHints.svelte";
  import type { Action } from "@soulsilver/shared/input";
  import CaptureCutscene from "../game/CaptureCutscene.svelte";
  import { t, type MessageKey } from "../i18n";
  import { input } from "../input/app-input";
  import type { PlayRequest } from "../play-request";
  import ProgressionPrompt from "../game/ProgressionPrompt.svelte";
  import { createGameConnection, type GameStatus } from "../net/game-connection";
  import { TICK_MS } from "../net/prediction";
  import { MAP_TILE_PX } from "@soulsilver/shared/maps";
  import trainerTuning from "../../../../content/trainer/tuning.json";
  import fishingJson from "../../../../content/field/fishing.json";
  import movesJson from "../../../../content/field/moves.json";
  import spawnJson from "../../../../content/wild/spawn.json";
  import tintJson from "../../../../content/time/tint.json";
  import radioJson from "../../../../content/radio/channels.json";
  import { pokemonMusicLines } from "@soulsilver/shared/radio";
  import { daylight, tintAt } from "@soulsilver/shared/time";
  import { ballTarget, timeOfDay } from "@soulsilver/shared/wild";
  import FlyMap from "../game/FlyMap.svelte";
  import { overlayShapes, type OverlayShape } from "../render/ai-overlay";
  import { VIEW_W } from "../render/camera";
  import { createCombatFx } from "../render/combat-fx";
  import { createGameRenderer, SHAKE_MS, type DrawView } from "../render/game-renderer";
  import { actorKey, stage, type Pose } from "../render/cutscene";
  import { createClientWorld } from "../render/map-assets";
  import { currentSettings, saveSettings, settings } from "../settings";
  import SwapPicker from "../game/SwapPicker.svelte";
  import { cycleSwap } from "../game/swap-cycle";
  import { encounterTables } from "../game/game-data";
  import type { EncounterRecord } from "@soulsilver/shared/events";
  import ItemWheel from "../game/ItemWheel.svelte";
  import { useEffectOf, type ItemEffects } from "@soulsilver/shared/items";
  import itemEffectsJson from "../../../../content/items/effects.json";
  import Glyph from "../ui/Glyph.svelte";
  import { presenceText } from "../game/presence";

  let {
    play,
    onExit,
    onReconnect,
    onSwitch,
  }: {
    play: PlayRequest;
    onExit: () => void;
    onReconnect?: (() => Promise<string | undefined>) | undefined;
    /** Leaves this session, once its final save is written, for the host at `address`. */
    onSwitch?: ((address: string) => void) | undefined;
  } = $props();

  /** The "!" and approach timing the server uses (content/trainer/tuning.json, spec 022). */
  const TRAINER = trainerTuning.value;
  let menuOpen = $state(false);
  /** Block H: the Trainer Card app's contents, as the server last sent them. */
  let trainerCard = $state<Extract<ServerMessage, { type: "trainer-card" }> | undefined>();
  /** Block H: when this client last wrote a save to disk, for the Save app. */
  let lastSaved = $state<Date | undefined>();
  /** Block H: the minimap's map, level and entities, refreshed a few times a second from the draw loop. */
  let hereMap = $state<WorldMap | undefined>();
  let hereLevel = $state(0);
  /** The encounter table of the trainer's area, for the minimap's route species; `encounterArea` is the area it is for. */
  let hereEncounters = $state<EncounterRecord | undefined>();
  let encounterArea: string | undefined;
  let miniEntities = $state<Entity[]>([]);
  let selfEntity = $state<number | undefined>();
  let players = $state<{ id: number; name: string; host: boolean; area: string; place?: string }[]>([]);
  /** Counts "players" lists, so an older list's place names never land over a newer list. */
  let placesAsked = 0;
  /** What each player in view is doing (spec 028.1), by name; shortcut: names are unique within a session. */
  let doing = $state<Record<string, string>>({});
  let me = $state<number | undefined>();
  let mode = $state<"solo" | "host" | "guest" | "arena">(untrack(() => (play.arena ? "arena" : play.address ? "guest" : play.hosting ? "host" : "solo")));
  let addresses = $state<string[]>([]);
  let onlineBusy = $state(false);
  let onlineError = $state<string | undefined>();
  /** The host being switched to, while this session saves and closes. */
  let switchingTo = $state<string | undefined>();
  let switched = false;
  /** The app open on the Pokédex phone; undefined while the phone shows its home grid. */
  let page = $state<MenuPage | undefined>();
  let leaving = $state(false);
  let saveNote = $state<string | undefined>();
  let reconnectError = $state<string | undefined>();
  let reconnecting = $state(false);
  let status = $state<GameStatus>("connecting");
  let rejectMessage = $state<string | undefined>();
  let closeReason = $state<string | undefined>();
  let tick = $state(0);
  let metrics = $state<TickMetrics | undefined>();
  let fps = $state(0);
  let position = $state("—");
  let showDebug = $state(false);
  /** The AI debug overlay (spec 019), shown with the debug panel. */
  let aiShapes = $state<OverlayShape[]>([]);
  let audioStats = $state("—");
  let host: HTMLDivElement;

  const EMOTIONS: Record<string, string> = { exclaim: "!", question: "?", note: "♪", heart: "♥", sweat: "💧", angry: "💢", sleep: "💤" };
  type Member = Extract<ServerMessage, { type: "party" }>["members"][number];
  type ScriptRequestBuffer = Extract<Extract<ServerMessage, { type: "script" }>["request"], { kind: "say" }>["buffers"][string];
  let party = $state<Member[]>([]);
  let activeMember = $state<number | undefined>();
  /** v37: the member following the trainer on the field, as the server says (the quick swap picks it). */
  let fieldLead = $state<number | undefined>();
  let picker = $state<"closed" | "open" | "fainted">("closed");
  /** While surfing (spec 025): which members may be sent out; undefined on land. */
  let launchable = $state<boolean[] | undefined>();
  let surfing = false;
  /** On the bicycle; Fly's destinations while its map is open; Flash in this map (spec 025). */
  let riding = $state(false);
  let flyMap = $state<{ area: string; name: string }[] | undefined>();
  /** A key bound to both cancel and menu (rebinding allows it) emits one after the other: closing after both keeps the menu shut. */
  function closeFlyMap(): void {
    queueMicrotask(() => {
      flyMap = undefined;
    });
  }
  let lit = false;
  /** The map whose header said whether it is dark. */
  let darkArea: string | undefined;
  let darkMap = false;
  /** Only outdoor maps take the day tint (spec 026, FR-004); interiors and caves keep their colours. */
  let outdoorMap = false;
  let reaction = $state<string | undefined>();
  let notice = $state<string | undefined>();
  /** Protocol 47: the trainer battle was decided and is about to close. */
  let battleOver = $state<{ battleId: number; result: "won" | "lost" } | undefined>();
  /** The Pokégear's tabs in text (spec 026), from the server's gear-map, phone-state and radio-state. */
  let gear = $state<{ map: { here: string; visited: string[]; others: { name: string; place: string }[]; region: ReturnType<typeof regionView> }; phone: { contacts: { id: number; name: string; seeking: boolean }[]; log: { name: string; direction: "in" | "out"; at: string }[] }; radio: { stations: { id: string; title: string }[]; tuned: string | null; lines: string[] } }>({
    map: { here: "", visited: [], others: [], region: regionView([], []) },
    phone: { contacts: [], log: [] },
    radio: { stations: [], tuned: null, lines: [] },
  });
  /** The player's own area and position, as last drawn. */
  let selfArea = "";
  let selfAt = { x: 0, y: 0 };
  let gearClock = $state<{ minuteOfDay: number; weekday: number } | undefined>();
  const textOf = async (id: string) => (await scriptPages(id, {})).join(" ");
  /** Every line of a radio show's bank, in order: the show's original text (spec 026, FR-013). */
  async function showLines(bank: number): Promise<string[]> {
    const texts = await bankTexts(bank);
    return [...texts.keys()].sort((a, b) => a - b).map((i) => screenText((texts.get(i) ?? "").replace(/{[^}]*}/g, " ")).trim()).filter((l) => l !== "");
  }
  /** A Pokégear call on screen (spec 026): who, and whether they called or were called. */
  let call = $state<{ name: string; direction: "in" | "out" } | undefined>();
  async function phoneCall(ev: Extract<ServerMessage, { type: "phone-call" }>): Promise<void> {
    const buffers = ev.buffers ?? {};
    call = { name: (await scriptPages(ev.name, buffers)).join(" "), direction: ev.direction };
    let last: string[] = [];
    for (const line of ev.lines) {
      last = await scriptPages(line, buffers);
      await dialog.say(last);
    }
    // A question (Mom's savings, spec 026): the choices come up under the last line; backing out picks the last one.
    let choice: number | undefined;
    if (ev.choices) {
      const labels = await Promise.all(ev.choices.map(async (id) => (await scriptPages(id, buffers)).join(" ")));
      const picked = await dialog.choose(last.slice(-1), labels);
      choice = picked < 0 ? labels.length - 1 : picked;
    }
    call = undefined;
    window.soulSilver.sendGame({ type: "phoneAnswer", callId: ev.callId, ...(choice === undefined ? {} : { choice }) });
  }
  /** Marks over entities: who is in a fight or busy in a menu, and the companion's emotion bubble. */
  /** `capture`: a knocked-out wild one, with the button that throws a ball under its mark. */
  let marks = $state<{ key: string; x: number; y: number; text: string; capture?: boolean }[]>([]);
  /** Block H: the person a talk reaches now and the options they offer, over their head. */
  let npcOptions = $state<{ id: number; x: number; y: number; actions: readonly NpcAction[] } | undefined>();
  const pickNpc = (action: NpcAction) => npcOptions && window.soulSilver.sendGame({ type: "npc-action", npcId: npcOptions.id, action });
  /** The trainer that spotted this player (spec 022): its "!" and its walk are drawn here only, the server never moves it. */
  let approach: { npcId: number; start: number; tiles: number } | undefined;
  /** Trainer battle arenas on this player's map, by battle id; drawn as rings on the ground. */
  const arenas = new SvelteMap<number, { area: string; x: number; y: number; radiusPx: number }>();
  let arenaRings = $state<{ key: number; cx: number; cy: number; rx: number; ry: number }[]>([]);
  /** A trainer line (bank 728); trainer lines may name the player through buffer 0. */
  const trainerLine = async (text: string) => dialog.say(await scriptPages(text, { 0: { kind: "player" } }));
  /** HP and action bars over the foes while fighting: wild ones and other players' Pokémon (spec 017, PvP). */
  let bars = $state<{ key: string; x: number; y: number; fraction: number; scared: boolean }[]>([]);
  let bosses = $state<{ key: string; name: string; level: number; hp: number; hpMax: number }[]>([]);
  /** Block C: the mark around a CPU Pokémon charging a move or just parried, and combo counters. */
  let warnings = $state<{ key: string; x: number; y: number; mark: "normal" | "special" | "parried"; zoom: number }[]>([]);
  let combos = $state<{ key: string; x: number; y: number; count: number }[]>([]);
  /** A trainer calling out the last move seen in the fight (bottom-left), until `until`. */
  let moveCall = $state<{ key: number; pic: number; move: string; until: number } | undefined>();
  /** Each combatant's move use count last seen, to notice a new use. */
  let usesSeen: Record<number, number> = {};
  const CALL_MS = 1500;
  /** content/wild/spawn.json throwRangeTiles. shortcut: fixed here like SHAKE_MS; send it to the client if it is ever tuned. */
  const THROW_RANGE_PX = 6 * MAP_TILE_PX;
  /** The Pokémon under the player's control, for the HUD. */
  let hudSelf = $state<Entity | undefined>();
  /** The player controls a Pokémon: a fight is on. */
  let inCombat = $state(false);
  /** The controls legend above the Pokédex: field or combat actions, labelled by their settings names. */
  const legend = $derived(
    ((inCombat ? ["dash", "recall", "items", "throw", "picker", "swapNext"] : ["interact", "run", "combat", "throw", "rod", "menu"]) as Action[]).map((a) => ({ actions: [a], label: t(`action.${a}`) })),
  );
  /** Recall from the picker: the next input carries the recall bit. */
  let recallOnce = false;

  // Text banks and game data from the extraction (spec 017); names fall back to the id.
  let texts = $state<Record<string, Map<number, string>>>({});
  const name = (bank: keyof typeof BANK) => (id: number) => texts[bank]?.get(id) ?? `#${id}`;
  const speciesName = $derived(name("species"));
  const moveName = $derived(name("moves"));
  const itemName = $derived(name("items"));
  const names = $derived({ species: speciesName, move: moveName, item: itemName, nature: name("natures"), ability: name("abilities") });
  let items = $state<Map<number, ItemRecord>>(new Map());
  let types = $state<Map<number, string>>(new Map());

  // Spec 015: the bag, the ball the next throw uses, and the capture lines. The bag message carries the whole bag (spec 017).
  // The save the session started from; the server's messages take over from there.
  let bag = $state<{ item: number; count: number }[]>(untrack(() => play.save.bag.map((b) => ({ ...b }))));
  let selectedBall = $state<number | undefined>();
  /** The capture cutscene: from our throw at a wild Pokémon; `result` once the ball hit (the server's shakes). */
  let captureScene = $state<{ key: number; species: number; result: { shakes: number; caught: boolean } | undefined } | undefined>();
  let dex = $state(untrack(() => ({ seen: [...play.save.pokedex.seen], caught: [...play.save.pokedex.caught] })));
  let captureLine = $state<string | undefined>();
  const balls = $derived(bag.filter((b) => items.get(b.item)?.pocket === "balls"));
  /** The ball the next throw uses, as the server picks it; unset with no balls. */
  const throwBall = $derived((balls.find((b) => b.item === selectedBall) ?? balls[0])?.item);
  /** Asks the server for the ball `step` kinds away from the one the next throw uses (the first when unset or gone). */
  function stepBall(step: 1 | -1): void {
    if (balls.length < 2) return;
    const at = Math.max(0, balls.findIndex((b) => b.item === selectedBall));
    window.soulSilver.sendGame({ type: "select-ball", item: balls[(at + step + balls.length) % balls.length]!.item });
  }
  // Spec 027: the quick item selector, the trainer's item in use, the Dowsing MCHN, the Berry Pots and the Apricorn Box.
  const ITEM_EFFECTS = (itemEffectsJson as { value: ItemEffects }).value;
  const COMBAT_USES = new Set(["heal", "revive", "cure", "pp-ether", "battle-stat"]);
  const combatChoices = $derived(bag.filter((b) => {
    const record = items.get(b.item);
    return record !== undefined && COMBAT_USES.has(useEffectOf(record, ITEM_EFFECTS)?.archetype ?? "");
  }));
  let wheel = $state<{ open: boolean; index: number; idleAt: number }>({ open: false, index: 0, idleAt: 0 });
  let itemUse = $state<{ item: number | undefined; endsTick?: number | undefined; cooldownTick?: number | undefined; cooldownFrom: number }>({ item: undefined, cooldownFrom: 0 });
  let dowsing = $state<{ dir: number; near: number } | undefined>();
  let berryPots = $state<Extract<ServerMessage, { type: "berry-pots" }>["pots"] | undefined>();
  let apricornBox = $state<number[] | undefined>(untrack(() => [...(play.save.apricorns ?? [0, 0, 0, 0, 0, 0, 0])]));
  const RED_APRICORN = 485;
  // Spec 016: the head of the progression queue, sent only out of combat.
  let progression = $state<Extract<ServerMessage, { type: "progression" }> | undefined>();
  /** The Poké Mart a clerk opened (spec 023), and the last refusal shown in it. */
  /** The starter scene a script waits on (spec 024). */
  let starter = $state<{ id: number; species: number[] } | undefined>();
  /** The hatch animation a script waits on (spec 029.4), and what ends it. */
  let hatching = $state<{ species: number; done: () => void } | undefined>();
  /** "{species} hatched from the Egg!", in the hatch common script's bank. */
  const HATCHED_TEXT = "0040:63";
  /** A naming screen a script waits on (spec 024). */
  let naming = $state<{ id: number; title: string; max: number; keep: string } | undefined>();
  let shop = $state<Extract<ServerMessage, { type: "shopOpen" }> | undefined>();
  let shopRefused = $state<string | undefined>();
  /** The Pokémon PC's boxes while it is open (spec 023), and the last refusal. */
  let pcBoxes = $state<Extract<ServerMessage, { type: "pcOpen" }>["boxes"] | undefined>();
  let pcItems = $state<Extract<ServerMessage, { type: "pcOpen" }>["pcItems"]>([]);
  /** Spec 028.2: the trade this player is in, until its screen is closed. */
  let trade = $state<Extract<ServerMessage, { type: "tradeState" }> | undefined>();
  /** Spec 028.5: the duel invitation, wait or result; the fight itself needs no panel. */
  let duel = $state<Extract<ServerMessage, { type: "duelState" }> | undefined>();
  let pcRefused = $state<string | undefined>();
  function answer(msg: { type: "progression-ack" } | { type: "learn-answer"; forget: number | null } | { type: "evolve-answer"; accept: boolean }): void {
    progression = undefined;
    window.soulSilver.sendGame(msg);
  }

  const dialog = createDialogQueue();
  let dialogOpen = $state(false);

  // Spec 020: what this player's scripts ask for; the server runs them.
  let scriptLocked = $state(false);
  let scriptDebug = $state<Extract<ServerMessage, { type: "script-debug" }> | undefined>();
  /** The last message's pages: a question shows them again with Yes/No under them. */
  let lastSay: string[] = [];
  const setScriptFlag = (flag: number, on: boolean) => window.soulSilver.sendGame({ type: "debugSetFlag", flag, on });
  const answerScript = (id: number, answer?: number) => window.soulSilver.sendGame({ type: "script-answer", id, ...(answer === undefined ? {} : { answer }) });

  /** A script message in pages, its buffers filled in; the raw id when the bank is missing. */
  async function scriptPages(text: string, buffers: Record<string, ScriptRequestBuffer>): Promise<string[]> {
    const { bank, index } = parseTextId(text);
    const raw = (await bankTexts(bank)).get(index);
    if (raw === undefined) return [text];
    const values: Record<string, string | number> = {};
    // Spec 026: places by MAPSEC and texts by id (a phone contact's name) are looked up first.
    const places = Object.values(buffers).some((b) => b.kind === "place") ? await bankTexts(BANK.mapNames) : undefined;
    const texts = new SvelteMap<string, string>();
    for (const b of Object.values(buffers)) if (b.kind === "text" && !texts.has(b.text)) texts.set(b.text, (await scriptPages(b.text, {})).join(" "));
    for (const key of textVariables(raw)) {
      const b = buffers[key.split(":")[1] ?? ""];
      values[key] = !b
        ? ""
        : b.kind === "player"
          ? play.save.name
          : b.kind === "species"
            ? speciesName(b.id)
            : b.kind === "rival" || b.kind === "name"
              ? b.name
              : b.kind === "item"
                ? itemName(b.id)
                : b.kind === "move"
                  ? moveName(b.id)
                : b.kind === "pocket"
                  ? t(`pocket.${POCKET_KEYS[b.id] ?? "items"}`)
                  : b.kind === "place"
                    ? screenText(places?.get(b.mapsec) ?? "")
                    : b.kind === "text"
                      ? (texts.get(b.text) ?? "")
                      : b.value;
    }
    try {
      // Original messages end with a page break; the empty page after it would wait for one more confirm.
      const pages = formatText(raw, values, text).split("{page}").map(screenText).filter((p) => p.trim() !== "");
      return pages.length > 0 ? pages : [""];
    } catch (error) {
      console.warn(`[game] Script text ${text}: ${(error as Error).message}`);
      return [screenText(raw)];
    }
  }

  /** The cutscene this client stages (spec 021): start poses by actor, and the entity each actor draws. */
  let scene: { id: number; steps: CutsceneStep[]; start: Map<string, Pose>; ids: Map<string, number>; t0: number } | undefined;
  /** Asked for, begun on the next frame from what is drawn then. */
  let nextScene: { id: number; actors: CutsceneActor[]; steps: CutsceneStep[] } | undefined;

  function beginScene({ id, actors, steps }: NonNullable<typeof nextScene>, view: DrawView, playerId: number | undefined, now: number): void {
    const all = view.self ? [view.self, ...view.others] : view.others;
    const start = new SvelteMap<string, Pose>();
    const ids = new SvelteMap<string, number>();
    for (const a of actors) {
      const e = a === "player" ? view.self : a === "companion" ? all.find((o) => o.kind === "pokemon" && o.data["owner"] === String(playerId)) : all.find((o) => o.kind === "npc" && o.data["person"] === a.person);
      if (!e) continue;
      // The server puts the player on their tile's center as a script starts; the scene starts there too.
      const onGrid = (v: number) => (a === "player" ? Math.floor(v / MAP_TILE_PX) * MAP_TILE_PX + MAP_TILE_PX / 2 : v);
      start.set(actorKey(a), { x: onGrid(e.x), y: onGrid(e.y), facing: e.facing, visible: true, moving: false });
      ids.set(actorKey(a), e.id);
    }
    if (view.self && !start.has("player")) start.set("player", { x: Math.floor(view.self.x / MAP_TILE_PX) * MAP_TILE_PX + MAP_TILE_PX / 2, y: Math.floor(view.self.y / MAP_TILE_PX) * MAP_TILE_PX + MAP_TILE_PX / 2, facing: view.self.facing, visible: true, moving: false });
    scene = { id, steps, start, ids, t0: now };
  }

  /** Draws the cutscene's poses over what the server sends; answers once the last step ended. */
  function staged(view: DrawView, now: number, playerId: number | undefined): DrawView {
    if (nextScene) {
      // From what is drawn: a scene right after another starts where the last one ended.
      beginScene(nextScene, holding(view, now), playerId, now);
      nextScene = undefined;
      held = undefined;
    }
    if (!scene) return holding(view, now);
    const s = stage(scene.steps, scene.start, now - scene.t0);
    const byId = new Map([...scene.ids].map(([k, id]) => [id, s.poses.get(k)!]));
    if (s.done) {
      answerScript(scene.id);
      scene = undefined;
      held = { poses: byId, since: now };
    }
    const pose = (e: Entity) => {
      const p = byId.get(e.id);
      return p ? { ...e, x: p.x, y: p.y, facing: p.facing } : e;
    };
    const shownNow = (e: Entity) => byId.get(e.id)?.visible !== false;
    return { self: view.self && pose(view.self), others: view.others.filter(shownNow).map(pose), focus: s.done ? undefined : s.focus };
  }

  /** A scene's end poses, drawn until the server's positions catch up, so nobody jumps back for a tick. */
  let held: { poses: Map<number, Pose>; since: number } | undefined;
  const HOLD_MS = 1000;

  function holding(view: DrawView, now: number): DrawView {
    if (!held) return view;
    const h = held;
    const pose = (e: Entity) => {
      const p = h.poses.get(e.id);
      if (!p) return e;
      if (Math.abs(e.x - p.x) < 1 && Math.abs(e.y - p.y) < 1) {
        h.poses.delete(e.id);
        return e;
      }
      return { ...e, x: p.x, y: p.y, facing: p.facing };
    };
    const out = { ...view, self: view.self && pose(view.self), others: view.others.map(pose) };
    if (h.poses.size === 0 || now - h.since > HOLD_MS) held = undefined;
    return out;
  }

  async function scriptRequest(ev: Extract<ServerMessage, { type: "script" }>): Promise<void> {
    const r = ev.request;
    switch (r.kind) {
      case "cutscene":
        nextScene = { id: ev.id, actors: r.actors, steps: r.steps };
        return;
      case "say":
        lastSay = await scriptPages(r.text, r.buffers);
        await dialog.say(lastSay);
        answerScript(ev.id);
        return;
      case "yes-no":
        answerScript(ev.id, (await dialog.ask(lastSay.slice(-1))) ? 0 : 1);
        return;
      case "menu": {
        // The list comes up under the last message, as in the original; a cancel answers past the end.
        const labels = await Promise.all(r.items.map(async (id) => (await scriptPages(id, r.buffers)).join(" ")));
        const picked = await dialog.choose(lastSay.slice(-1), labels);
        // shortcut: B also backs out of menus the original does not let you cancel; make the box ignore it when one matters.
        answerScript(ev.id, picked < 0 ? r.items.length : picked);
        return;
      }
      case "starter":
        starter = { id: ev.id, species: r.species };
        return;
      case "name":
        naming = { id: ev.id, max: r.purpose === "rival" ? PLAYER_NAME_MAX : 10, title: r.purpose === "rival" ? t("name.rival") : t("name.nickname", { name: speciesName(r.species ?? 0) }), keep: t(r.purpose === "rival" ? "name.default" : "name.keep") };
        return;
      case "apricorn": {
        // Kurt (spec 027): the colours in the box, with their count; a cancel answers 7.
        const colours = r.counts.flatMap((n, i) => (n > 0 ? [i] : []));
        const picked = await dialog.choose([t("kurt.choose")], colours.map((i) => `${itemName(RED_APRICORN + i)} ×${r.counts[i]}`));
        answerScript(ev.id, picked < 0 ? 7 : colours[picked]!);
        return;
      }
      case "party": {
        // The Day Care (spec 029): which member to leave; a cancel answers past the party.
        // shortcut: a list under the last message stands in for the party screen; open PartyMenu in a pick mode when the Day Care gets its layer 4 pass.
        const picked = await dialog.choose(lastSay.slice(-1), party.map((m) => (m.egg ? t("party.egg") : `${m.nickname ?? speciesName(m.species)} Lv. ${m.level}`)));
        answerScript(ev.id, picked < 0 ? party.length : picked);
        return;
      }
      case "hatch": {
        await new Promise<void>((done) => (hatching = { species: r.species, done }));
        await dialog.say(await scriptPages(HATCHED_TEXT, { 0: { kind: "species", id: r.species } }));
        hatching = undefined;
        answerScript(ev.id);
        return;
      }
      case "wait-fade":
      case "wait-sound":
        // shortcut: script fades and sounds are not drawn or played yet, so their waits end at once; answer when they finish once the audio and fade layers take script cues.
        answerScript(ev.id);
        return;
    }
  }

  function showNotice(text: string, ms = 3500): void {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = undefined), ms);
  }
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Opening and closing the full menu tells the server, so the others see the player as busy. */
  function setMenu(open: boolean, to?: MenuPage): void {
    if (open && inCombat) {
      showNotice(t("notice.menu-blocked"));
      return;
    }
    const wasGear = page === "gear";
    page = open ? to : undefined;
    // The Pokégear counts as a menu on the server and brings its tabs (spec 026).
    if (page === "gear" && !wasGear) window.soulSilver.sendGame({ type: "gearOpen" });
    else if (wasGear && page !== "gear") window.soulSilver.sendGame({ type: "gearClose" });
    if (open === menuOpen) return;
    menuOpen = open;
    window.soulSilver.sendGame({ type: "menu", open });
  }

  /** Development builds: the dialog of SC-004, with the player's name and a yes/no question. */
  async function dialogTest(): Promise<void> {
    const raw = (await bankTexts(BANK.dialogTest)).get(21);
    if (!raw) return;
    const pages = formatText(raw, { "trainer-name:0": play.save.name }).split("{page}").map(screenText);
    const yes = await dialog.ask(pages);
    await dialog.say([t(yes ? "dialogTest.yes" : "dialogTest.no")]);
  }

  onMount(() => {
    const api = window.soulSilver;
    const log = (message: string) => console.warn(`[game] ${message}`);
    const world = createClientWorld(log);
    const game = createGameConnection({
      save: $state.snapshot(play.save),
      protocolVersion: PROTOCOL_VERSION,
      send: (msg) => api.sendGame(msg),
      world: world.lookup,
      log,
      arena: play.arena ? $state.snapshot(play.arena) : undefined,
    });
    let running = false;
    const renderer = createGameRenderer(host, world, log);
    const fx = createCombatFx(host, (x, y) => renderer.project(x, y), log);
    const night = () => {
      const c = game.clockAt(performance.now());
      return c !== undefined && timeOfDay(Math.floor(c.minuteOfDay / 60), spawnJson.value.timeBands) === "night";
    };
    const sounds = createAudioReactions({ playerId: () => game.playerId, header: (area) => world.header(area), world: world.lookup, night });
    let shown: Entity[] = [];
    /** Block H: when the minimap was last refreshed. */
    let miniAt = 0;
    const MINIMAP_MS = 200;
    for (const bank of ["species", "items", "moves", "natures", "abilities"] as const) void bankTexts(BANK[bank]).then((m) => (texts = { ...texts, [bank]: m }));
    void itemRecords().then((m) => (items = m));
    void moveTypes().then((m) => (types = m));
    let captureTimers: ReturnType<typeof setTimeout>[] = [];
    /** Shows the lines one after the other, SHAKE_MS apart; a new capture replaces them. */
    function captureLines(lines: string[]): void {
      for (const timer of captureTimers) clearTimeout(timer);
      captureTimers = lines.map((line, i) => setTimeout(() => (captureLine = line), i * SHAKE_MS));
      captureTimers.push(setTimeout(() => (captureLine = undefined), lines.length * SHAKE_MS + 2000));
    }
    let emotion: { id: number; text: string; until: number } | undefined;
    let reactionTimer: ReturnType<typeof setTimeout> | undefined;
    let pickerHeld = false;
    let swapNextHeld = false;
    let nextBallHeld = false;
    let throwHeld = false;
    /** The wild Pokémon a ball thrown now would home in on (the draw loop keeps it). */
    let aimedWild: Entity | undefined;
    let interactHeld = false;
    let rodHeld = false;
    /** The items action (spec 027): when it went down, to tell a tap (next item) from a hold (use it). */
    let itemsDownAt: number | undefined;
    const ITEMS_HOLD_MS = 400;
    const WHEEL_IDLE_MS = 4000;
    /** The line in the water (spec 025): the server says when it bites. */
    let fishing: "waiting" | "bite" | undefined;
    /** The best rod in the bag. */
    const bestRod = () => (["super", "good", "old"] as const).find((rod) => bag.some((b) => b.item === fishingJson.value.rods[rod].item));
    /** Interact at the water's edge asks to surf, and on the water facing land to get off (spec 025); the server decides. */
    function fieldEdge(): void {
      const self = game.view(performance.now()).self;
      if (!self) return;
      const [dx, dy] = ({ north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const)[self.facing];
      const ahead = tileAt(world.lookup, self.area, self.level, self.x + dx * MAP_TILE_PX, self.y + dy * MAP_TILE_PX);
      if (!surfing && surfable(ahead)) api.sendGame({ type: "field-mount", mode: "surf" });
      else if (surfing && ahead && !["water", "blocked", "ledge"].includes(ahead.category)) api.sendGame({ type: "field-dismount" });
    }
    /** Screen point above a standing sprite: 40 px north of its feet on the ground. */
    const over = (e: Entity) => renderer.project(e.x, e.y, 40);
    /** Where a cast's mark sits: its arc rises from the middle of the sprite, under the HP bar. */
    const around = (e: Entity) => {
      const at = renderer.project(e.x, e.y, 14);
      return { ...at, zoom: (renderer.project(e.x, e.y).y - at.y) / 14 };
    };
    /** A map's place name, from its header's MAPSEC; the map id when it has none. */
    const placeName = async (area: string) => {
      const h = await world.header(area);
      return screenText((await bankTexts(BANK.mapNames)).get(h?.mapsec ?? -1) ?? area);
    };
    /** A player's name with their presence (spec 028.1), or "busy" for the rest of what holds them (a trainer's approach). */
    const nameTag = (e: Entity) => {
      const doing = presenceText(e.data["presence"]) ?? (e.data["busy"] === true ? t("game.busy") : undefined);
      return doing ? `${String(e.data["name"])} · ${doing}` : String(e.data["name"]);
    };

    function companionEvents(now: number): void {
      for (const ev of game.takeCompanionEvents()) {
        sounds.companion(ev);
        if (ev.type === "party") {
          party = ev.members;
          activeMember = ev.active;
          fieldLead = ev.lead;
        } else if (ev.type === "players") {
          players = ev.players;
          me = game.playerId;
          // Spec 028.1: each player's place by name, once the map headers are read; a newer list wins.
          const list = ev.players;
          const asked = ++placesAsked;
          void Promise.all(list.map((p) => placeName(p.area))).then((names) => {
            if (asked === placesAsked) players = list.map((p, i) => ({ ...p, place: names[i] ?? p.area }));
          });
        } else if (ev.type === "reaction") {
          emotion = { id: ev.companionId, text: EMOTIONS[ev.emotion] ?? "", until: now + 2000 };
          void bankTexts(ev.bank).then((bank) => {
            const raw = bank.get(ev.text);
            if (!raw) return;
            try {
              reaction = screenText(formatText(raw, { "pokemon-name:0": speciesName(ev.species) }));
            } catch (error) {
              log(`Reaction text ${ev.bank}/${ev.text}: ${(error as Error).message}`);
              return;
            }
            clearTimeout(reactionTimer);
            reactionTimer = setTimeout(() => (reaction = undefined), 3500);
          });
        } else if (ev.type === "script") {
          void scriptRequest(ev);
        } else if (ev.type === "phone-call") {
          void phoneCall(ev);
        } else if (ev.type === "script-lock") {
          scriptLocked = ev.locked;
          if (!ev.locked) sounds.scriptEnded();
        } else if (ev.type === "script-debug") {
          scriptDebug = ev;
        } else if (ev.type === "script-event") {
          if (ev.event.kind === "props") renderer.setProps(ev.event.area, ev.event.props);
          else if (ev.event.kind === "bgm") sounds.scriptMusic(ev.event.id);
          else if (ev.event.kind === "bgm-reset") sounds.scriptMusic(undefined);
          // The text box closes on its own once confirmed; fades and sounds wait for the shortcut in scriptRequest.
        } else if (ev.type === "fainted") {
          if (ev.canContinue) picker = "fainted";
        } else if (ev.type === "bag") {
          bag = ev.items;
          selectedBall = ev.selected;
        } else if (ev.type === "items-state") {
          if (ev.useEndsTick === undefined && itemUse.endsTick !== undefined) itemUse = { ...itemUse, item: undefined };
          itemUse = { ...itemUse, endsTick: ev.useEndsTick, cooldownTick: ev.cooldownUntilTick, cooldownFrom: ev.cooldownUntilTick !== itemUse.cooldownTick ? tick : itemUse.cooldownFrom };
        } else if (ev.type === "dowse") {
          dowsing = ev.dir === undefined ? undefined : { dir: ev.dir, near: ev.near ?? 0 };
        } else if (ev.type === "berry-pots") {
          berryPots = ev.pots;
        } else if (ev.type === "trainer-card") {
          trainerCard = ev;
        } else if (ev.type === "apricorn-box") {
          apricornBox = ev.counts;
        } else if (ev.type === "item-found") {
          const lead = party[leadIndex(party) ?? -1];
          captureLines([ev.source === "companion" ? t("found.companion", { name: lead ? (lead.nickname ?? speciesName(lead.species)) : t("capture.yourPokemon"), item: itemName(ev.item) }) : t("found.berry", { count: ev.count, item: itemName(ev.item) })]);
        } else if (ev.type === "pokedex") {
          dex = { seen: ev.seen, caught: ev.caught };
        } else if (ev.type === "capture") {
          renderer.capture(ev.wildId, ev.shakes, now, ev.caught);
          // Our ball: the cutscene started on the throw gets its shakes; one aimed elsewhere starts its own.
          if (ev.player === game.playerId) {
            const result = { shakes: ev.shakes, caught: ev.caught };
            if (captureScene && !captureScene.result) captureScene = { ...captureScene, result };
            else captureScene = { key: now, species: Number(shown.find((e) => e.id === ev.wildId)?.data["species"] ?? 0), result };
          }
          const shakes = Array.from({ length: ev.shakes }, (_, i) => t("capture.shake", { dots: "●".repeat(i + 1) }));
          captureLines([t("capture.hit"), ...shakes, ev.caught ? t("capture.caught") : t("capture.escaped")]);
        } else if (ev.type === "captured") {
          captureLines([t(ev.to === "party" ? "capture.toParty" : "capture.toStorage", { name: speciesName(ev.species) })]);
        } else if (ev.type === "notice") {
          // No balls, storage full, ball returned: the throw the capture cutscene waits on is not coming.
          if (captureScene && !captureScene.result) captureScene = undefined;
          captureLines([t(`notice.${ev.code}` as MessageKey)]);
        } else if (ev.type === "exp-gain") {
          const m = party[ev.partyIndex];
          captureLines([t("capture.exp", { name: m ? (m.nickname ?? speciesName(m.species)) : t("capture.yourPokemon"), amount: ev.amount })]);
        } else if (ev.type === "progression") {
          progression = ev;
        } else if (ev.type === "trainerSpotted") {
          approach = { npcId: ev.npcId, start: now, tiles: ev.tiles };
          // The challenge line once the trainer stands in front of the player.
          const intro = ev.intro;
          // The battle waits for the player to close it (as in the original).
          if (intro) setTimeout(() => void trainerLine(intro).then(() => api.sendGame({ type: "trainer-ready" })), TRAINER.alertS * 1000 + ev.tiles * TRAINER.approachSPerTile * 1000);
        } else if (ev.type === "trainerSay") {
          void trainerLine(ev.text);
        } else if (ev.type === "trainerItem") {
          captureLines([t("trainer.item")]);
        } else if (ev.type === "trainerBattleStart") {
          arenas.set(ev.battleId, ev.arena);
        } else if (ev.type === "trainerBattleOver") {
          battleOver = ev;
        } else if (ev.type === "trainerBattleEnd") {
          arenas.delete(ev.battleId);
          if (battleOver?.battleId === ev.battleId) battleOver = undefined;
          approach = undefined;
          // Only the winner gets the trainer's line and the prize; the others just see the arena go.
          const prize = ev.prize;
          if (ev.defeat)
            void trainerLine(ev.defeat).then(() => {
              if (prize !== undefined) captureLines([t("trainer.won", { money: prize })]);
              // The arena's Gym Leader waits for the line to close before challenging.
              if (play.arena) api.sendGame({ type: "trainer-ready" });
            });
          else if (prize !== undefined) captureLines([t("trainer.won", { money: prize })]);
        } else if (ev.type === "healed") {
          captureLines([t("npc.healed")]);
        } else if (ev.type === "shopOpen") {
          shop = ev;
        } else if (ev.type === "shopResult") {
          shopRefused = ev.ok ? undefined : t(`shop.refused.${ev.reason ?? "invalid"}` as MessageKey);
          if (shop) shop = { ...shop, money: ev.money };
        } else if (ev.type === "duelState") {
          duel = ev;
        } else if (ev.type === "tradeState") {
          trade = ev;
        } else if (ev.type === "pcOpen") {
          pcBoxes = ev.boxes;
          pcItems = ev.pcItems;
        } else if (ev.type === "pcResult") {
          pcBoxes = ev.boxes;
          pcItems = ev.pcItems;
          pcRefused = ev.ok ? undefined : t(`pc.refused.${ev.reason ?? "invalid"}` as MessageKey);
        } else if (ev.type === "pcClose") {
          pcBoxes = undefined;
          pcRefused = undefined;
        } else if (ev.type === "shopClose") {
          shop = undefined;
          shopRefused = undefined;
        } else if (ev.type === "rescued") {
          // The script may have been cut short: nothing it left on screen waits for an answer now.
          dialog.clear();
          scene = undefined;
          nextScene = undefined;
          held = undefined;
          starter = undefined;
          naming = undefined;
          setMenu(false);
          showNotice(t("game.rescued"));
        } else if (ev.type === "trainerSendOut") {
          // Drawn from the entities in the state messages.
        } else if (ev.type === "player-mode") {
          surfing = ev.mode === "surf";
          riding = ev.mode === "bike";
          if (!surfing) launchable = undefined;
        } else if (ev.type === "field-launchable") {
          launchable = ev.launchable;
        } else if (ev.type === "field-fly-map") {
          const points = ev.points;
          void Promise.all(points.map((p) => world.header(p.area))).then(async (headers) => {
            const names = await bankTexts(BANK.mapNames);
            flyMap = points.map((p, i) => ({ area: p.area, name: screenText(names.get(headers[i]?.mapsec ?? -1) ?? p.area) }));
          });
        } else if (ev.type === "gear-map") {
          const place = placeName;
          // The region map draws the overworld (matrix 0) maps; a player indoors is listed but not drawn.
          const OVERWORLD = 0;
          const on = async (area: string) => {
            const e = await world.extent(area);
            return e?.matrix === OVERWORLD ? e : undefined;
          };
          const areas = [...new Set([selfArea, ...ev.visited, ...ev.others.map((o) => o.area)])];
          const at = { area: selfArea, ...selfAt };
          void Promise.all([place(selfArea), Promise.all(ev.visited.map(place)), Promise.all(ev.others.map(async (o) => ({ name: o.name, place: await place(o.area) }))), Promise.all(areas.map(async (a) => ({ area: a, name: await place(a), extent: await on(a) })))]).then(([here, visited, others, maps]) => {
            const extentOf = (area: string) => maps.find((m) => m.area === area)?.extent;
            const placesOn = maps.flatMap((m) => (m.extent ? [{ name: m.name, extent: m.extent, here: m.area === at.area }] : []));
            const players = [{ name: play.save.name, area: at.area, x: at.x, y: at.y, self: true }, ...ev.others.map((o) => ({ name: o.name, area: o.area, x: o.x, y: o.y, self: false }))].flatMap((p) => {
              const extent = extentOf(p.area);
              return extent ? [{ name: p.name, extent, x: p.x, y: p.y, self: p.self }] : [];
            });
            gear.map = { here, visited: [...new Set(visited)], others, region: regionView(placesOn, players) };
          });
        } else if (ev.type === "phone-state") {
          void Promise.all(ev.contacts.map(async (c) => ({ id: c.id, name: await textOf(c.name), seeking: c.seeking }))).then((contacts) => {
            gear.phone = { contacts, log: ev.log.map((l) => ({ name: contacts.find((c) => c.id === l.contact)?.name ?? String(l.contact), direction: l.direction, at: l.at })) };
          });
        } else if (ev.type === "radio-state") {
          const showOf = (bank: number) => radioJson.value.shows.find((x) => x.bank === bank)?.id ?? "";
          const stations = ev.shows.map((st) => ({ id: st.id, title: t(`radio.show.${showOf(st.bank)}` as MessageKey) }));
          const bank = ev.shows.find((st) => st.id === ev.tuned)?.bank;
          // Pokémon Music says the day's line (pokemon_music.c); the other shows are listed in their bank's order.
          const now = game.clockAt(performance.now());
          const music = bank !== undefined && showOf(bank) === "pokemonMusic" && now ? pokemonMusicLines(now.weekday, { gbSounds: bag.some((b) => b.item === 502), nationalDex: false }) : undefined;
          const read = bank === undefined ? Promise.resolve([]) : music ? Promise.all(music.map((i) => textOf(`${String(bank).padStart(4, "0")}:${i}`))) : showLines(bank);
          void read.then((lines) => {
            gear.radio = { stations, tuned: ev.tuned, lines };
          });
        } else if (ev.type === "field-lit") {
          lit = ev.lit;
        } else if (ev.type === "field-fishing") {
          fishing = ev.state === "waiting" || ev.state === "bite" ? ev.state : undefined;
          if (ev.state !== "waiting") captureLines([t(`fishing.${ev.state}`)]);
        } else if (ev.type === "field-result") {
          if (!ev.ok) captureLines([t(`field.refused.${ev.reason ?? "notAllowed"}` as MessageKey)]);
        } else {
          picker = "closed";
          showNotice(t("game.blackout", { money: ev.moneyLost }), 5000);
        }
      }
    }


    const unsubscribeMessage = api.onGameMessage((msg) => game.receive(msg, performance.now()));
    const unsubscribeClosed = api.onGameClosed(() => {
      game.disconnected();
      if (leaving && !switchingTo) onExit();
    });
    let noteTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribeSaved = api.onGameSaved((result) => {
      saveNote = result.ok ? t("game.saved") : t("game.saveFailed", { reason: result.reason });
      if (result.ok) lastSaved = new Date();
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => (saveNote = undefined), 2500);
      // The final save is on disk: the slot can be loaded for the next session.
      if (switchingTo) switchNow();
    });
    // The main process opened the connection before this screen.
    game.start();

    // Block C: presses of combat buttons go out (and show) at once; the input timer only catches the releases.
    const COMBAT_BITS = 0b1111 | BUTTON.dash | BUTTON.guard;
    let pressedBits = 0;
    const inputBlocked = () => menuOpen || dialogOpen || scriptLocked || flyMap !== undefined;
    const sendPresses = () => {
      const bits = inputBlocked() || !inCombat ? 0 : input.buttons() & COMBAT_BITS;
      const down = bits & ~pressedBits;
      pressedBits = bits;
      if (down !== 0) game.press(down, input.read().move, performance.now());
    };
    const offPress = input.onAction(sendPresses);

    // The menu action opens the full menu; once open, the menu screens take the input.
    const offAction = input.onAction((action) => {
      if (action === "menu" && !menuOpen && (!dialogOpen || scriptLocked) && picker === "closed" && flyMap === undefined && !shop && !progression && status === "playing") setMenu(true);
      // Block H: moves 2 and 3 pick the options after talk; interact (talk) goes to the server with the input, as ever.
      if ((action === "move2" || action === "move3") && npcOptions) {
        const picked = npcOptions.actions[NPC_KEYS.indexOf(action)];
        if (picked) pickNpc(picked);
      }
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        showDebug = !showDebug;
        api.sendGame({ type: "debugAi", on: showDebug });
        api.sendGame({ type: "debugScript", on: showDebug });
        if (!showDebug) {
          aiShapes = [];
          scriptDebug = undefined;
        }
        event.preventDefault();
      } else if (event.key === "F11") {
        void saveSettings({ fullscreen: !currentSettings().fullscreen });
        event.preventDefault();
      } else if (event.key === "F4" && import.meta.env.MODE === "development") {
        void dialogTest();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const inputTimer = setInterval(() => {
      // Menus, the text box and a running script take the input; the world keeps going without it (FR-012).
      const blocked = inputBlocked();
      sendPresses();
      const read = input.read();
      const move = blocked ? { x: 0, y: 0 } : read.move;
      const run = !blocked && read.run;
      running = run;
      let buttons = blocked ? 0 : input.buttons();
      // Interacting needs no menu, swap picker or dialog open (FR-011); cutscenes do not exist yet.
      // In combat A is move 1: it must not also talk to whoever stands ahead.
      if (picker !== "closed" || reaction || progression || inCombat) buttons &= ~BUTTON.interact;
      const interactNow = (buttons & BUTTON.interact) !== 0;
      const rodNow = !blocked && input.held("rod");
      // Interact or the rod button reels in; the rod button casts the best rod at the water ahead.
      if (((interactNow && !interactHeld) || (rodNow && !rodHeld)) && fishing) api.sendGame({ type: "field-reel" });
      else if (interactNow && !interactHeld && !inCombat) fieldEdge();
      else if (rodNow && !rodHeld && !inCombat) {
        const rod = bestRod();
        if (rod) api.sendGame({ type: "field-fish", rod });
        else captureLines([t("fishing.noRod")]);
      }
      interactHeld = interactNow;
      rodHeld = rodNow;
      // The press that reels in talks to nobody.
      if (fishing) buttons &= ~BUTTON.interact;
      if (recallOnce) {
        buttons |= BUTTON.recall;
        recallOnce = false;
      }
      // Quick swap: Q (picker) to the previous member, E (swapNext) to the next. In combat it is sent out (the
      // server keeps the cooldown); on the field the party rotates so it leads and follows the trainer.
      const pickerNow = !blocked && input.held("picker");
      const swapNextNow = !blocked && input.held("swapNext");
      const quickSwap = (dir: 1 | -1) => {
        const i = inCombat ? cycleSwap(party, activeMember, dir, launchable) : cycleSwap(party, fieldLead ?? leadIndex(party), dir);
        // Nobody else able to fight (the rest fainted, or eggs): say so instead of doing nothing.
        if (i === undefined) captureLines([t("swap.none")]);
        else api.sendGame(inCombat ? { type: "swap", partyIndex: i } : { type: "set-follower", partyIndex: i });
      };
      if (picker === "closed" && !progression && !fishing) {
        if (pickerNow && !pickerHeld) quickSwap(-1);
        else if (swapNextNow && !swapNextHeld) quickSwap(1);
      }
      pickerHeld = pickerNow;
      swapNextHeld = swapNextNow;
      const nextBallNow = !blocked && input.held("nextBall");
      if (nextBallNow && !nextBallHeld) stepBall(1);
      nextBallHeld = nextBallNow;
      const itemsNow = !blocked && inCombat && input.held("items");
      const clock = performance.now();
      if (itemsNow && itemsDownAt === undefined) itemsDownAt = clock;
      if (itemsNow && itemsDownAt !== undefined && wheel.open && clock - itemsDownAt >= ITEMS_HOLD_MS) {
        const choice = combatChoices[wheel.index];
        if (choice) {
          api.sendGame({ type: "use-item-combat", item: choice.item });
          itemUse = { ...itemUse, item: choice.item };
        }
        itemsDownAt = Number.POSITIVE_INFINITY;
        wheel = { ...wheel, idleAt: clock };
      }
      if (!itemsNow && itemsDownAt !== undefined) {
        if (Number.isFinite(itemsDownAt)) wheel = wheel.open ? { ...wheel, index: (wheel.index + 1) % Math.max(1, combatChoices.length), idleAt: clock } : { open: true, index: 0, idleAt: clock };
        itemsDownAt = undefined;
      }
      if (wheel.open && (!inCombat || (itemsDownAt === undefined && clock - wheel.idleAt > WHEEL_IDLE_MS))) wheel = { ...wheel, open: false };
      if (picker !== "closed" || progression) buttons &= ~(BUTTON.throw | BUTTON.combat);
      // No aim: the server aims every move and ball at the nearest foe.
      const throwNow = (buttons & BUTTON.throw) !== 0;
      if (throwNow && !throwHeld && !captureScene && aimedWild) captureScene = { key: performance.now(), species: Number(aimedWild.data["species"]), result: undefined };
      throwHeld = throwNow;
      game.sendInput(move, run, performance.now(), buttons);
    }, TICK_MS);

    let frames = 0;
    let fpsSince = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      let view = game.view(now);
      // The spotting trainer walks up to the player, tile by tile, after its "!".
      const walker = approach && view.self ? view.others.find((e) => e.id === approach!.npcId) : undefined;
      if (approach && walker && view.self) {
        const dx = view.self.x - walker.x;
        const dy = view.self.y - walker.y;
        const d = Math.hypot(dx, dy);
        const walked = Math.min(approach.tiles, Math.max(0, (now - approach.start - TRAINER.alertS * 1000) / (TRAINER.approachSPerTile * 1000))) * MAP_TILE_PX;
        if (d > 0.01) view = { ...view, others: view.others.map((e) => (e === walker ? { ...e, x: e.x + (dx / d) * walked, y: e.y + (dy / d) * walked } : e)) };
      }
      view = staged(view, now, game.playerId);
      renderer.draw(view, running, now);
      shown = view.self ? [view.self, ...view.others] : view.others;
      const events = game.takeCombatEvents();
      renderer.combatEvents(events, now);
      fx.show(events, (id) => shown.find((e) => e.id === id), now);
      fx.update(now);
      companionEvents(now);
      dialogOpen = dialog.view() !== undefined;
      inCombat = view.self?.kind === "pokemon";
      sounds.frame(view, events, inCombat, { x: view.self?.x ?? 0, y: view.self?.y ?? 0, halfWidthPx: VIEW_W / 2 });
      // A fight closes the menu (FR-013); the server already cleared the busy mark.
      if (inCombat && menuOpen) {
        menuOpen = false;
        page = undefined;
      }
      if (!inCombat && picker !== "closed") picker = "closed";
      hudSelf = view.self?.kind === "pokemon" ? view.self : undefined;
      const fighting = hudSelf !== undefined;
      // Block H: scared (😨) while a stat stage is lowered, until knocked out: beside a foe's bars, else over the Pokémon.
      const lowered = (e: Entity) => e.data["hp"] !== 0 && Object.entries(e.data).some(([k, v]) => k.startsWith("stg_") && Number(v) < 0);
      const foes = fighting ? shown.filter((e) => e.kind === "pokemon" && e.data["owner"] !== hudSelf!.data["owner"] && Number(e.data["hpMax"] ?? 0) > 0 && e.data["hp"] !== 0) : [];
      const nextBosses = foes.filter((e) => e.data["boss"] === true).map((e) => ({ key: `boss-${e.id}`, name: speciesName(Number(e.data["species"])), level: Number(e.data["level"]), hp: Number(e.data["hp"]), hpMax: Number(e.data["hpMax"]) }));
      if (nextBosses.length > 0 || bosses.length > 0) bosses = nextBosses;
      const nextBars = foes.filter((e) => e.data["boss"] !== true).map((e) => ({ key: `hp-${e.id}`, ...over(e), fraction: Number(e.data["hp"]) / Number(e.data["hpMax"]), scared: lowered(e) }));
      if (nextBars.length > 0 || bars.length > 0) bars = nextBars;
      // Block C: the server marks the casts to warn about (CPU Pokémon, not self-buffs) and counts the combos.
      const nextWarnings: typeof warnings = fighting
        ? shown.flatMap((e) => {
            // The newest state: the 100 ms the others are shown late would eat the parry window.
            const mark = (game.latest(e.id) ?? e.data)["castMark"];
            return e.kind === "pokemon" && e.data["hp"] !== 0 && (mark === "normal" || mark === "special" || mark === "parried") ? [{ key: `warn-${e.id}`, ...around(e), mark }] : [];
          })
        : [];
      if (nextWarnings.length > 0 || warnings.length > 0) warnings = nextWarnings;
      const nextCombos = fighting ? shown.filter((e) => e.kind === "pokemon" && e.data["hp"] !== 0 && Number(e.data["combo"] ?? 0) > 1).map((e) => ({ key: `combo-${e.id}`, ...over(e), count: Number(e.data["combo"]) })) : [];
      if (nextCombos.length > 0 || combos.length > 0) combos = nextCombos;
      const barred = new Set(nextBars.map((b) => b.key));
      // A trainer's Pokémon (the player's or an NPC trainer's) used a move: the trainer calls it out.
      const fighters = fighting ? shown.filter((e) => e.kind === "pokemon" && typeof e.data["trainerPic"] === "number") : [];
      for (const e of fighters) {
        const used = Number(e.data["used"] ?? 0);
        const before = usesSeen[e.id];
        if (before !== undefined && used > before) moveCall = { key: now, pic: Number(e.data["trainerPic"]), move: moveName(Number(e.data["usedMove"])), until: now + CALL_MS };
      }
      usesSeen = Object.fromEntries(fighters.map((e) => [e.id, Number(e.data["used"] ?? 0)]));
      if (moveCall && (now > moveCall.until || !fighting)) moveCall = undefined;
      const nextMarks: typeof marks = shown.filter((e) => e.data["inCombat"] === true).map((e) => ({ key: `fight-${e.id}`, ...over(e), text: "⚔" }));
      // Spec 028.1: every other player's name, above the other marks, with what the server says they are doing.
      for (const e of shown) if (e.kind === "player" && e.id !== game.entityId) nextMarks.push({ key: `name-${e.id}`, ...renderer.project(e.x, e.y, 56), text: nameTag(e) });
      // A wild Pokémon that just noticed someone (spec 019, Alert state), or a trainer that spotted this player (spec 022).
      for (const e of shown) if (e.data["alert"] === true) nextMarks.push({ key: `alert-${e.id}`, ...over(e), text: "!" });
      const spotter = approach && now - approach.start < TRAINER.alertS * 1000 ? shown.find((e) => e.id === approach!.npcId) : undefined;
      if (spotter) nextMarks.push({ key: `alert-${spotter.id}`, ...over(spotter), text: "!" });
      const here = view.self?.area;
      const nextRings = [...arenas].filter(([, a]) => a.area === here).map(([key, a]) => {
        const c = renderer.project(a.x, a.y);
        const ex = renderer.project(a.x + a.radiusPx, a.y);
        const ey = renderer.project(a.x, a.y + a.radiusPx);
        return { key, cx: c.x, cy: c.y, rx: Math.abs(ex.x - c.x), ry: Math.abs(ey.y - c.y) };
      });
      if (nextRings.length > 0 || arenaRings.length > 0) arenaRings = nextRings;
      // Knocked out, waiting for a Poké Ball. The throw hint goes only over the one the ball would home in on (the
      // server's rule, from whoever throws: the active Pokémon in a fight, else the player).
      const wildsShown = shown.filter((e) => e.data["owner"] === "wild");
      const aimed = view.self && balls.length > 0 ? ballTarget(view.self, wildsShown, THROW_RANGE_PX) : undefined;
      aimedWild = aimed;
      for (const e of wildsShown) if (e.data["hp"] === 0) nextMarks.push({ key: `ko-${e.id}`, ...over(e), text: t("game.knockedOut"), capture: e === aimed });
      const bubbleOver = emotion && now < emotion.until ? shown.find((e) => e.id === emotion!.id) : undefined;
      for (const e of shown) if (e.kind === "pokemon" && !barred.has(`hp-${e.id}`) && lowered(e)) nextMarks.push({ key: `debuff-${e.id}`, ...over(e), text: "😨" });
      // Block C: dazed (💫) while a parry's stun lasts, over the HP bar of those that show one.
      for (const e of shown) if (e.kind === "pokemon" && e.data["stun"] === true && e.data["hp"] !== 0) nextMarks.push({ key: `stun-${e.id}`, ...renderer.project(e.x, e.y, barred.has(`hp-${e.id}`) ? 46 : 40), text: "💫" });
      if (bubbleOver && emotion) nextMarks.push({ key: "emotion", ...over(bubbleOver), text: emotion.text });
      if (fishing && view.self) nextMarks.push({ key: "fishing", ...over(view.self), text: fishing === "bite" ? "!" : "…" });
      if (nextMarks.length > 0 || marks.length > 0) marks = nextMarks;
      // Block H: the options around the person a talk reaches, while the trainer walks free.
      const selfNow = view.self;
      const free = selfNow?.kind === "player" && status === "playing" && !menuOpen && !dialogOpen && !scriptLocked && picker === "closed" && !progression && flyMap === undefined && !fishing;
      const front = free && selfNow ? talkTile(world.lookup, selfNow) : undefined;
      const person = front && view.others.find((e) => e.kind === "npc" && e.area === selfNow!.area && Math.floor(e.x / MAP_TILE_PX) === front.x && Math.floor(e.y / MAP_TILE_PX) === front.y);
      const role = person?.data["role"];
      const nextOptions = person && role !== "none" ? { id: person.id, ...over(person), actions: role === "battle" ? (["battle"] as const) : role === "shop" ? (["talk", "shop", "sell"] as const) : role === "heal" ? (["talk", "heal"] as const) : (["talk"] as const) } : undefined;
      if (nextOptions?.id !== npcOptions?.id || nextOptions?.x !== npcOptions?.x || nextOptions?.y !== npcOptions?.y) npcOptions = nextOptions;
      const nextDoing: Record<string, string> = {};
      for (const e of shown) if (e.kind === "player" && e.id !== game.entityId) {
        const text = presenceText(e.data["presence"]) ?? (e.data["busy"] === true ? t("game.busy") : undefined);
        if (text) nextDoing[String(e.data["name"])] = text;
      }
      if (JSON.stringify(nextDoing) !== JSON.stringify(doing)) doing = nextDoing;
      if (view.self && view.self.area !== darkArea) {
        const area = (darkArea = view.self.area);
        // The last map's values hold until the header arrives: reset, the tint, fog and sky effects went off for a
        // few frames at every border and the screen flashed. Warps change them under their black fade.
        void world.header(area).then((h) => {
          if (darkArea !== area) return;
          darkMap = movesJson.value.darkWeather.includes(h?.weather ?? -1);
          outdoorMap = h?.areaType === "outdoor";
        });
      }
      renderer.setDark(darkMap && !lit);
      renderer.setVisual(currentSettings().visual, outdoorMap);
      const clock = game.clockAt(now);
      if (page === "clock" && clock) gearClock = { minuteOfDay: Math.floor(clock.minuteOfDay), weekday: clock.weekday };
      const tint = outdoorMap && clock ? tintAt(clock.minuteOfDay, spawnJson.value.timeBands, tintJson.value) : null;
      renderer.setTint(tint);
      renderer.setDaylight(tint ? daylight(tint, tintJson.value) : 0);
      const self = view.self;
      if (self) {
        selfArea = self.area;
        selfAt = { x: self.x, y: self.y };
      }
      // Block H: the minimap, five times a second; the trainer's own area and level, also while a Pokémon is out.
      if (now - miniAt >= MINIMAP_MS) {
        miniAt = now;
        const trainer = shown.find((e) => e.id === game.entityId) ?? self;
        hereMap = trainer ? world.lookup(trainer.area) : undefined;
        hereLevel = trainer?.level ?? 0;
        // The route's species come from the map header's encounter table; looked up again only on a new area.
        if (trainer && trainer.area !== encounterArea) {
          const area = trainer.area;
          encounterArea = area;
          void Promise.all([world.header(area), encounterTables()]).then(([h, tables]) => {
            if (encounterArea === area) hereEncounters = h?.refs.encounters == null ? undefined : tables.get(h.refs.encounters);
          });
        }
        selfEntity = game.entityId;
        miniEntities = shown;
      }
      position = self ? t("debug.position", { area: self.area, x: Math.round(self.x), y: Math.round(self.y), level: self.level }) : "—";
      status = game.status;
      rejectMessage = game.rejectMessage;
      closeReason = game.closeReason;
      tick = game.tick;
      if (showDebug) {
        const a = audio.stats();
        audioStats = t("debug.audio", { music: a.music ?? "—", voices: a.voices, state: a.state });
        aiShapes = overlayShapes(game.aiDebug, (id) => shown.find((e) => e.id === id), (x, y) => renderer.project(x, y));
      }
      metrics = game.metrics;
      frames++;
      if (now - fpsSince >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsSince));
        frames = 0;
        fpsSince = now;
      }
      frame = requestAnimationFrame(draw);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(inputTimer);
      window.removeEventListener("keydown", onKeyDown);
      offAction();
      offPress();
      fx.destroy();
      renderer.destroy();
      unsubscribeMessage();
      unsubscribeClosed();
      unsubscribeSaved();
      clearTimeout(noteTimer);
      clearTimeout(reactionTimer);
      clearTimeout(noticeTimer);
      for (const timer of captureTimers) clearTimeout(timer);
    };
  });

  function leave(): void {
    leaving = true;
    window.soulSilver.sendGame({ type: "leave" });
    // The server answers with the final save and closes; do not wait forever.
    setTimeout(onExit, 4000);
  }

  async function openLan(): Promise<void> {
    onlineBusy = true;
    onlineError = undefined;
    const result = await window.soulSilver.openToLan();
    onlineBusy = false;
    if (!result.ok) {
      onlineError = result.reason;
      return;
    }
    mode = "host";
    addresses = result.addresses;
  }

  function joinOther(address: string): void {
    if (!onSwitch || switchingTo) return;
    switchingTo = address;
    onlineBusy = true;
    onlineError = undefined;
    leaving = true;
    window.soulSilver.sendGame({ type: "leave" });
    // The final save may never come; do not wait forever.
    setTimeout(switchNow, 4000);
  }

  function switchNow(): void {
    if (!switchingTo || switched) return;
    switched = true;
    onSwitch?.(switchingTo);
  }

  async function reconnect(): Promise<void> {
    reconnecting = true;
    reconnectError = await onReconnect?.();
    reconnecting = false;
  }

  // Below a boss's bar.
  const DIALOG = $derived(["absolute left-1/2 -translate-x-1/2 w-[min(90%,32rem)] m-0 px-4 py-3 bg-surface-overlay text-primary border-3 border-frame rounded-[6px] whitespace-pre-line z-3", bosses.length > 0 ? "top-20" : "top-4"]);
  const MESSAGE = "absolute left-1/2 top-1/2 -translate-1/2 m-0 text-primary z-5";

  /** The Pokémon out: under control in a fight, else the one following the trainer. */
  const out = $derived(hudSelf ? activeMember : (fieldLead ?? leadIndex(party)));
  /** Block H: apps that cannot open now; the Online app needs a running session. */
  const appsOff = $derived<MenuPage[]>(status === "playing" ? [] : ["online", "save"]);

  const REASONS: Record<string, MessageKey> = { "host-left": "game.hostLeft", "closed-by-host": "game.closedByHost", disconnected: "game.disconnected" };
</script>

{#snippet onlinePanel()}
  <OnlinePanel {mode} {players} {doing} {me} address={play.address} {addresses} busy={onlineBusy || status !== "playing"} error={switchingTo ? t("online.switching") : onlineError} onOpen={() => void openLan()} onJoin={joinOther} onTrade={(to: number) => window.soulSilver.sendGame({ type: "trade-propose", to })} onDuel={(to: number, rules: DuelRules) => window.soulSilver.sendGame({ type: "duel-invite", to, rules })} />
{/snippet}

{#snippet phoneApp(p: MenuPage)}
  <PauseMenu
    page={p}
    {party}
    {bag}
    {items}
    {dex}
    {names}
    {riding}
    pots={berryPots}
    apricorns={apricornBox}
    clock={{ now: gearClock, canSet: mode !== "guest", onSet: (minuteOfDay: number | null) => window.soulSilver.sendGame({ type: "setClock", minuteOfDay }) }}
    gear={{ ...gear, onDial: (contact: number) => window.soulSilver.sendGame({ type: "phoneDial", contact }), onTune: (channel: string | null) => window.soulSilver.sendGame({ type: "radioTune", channel }) }}
    card={trainerCard}
    savedAt={lastSaved}
    {leaving}
    online={onlinePanel}
    onField={(msg) => { setMenu(false); window.soulSilver.sendGame(msg); }}
    onPage={(next: MenuPage | undefined) => setMenu(true, next)}
    onLeave={leave}
  />
{/snippet}

<!-- Block H: one screen. The world fills the window; the team, the minimap and the Pokédex phone sit over it. -->
<section class="fixed inset-0 overflow-hidden bg-dex-screen font-screen" class:crt={$settings.crt} aria-label={t("game.label")}>
  <div class="absolute inset-0 overflow-hidden" bind:this={host}></div>

  {#if status === "rejected"}
    <div class="{MESSAGE} grid gap-2 justify-items-center">
      <p class="text-danger font-bold" role="alert">{rejectMessage}</p>
      <Button onclick={onExit}>{t("game.backToMenu")}</Button>
    </div>
  {:else if status === "closed"}
    <div class="{MESSAGE} grid gap-2 justify-items-center">
      <p role="status">{t(REASONS[closeReason ?? ""] ?? "game.closed")}</p>
      {#if reconnectError}<p class="text-danger font-bold" role="alert">{reconnectError}</p>{/if}
      {#if onReconnect && closeReason === "disconnected"}
        <Button disabled={reconnecting} onclick={() => void reconnect()}>{t("game.reconnect")}</Button>
      {/if}
      <Button onclick={onExit}>{t("game.backToMenu")}</Button>
    </div>
  {:else if status === "connecting"}
    <p class={MESSAGE} role="status">{t("game.connecting")}</p>
  {/if}

  {#if npcOptions}<NpcActions x={npcOptions.x} y={npcOptions.y} actions={npcOptions.actions} onPick={pickNpc} />{/if}

  {#each marks as m (m.key)}
    <!-- A lone glyph ("!", "…", "⚔", an emotion) is drawn large: in the screen's pixel font it is otherwise a few pixels tall. -->
    <span class={["absolute -translate-x-1/2 -translate-y-full text-primary font-bold [text-shadow:0_1px_2px_#000] pointer-events-none z-1 grid justify-items-center", [...m.text].length <= 2 ? "text-3xl" : "text-lg"]} style:left="{m.x}px" style:top="{m.y}px" aria-hidden="true">
      {m.text}
      {#if m.capture}
        <!-- Hangs under the name so the mark keeps its place over the sprite. -->
        <span class="absolute left-1/2 top-full -translate-x-1/2 flex items-center gap-1 text-xl">
          <!-- With no ball the key is crossed out: the throw is unavailable. -->
          <span class="relative inline-grid place-items-center"><Glyph action="throw" round />{#if throwBall === undefined}<span class="absolute inset-0 grid place-items-center text-[#ff3030] text-xl leading-none [text-shadow:0_0_2px_#000]">✕</span>{/if}</span>
          <BallIcon item={throwBall} />
        </span>
      {/if}
    </span>
  {/each}
  {#if arenaRings.length > 0}
    <svg class="absolute inset-0 w-full h-full pointer-events-none z-1" aria-hidden="true">
      {#each arenaRings as r (r.key)}
        <ellipse class="fill-[rgb(255_80_80/8%)] stroke-[rgb(255_80_80/70%)] [stroke-width:2] [stroke-dasharray:6_4]" cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} />
      {/each}
    </svg>
  {/if}
  {#if showDebug && aiShapes.length > 0}
    <svg class="absolute inset-0 w-full h-full pointer-events-none z-1 [font:10px_monospace]" aria-label={t("debug.ai")}>
      {#each aiShapes as s (s.key)}
        <polygon class="fill-[rgb(255_220_0/15%)] stroke-[rgb(255_220_0/60%)]" points={s.cone} />
        <circle class="fill-none stroke-[rgb(0_200_255/60%)] [stroke-dasharray:4_3]" cx={s.zone.cx} cy={s.zone.cy} r={s.zone.r} />
        {#if s.lastSeen}<circle class="fill-[#f44]" cx={s.lastSeen.x} cy={s.lastSeen.y} r="4" />{/if}
        <text class="fill-white [paint-order:stroke] stroke-black stroke-2 whitespace-pre" x={s.label.x} y={s.label.y}>
          {#each s.label.lines as line, i (i)}<tspan x={s.label.x} dy={i === 0 ? 0 : 12}>{line}</tspan>{/each}
        </text>
      {/each}
    </svg>
  {/if}
  {#if reaction}<p class={DIALOG} role="status">{reaction}</p>{/if}
  {#if notice}<p class={DIALOG} role="alert">{notice}</p>{/if}
  {#if captureLine}<p class={DIALOG} role="status">{captureLine}</p>{/if}
  {#if battleOver}<BattleOver result={battleOver.result} />{/if}

  {#if status === "playing" && (hudSelf || play.arena)}
    <CombatHud {bars} {warnings} {combos} {bosses} />
  {/if}
  {#if status === "playing" && hudSelf && (wheel.open || itemUse.endsTick !== undefined)}
    <ItemWheel
      choices={combatChoices}
      selected={Math.min(wheel.index, Math.max(0, combatChoices.length - 1))}
      using={itemUse.endsTick !== undefined ? itemUse.item : undefined}
      cooling={itemUse.cooldownTick !== undefined && itemUse.cooldownTick > tick ? (itemUse.cooldownTick - tick) / Math.max(1, itemUse.cooldownTick - itemUse.cooldownFrom) : 0}
      {itemName}
    />
  {/if}
  {#if status === "playing" && dowsing}
    <!-- The Dowsing MCHN (spec 027): a needle toward the nearest hidden item, brighter as it gets close. -->
    <div class="absolute right-3 top-3 z-2 grid justify-items-center gap-1 px-2 py-1 bg-surface-panel rounded-[6px] text-primary text-xs pointer-events-none" role="img" aria-label={t("dowse.label")}>
      <svg class="size-8 text-icon-primary" viewBox="-16 -16 32 32" style:opacity={0.35 + 0.65 * dowsing.near} aria-hidden="true">
        <circle r="14" fill="none" stroke="currentColor" stroke-width="2" />
        <line x2="0" y2="-11" stroke="currentColor" stroke-width="3" stroke-linecap="round" transform="rotate({dowsing.dir})" />
      </svg>
      {t("dowse.label")}
    </div>
  {/if}

  {#if flyMap}
    <FlyMap points={flyMap} onFly={(area: string) => { flyMap = undefined; window.soulSilver.sendGame({ type: "field-fly", area }); }} onBack={closeFlyMap} />
  {/if}
  {#if picker !== "closed"}
    <SwapPicker
      members={party}
      {launchable}
      active={activeMember}
      fainted={picker === "fainted"}
      {speciesName}
      onPick={(i: number) => {
        window.soulSilver.sendGame({ type: "swap", partyIndex: i });
        picker = "closed";
      }}
      onRecall={() => {
        recallOnce = true;
        picker = "closed";
      }}
      onClose={() => (picker = "closed")}
    />
  {/if}

  {#if progression && !inCombat}
    {#key progression}
      <ProgressionPrompt
        prompt={progression}
        species={party[progression.item.member]?.species ?? 0}
        {speciesName}
        {moveName}
        onAck={() => answer({ type: "progression-ack" })}
        onLearn={(forget: number | null) => answer({ type: "learn-answer", forget })}
        onEvolve={(accept: boolean) => answer({ type: "evolve-answer", accept })}
      />
    {/key}
  {/if}

  {#if pcBoxes}
    <PcPanel boxes={pcBoxes} {party} {pcItems} {bag} {itemName} onItem={(dir: "deposit" | "withdraw", item: number) => window.soulSilver.sendGame({ type: "pc-items", dir, item, qty: 1 })} refused={pcRefused} {speciesName} {moveName} natureName={names.nature} onMove={(from: PcSlot, to: PcSlot) => window.soulSilver.sendGame({ type: "pc-move", from, to })} onRename={(box: number, name: string) => window.soulSilver.sendGame({ type: "pc-rename", box, name })} onLeave={() => window.soulSilver.sendGame({ type: "pc-leave" })} />
  {/if}

  {#if duel && duel.phase !== "fighting"}
    <DuelPanel
      {duel}
      partnerName={players.find((p) => p.id === duel?.partner)?.name ?? "?"}
      onAnswer={(accept: boolean) => window.soulSilver.sendGame({ type: "duel-answer", accept })}
      onCancel={() => window.soulSilver.sendGame({ type: "duel-cancel" })}
      onClose={() => (duel = undefined)}
    />
  {/if}

  {#if trade}
    <TradePanel
      {trade}
      partnerName={players.find((p) => p.id === trade?.partner)?.name ?? "?"}
      {party}
      {bag}
      {speciesName}
      {itemName}
      onAnswer={(accept: boolean) => window.soulSilver.sendGame({ type: "trade-answer", accept })}
      onOffer={(offer: TradeOffer) => window.soulSilver.sendGame({ type: "trade-offer", offer })}
      onConfirm={() => window.soulSilver.sendGame({ type: "trade-confirm" })}
      onCancel={() => window.soulSilver.sendGame({ type: "trade-cancel" })}
      onClose={() => (trade = undefined)}
    />
  {/if}

  {#if naming}
    <NameInput
      title={naming.title}
      max={naming.max}
      keep={naming.keep}
      onDone={(text: string) => {
        window.soulSilver.sendGame({ type: "script-answer", id: naming!.id, text });
        naming = undefined;
      }}
    />
  {/if}
  {#if hatching}<HatchScene species={hatching.species} {speciesName} onDone={() => hatching!.done()} />{/if}
  {#if starter}
    <StarterChoice
      species={starter.species}
      {speciesName}
      onPick={(i: number) => {
        answerScript(starter!.id, i);
        starter = undefined;
      }}
    />
  {/if}
  {#if shop}
    <Shop {shop} {bag} refused={shopRefused} {itemName} onConfirm={(item: number, qty: number) => window.soulSilver.sendGame({ type: shop!.mode === "sell" ? "shop-sell" : "shop-buy", item, qty })} onMode={(mode: "buy" | "sell") => window.soulSilver.sendGame({ type: "shop-mode", mode })} onLeave={() => window.soulSilver.sendGame({ type: "shop-leave" })} />
  {/if}

  {#if call}<CallScreen name={call.name} direction={call.direction} />{/if}
  {#if captureScene}{#key captureScene.key}<CaptureCutscene species={captureScene.species} result={captureScene.result} shakeMs={SHAKE_MS} onDone={() => (captureScene = undefined)} />{/key}{/if}
  <DialogBox queue={dialog} boost={scriptLocked && $settings.fastCutsceneText ? CUTSCENE_TEXT_BOOST : 1} />

  {#if status === "playing"}
    <!-- Block H: the HUD corners. The moves float over the team only in a fight. -->
    <Minimap map={hereMap} level={hereLevel} entities={miniEntities} selfId={selfEntity} encounters={hereEncounters} {dex} {speciesName} />
    <!-- One column, stacked bottom-up so nothing overlaps: the trainer's call-out, the moves, the team. -->
    <div class="pointer-events-none absolute bottom-4 left-4 z-2 grid w-[17rem] justify-items-start gap-2">
      {#if moveCall && (hudSelf || play.arena)}
        {#key moveCall.key}<TrainerCall pic={moveCall.pic} move={moveCall.move} />{/key}
      {/if}
      {#if hudSelf}
        <div class="w-full"><MovePanel self={hudSelf} lead={party[leadIndex(party) ?? -1]} {moveName} moveType={(id: number) => types.get(id)} /></div>
      {/if}
      <PartyStrip {party} {out} fight={hudSelf} {speciesName}>
        {#snippet beside()}<BallPicker {balls} selected={selectedBall} {itemName} onStep={stepBall} />{/snippet}
      </PartyStrip>
    </div>
    {#if !menuOpen}<div class="pointer-events-none absolute bottom-24 right-4 z-2 w-64"><KeyHints hints={legend} /></div>{/if}
    <PhoneDex
      open={menuOpen}
      {page}
      disabled={appsOff}
      onOpen={() => {
        if (!inCombat && !progression && picker === "closed" && flyMap === undefined) setMenu(true);
      }}
      onClose={() => setMenu(false)}
      onPage={(next: MenuPage | undefined) => setMenu(true, next)}
      onLeave={leave}
      {leaving}
      app={phoneApp}
    />
  {/if}

  {#if saveNote}<p class="absolute left-4 top-4 m-0 text-primary text-sm opacity-80 z-1 [text-shadow:0_1px_2px_#000]" role="status">{saveNote}</p>{/if}

  {#if showDebug}
    <dl class="debug fixed top-2 right-2 m-0 px-3 py-2 bg-surface-overlay text-primary [font:12px_monospace] z-6" aria-label={t("debug.label")}>
      <dt>{t("debug.positionLabel")}</dt>
      <dd>{position}</dd>
      <dt>{t("debug.dex")}</dt>
      <dd>{t("dex.counts", { seen: dex.seen.length, caught: dex.caught.length })}</dd>
      <dt>{t("debug.fps")}</dt>
      <dd>{fps}</dd>
      <dt>{t("debug.tick")}</dt>
      <dd>{tick}</dd>
      <dt>{t("debug.tickTimes")}</dt>
      <dd>
        {#if metrics}
          {metrics.lastMs.toFixed(2)} / {metrics.avgMs.toFixed(2)} / {metrics.maxMs.toFixed(2)} ms
        {:else}
          —
        {/if}
      </dd>
      <dt>{t("debug.overruns")}</dt>
      <dd>{metrics?.overruns ?? 0}</dd>
      <dt>{t("debug.audioLabel")}</dt>
      <dd>{audioStats}</dd>
    </dl>
    <ScriptDebug view={scriptDebug} onSetFlag={setScriptFlag} />
  {/if}
</section>
