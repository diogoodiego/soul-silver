<script lang="ts">
  // The game screen: renderer, input, pause menu and the debug overlay (specs 010, 011 and 012);
  // the companion's reactions, the quick swap and the fight notices (spec 014); progression after a fight (spec 016);
  // the combat HUD, the dialog box, the full menu that never pauses the world and the busy mark (spec 017).
  import { PROTOCOL_VERSION } from "@soulsilver/shared";
  import { BUTTON, type Entity, type ServerMessage, type TickMetrics } from "@soulsilver/shared/game";
  import type { ItemRecord } from "@soulsilver/shared/game-data";
  import { formatText, parseTextId, screenText, textVariables } from "@soulsilver/shared/text";
  import { onMount, untrack } from "svelte";
  import { audio, createAudioReactions } from "./audio";
  import { leadIndex } from "@soulsilver/shared/companion";
  import CombatHud from "./game/CombatHud.svelte";
  import type { MenuPage } from "./game/menu-page";
  import MovePanel from "./game/MovePanel.svelte";
  import OnlinePanel from "./game/OnlinePanel.svelte";
  import PartyPanel from "./game/PartyPanel.svelte";
  import { createDialogQueue } from "./game/dialog-queue";
  import DialogBox from "./game/DialogBox.svelte";
  import ScriptDebug from "./game/ScriptDebug.svelte";
  import { BANK, bankTexts, itemRecords, moveTypes } from "./game/game-data";
  import PauseMenu from "./game/PauseMenu.svelte";
  import { t, type MessageKey } from "./i18n";
  import { input } from "./input/app-input";
  import { menu } from "./input/menu";
  import type { PlayRequest } from "./play-request";
  import ProgressionPrompt from "./ProgressionPrompt.svelte";
  import { createGameConnection, type GameStatus } from "./net/game-connection";
  import { TICK_MS } from "./net/prediction";
  import { overlayShapes, type OverlayShape } from "./render/ai-overlay";
  import { VIEW_W } from "./render/camera";
  import { createCombatFx } from "./render/combat-fx";
  import { createGameRenderer, SHAKE_MS } from "./render/game-renderer";
  import { createClientWorld } from "./render/map-assets";
  import { currentSettings, saveSettings, settings } from "./settings";
  import SwapPicker from "./SwapPicker.svelte";
  import DexButton from "./ui/DexButton.svelte";
  import Glyph from "./Glyph.svelte";

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

  let menuOpen = $state(false);
  // The Online tab beside the screen.
  let tab = $state<"party" | "online">("party");
  let players = $state<{ id: number; name: string; host: boolean }[]>([]);
  let me = $state<number | undefined>();
  let mode = $state<"solo" | "host" | "guest" | "arena">(untrack(() => (play.arena ? "arena" : play.address ? "guest" : play.hosting ? "host" : "solo")));
  let addresses = $state<string[]>([]);
  let onlineBusy = $state(false);
  let onlineError = $state<string | undefined>();
  /** The host being switched to, while this session saves and closes. */
  let switchingTo = $state<string | undefined>();
  let switched = false;
  /** The menu page over the screen; undefined while the menu is open on the button panel. */
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
  let picker = $state<"closed" | "open" | "fainted">("closed");
  let reaction = $state<string | undefined>();
  let notice = $state<string | undefined>();
  /** Marks over entities: who is in a fight or busy in a menu, and the companion's emotion bubble. */
  /** `capture`: a knocked-out wild one, with the button that throws a ball under its mark. */
  let marks = $state<{ key: string; x: number; y: number; text: string; capture?: boolean }[]>([]);
  /** HP bars over the foes while fighting: wild ones and other players' Pokémon (spec 017, PvP). */
  let bars = $state<{ key: string; x: number; y: number; fraction: number }[]>([]);
  /** The Pokémon under the player's control, for the HUD. */
  let hudSelf = $state<Entity | undefined>();
  /** The player controls a Pokémon: a fight is on. */
  let inCombat = $state(false);
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
  let dex = $state(untrack(() => ({ seen: [...play.save.pokedex.seen], caught: [...play.save.pokedex.caught] })));
  let captureLine = $state<string | undefined>();
  const balls = $derived(bag.filter((b) => items.get(b.item)?.pocket === "balls"));
  // Spec 016: the head of the progression queue, sent only out of combat.
  let progression = $state<Extract<ServerMessage, { type: "progression" }> | undefined>();
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
    for (const key of textVariables(raw)) {
      const b = buffers[key.split(":")[1] ?? ""];
      values[key] = !b ? "" : b.kind === "player" ? play.save.name : b.kind === "species" ? speciesName(b.id) : b.value;
    }
    try {
      return formatText(raw, values, text).split("{page}").map(screenText);
    } catch (error) {
      console.warn(`[game] Script text ${text}: ${(error as Error).message}`);
      return [screenText(raw)];
    }
  }

  async function scriptRequest(ev: Extract<ServerMessage, { type: "script" }>): Promise<void> {
    const r = ev.request;
    switch (r.kind) {
      case "say":
        lastSay = await scriptPages(r.text, r.buffers);
        await dialog.say(lastSay);
        answerScript(ev.id);
        return;
      case "yes-no":
        answerScript(ev.id, (await dialog.ask(lastSay.slice(-1))) ? 0 : 1);
        return;
      case "starter":
        // shortcut: the starter scene is a yes/no per species in turn; build the original's ball picker with the cutscene spec.
        for (let i = 0; ; i = (i + 1) % r.species.length) {
          if (await dialog.ask([t("script.starter", { name: speciesName(r.species[i]!) })])) {
            answerScript(ev.id, i);
            return;
          }
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
    page = open ? to : undefined;
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
    const sounds = createAudioReactions({ playerId: () => game.playerId, header: (area) => world.header(area), world: world.lookup });
    let shown: Entity[] = [];
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
    let nextBallHeld = false;
    /** Screen point above a standing sprite: 40 px north of its feet on the ground. */
    const over = (e: Entity) => renderer.project(e.x, e.y - 40);

    function companionEvents(now: number): void {
      for (const ev of game.takeCompanionEvents()) {
        sounds.companion(ev);
        if (ev.type === "party") {
          party = ev.members;
          activeMember = ev.active;
        } else if (ev.type === "players") {
          players = ev.players;
          me = game.playerId;
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
        } else if (ev.type === "script-lock") {
          scriptLocked = ev.locked;
        } else if (ev.type === "script-debug") {
          scriptDebug = ev;
        } else if (ev.type === "script-event") {
          // The text box closes on its own once confirmed; fades and sounds wait for the shortcut in scriptRequest.
        } else if (ev.type === "fainted") {
          if (ev.canContinue) picker = "fainted";
        } else if (ev.type === "bag") {
          bag = ev.items;
          selectedBall = ev.selected;
        } else if (ev.type === "pokedex") {
          dex = { seen: ev.seen, caught: ev.caught };
        } else if (ev.type === "capture") {
          renderer.capture(ev.wildId, ev.shakes, now);
          const shakes = Array.from({ length: ev.shakes }, (_, i) => t("capture.shake", { dots: "●".repeat(i + 1) }));
          captureLines([t("capture.hit"), ...shakes, ev.caught ? t("capture.caught") : t("capture.escaped")]);
        } else if (ev.type === "captured") {
          captureLines([t(ev.to === "party" ? "capture.toParty" : "capture.toStorage", { name: speciesName(ev.species) })]);
        } else if (ev.type === "notice") {
          captureLines([t(`notice.${ev.code}` as MessageKey)]);
        } else if (ev.type === "exp-gain") {
          const m = party[ev.partyIndex];
          captureLines([t("capture.exp", { name: m ? speciesName(m.species) : t("capture.yourPokemon"), amount: ev.amount })]);
        } else if (ev.type === "progression") {
          progression = ev;
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
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => (saveNote = undefined), 2500);
      // The final save is on disk: the slot can be loaded for the next session.
      if (switchingTo) switchNow();
    });
    // The main process opened the connection before this screen.
    game.start();

    // The menu action opens the full menu; once open, the menu screens take the input.
    const offAction = input.onAction((action) => {
      if (action === "menu" && !menuOpen && !dialogOpen && picker === "closed" && !progression && status === "playing") setMenu(true);
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
      const blocked = menuOpen || dialogOpen || scriptLocked;
      const read = input.read();
      const move = blocked ? { x: 0, y: 0 } : read.move;
      const run = !blocked && read.run;
      running = run;
      let buttons = blocked ? 0 : input.buttons();
      // Interacting needs no menu, swap picker or dialog open (FR-011); cutscenes do not exist yet.
      if (picker !== "closed" || reaction || progression) buttons &= ~BUTTON.interact;
      if (recallOnce) {
        buttons |= BUTTON.recall;
        recallOnce = false;
      }
      const pickerNow = !blocked && input.held("picker");
      if (pickerNow && !pickerHeld && inCombat && picker === "closed") picker = "open";
      pickerHeld = pickerNow;
      const nextBallNow = !blocked && input.held("nextBall");
      if (nextBallNow && !nextBallHeld && balls.length > 1) {
        const at = balls.findIndex((b) => b.item === selectedBall);
        api.sendGame({ type: "select-ball", item: balls[(at + 1) % balls.length]!.item });
      }
      nextBallHeld = nextBallNow;
      if (picker !== "closed" || progression) buttons &= ~(BUTTON.throw | BUTTON.combat);
      // No aim: the server aims every move and ball at the nearest foe.
      game.sendInput(move, run, performance.now(), buttons);
    }, TICK_MS);

    let frames = 0;
    let fpsSince = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      const view = game.view(now);
      renderer.draw(view, running, now);
      shown = view.self ? [view.self, ...view.others] : view.others;
      const events = game.takeCombatEvents();
      renderer.combatEvents(events, now);
      fx.show(events, (id) => shown.find((e) => e.id === id), now);
      fx.update(now);
      companionEvents(now);
      dialogOpen = dialog.view() !== undefined;
      inCombat = !play.arena && view.self?.kind === "pokemon";
      sounds.frame(view, events, inCombat, { x: view.self?.x ?? 0, y: view.self?.y ?? 0, halfWidthPx: VIEW_W / 2 });
      // A fight closes the menu (FR-013); the server already cleared the busy mark.
      if (inCombat && menuOpen) {
        menuOpen = false;
        page = undefined;
      }
      if (!inCombat && picker !== "closed") picker = "closed";
      hudSelf = view.self?.kind === "pokemon" ? view.self : undefined;
      const fighting = hudSelf !== undefined;
      const nextBars = fighting
        ? shown.filter((e) => e.kind === "pokemon" && e.data["owner"] !== hudSelf!.data["owner"] && Number(e.data["hpMax"] ?? 0) > 0).map((e) => ({ key: `hp-${e.id}`, ...over(e), fraction: Number(e.data["hp"]) / Number(e.data["hpMax"]) }))
        : [];
      if (nextBars.length > 0 || bars.length > 0) bars = nextBars;
      const nextMarks: typeof marks = shown.filter((e) => e.data["inCombat"] === true).map((e) => ({ key: `fight-${e.id}`, ...over(e), text: "⚔" }));
      for (const e of shown) if (e.data["busy"] === true && e.id !== game.entityId) nextMarks.push({ key: `busy-${e.id}`, ...over(e), text: t("game.busy") });
      // A wild Pokémon that just noticed someone (spec 019, Alert state).
      for (const e of shown) if (e.data["alert"] === true) nextMarks.push({ key: `alert-${e.id}`, ...over(e), text: "!" });
      // Knocked out, waiting for a Poké Ball.
      for (const e of shown) if (e.data["owner"] === "wild" && e.data["hp"] === 0) nextMarks.push({ key: `ko-${e.id}`, ...over(e), text: t("game.knockedOut"), capture: balls.length > 0 });
      const bubbleOver = emotion && now < emotion.until ? shown.find((e) => e.id === emotion!.id) : undefined;
      if (bubbleOver && emotion) nextMarks.push({ key: "emotion", ...over(bubbleOver), text: emotion.text });
      if (nextMarks.length > 0 || marks.length > 0) marks = nextMarks;
      const self = view.self;
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

  const DIALOG = "absolute left-1/2 top-4 -translate-x-1/2 w-[min(90%,32rem)] m-0 px-4 py-3 bg-white/95 text-ink palette-ink border-3 border-frame rounded-[6px] whitespace-pre-line z-3";
  const MESSAGE = "absolute left-1/2 top-1/2 -translate-1/2 m-0 text-white z-5";

  /** The Pokémon out: under control in a fight, else the one following the trainer. */
  const out = $derived(hudSelf ? activeMember : leadIndex(party));
  const NAV: [MessageKey, MenuPage][] = [
    ["pause.party", "party"],
    ["pause.bag", "bag"],
    ["pause.dex", "dex"],
    ["pause.settings", "settings"],
  ];
  const NAV_CLASS = "grid grid-cols-2 gap-3";
  const ASIDE = "grid grid-rows-[minmax(0,1fr)_auto_auto] gap-3 min-h-0";
  const TABS: ["party" | "online", MessageKey][] = [
    ["party", "pause.party"],
    ["online", "online.tab"],
  ];

  const REASONS: Record<string, MessageKey> = { "host-left": "game.hostLeft", "closed-by-host": "game.closedByHost", disconnected: "game.disconnected" };
</script>

{#snippet navButtons()}
  {#each NAV as [label, to] (to)}
    <DexButton disabled={status !== "playing"} onclick={() => setMenu(true, to)}>{t(label)}</DexButton>
  {/each}
  <DexButton disabled={status !== "playing" || leaving} onclick={leave}>{leaving ? t("pause.saving") : t("pause.leave")}</DexButton>
  <DexButton disabled={status !== "playing"} onclick={() => setMenu(false)}>{t("pause.resume")}</DexButton>
{/snippet}

<section class="fixed inset-0 grid grid-cols-[minmax(0,1fr)_minmax(20rem,37.5%)] gap-8 p-8 bg-dex-red" aria-label={t("game.label")}>
  <div class="grid grid-rows-[auto_minmax(0,1fr)_auto] min-h-0 px-3 bg-dex-shell rounded-[2px]">
    <div class="flex justify-center gap-3 py-3" aria-hidden="true">
      <span class="size-3.5 rounded-full bg-dex-bezel"></span>
      <span class="size-3.5 rounded-full bg-dex-bezel"></span>
    </div>
    <!-- The game screen: the renderer and everything drawn over it share this box. -->
    <div class="relative min-h-0 overflow-hidden border-[12px] border-dex-bezel bg-dex-screen font-screen" class:crt={$settings.crt}>
  <div class="absolute inset-0 overflow-hidden" bind:this={host}></div>

  {#if status === "rejected"}
    <div class="{MESSAGE} grid gap-2 justify-items-center">
      <p class="text-danger font-bold" role="alert">{rejectMessage}</p>
      <button type="button" onclick={onExit}>{t("game.backToMenu")}</button>
    </div>
  {:else if status === "closed"}
    <div class="{MESSAGE} grid gap-2 justify-items-center">
      <p role="status">{t(REASONS[closeReason ?? ""] ?? "game.closed")}</p>
      {#if reconnectError}<p class="text-danger font-bold" role="alert">{reconnectError}</p>{/if}
      {#if onReconnect && closeReason === "disconnected"}
        <button type="button" disabled={reconnecting} onclick={() => void reconnect()}>{t("game.reconnect")}</button>
      {/if}
      <button type="button" onclick={onExit}>{t("game.backToMenu")}</button>
    </div>
  {:else if status === "connecting"}
    <p class={MESSAGE} role="status">{t("game.connecting")}</p>
  {/if}

  {#each marks as m (m.key)}
    <span class="absolute -translate-x-1/2 -translate-y-full text-white font-bold text-[1.1rem] [text-shadow:0_1px_2px_#000] pointer-events-none z-1 grid justify-items-center" style:left="{m.x}px" style:top="{m.y}px" aria-hidden="true">
      {m.text}
      {#if m.capture}<span class="text-[0.75em]"><Glyph action="throw" /> {t("game.captureHint")}</span>{/if}
    </span>
  {/each}
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

  {#if status === "playing" && (hudSelf || play.arena)}
    <CombatHud self={hudSelf} {bars} {speciesName} />
  {/if}

  {#if picker !== "closed"}
    <SwapPicker
      members={party}
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

  <DialogBox queue={dialog} />

  {#if menuOpen && !page && status === "playing"}
    <!-- The panel beside has the input: the screen is covered and says how to get back. -->
    <div class="absolute inset-0 z-4 grid place-content-center justify-items-center gap-3 p-6 bg-black/60 text-center text-[#eef]">
      <p class="m-0 text-[1.4rem]">{t("menu.open")}</p>
      <p class="m-0"><Glyph action="menu" /> {t("menu.back")}</p>
      <p class="m-0 px-3 py-1 rounded-full bg-[#b23b3b] text-[0.8rem]">{t("pause.live")}</p>
    </div>
  {/if}
  {#if menuOpen && page && status === "playing"}
    <PauseMenu {page} {party} {bag} {items} {dex} {names} onPage={(next) => setMenu(true, next)} />
  {/if}

  {#if saveNote}<p class="absolute left-2 top-2 m-0 text-white text-[0.85rem] opacity-80 z-1" role="status">{saveNote}</p>{/if}
    </div>
    <div class="flex items-center justify-between py-3" aria-hidden="true">
      <span class="size-3 rounded-full bg-[#7a3b2e]"></span>
      <span class="grid gap-[3px] w-14"><span class="h-[3px] bg-dex-bezel"></span><span class="h-[3px] bg-dex-bezel"></span><span class="h-[3px] bg-dex-bezel"></span></span>
    </div>
  </div>

  {#snippet side()}
    <section class="relative min-h-0 grid grid-rows-[auto_minmax(0,1fr)] border-8 border-black bg-dex-screen font-screen" class:crt={$settings.crt}>
      <div class="flex" role="tablist">
        {#each TABS as [key, label] (key)}
          <button type="button" role="tab" aria-selected={tab === key} class="px-4 py-2 border-none bg-transparent [font-palette:--screen]! text-muted font-semibold aria-selected:bg-black/30 aria-selected:text-white" onclick={() => (tab = key)}>{t(label)}</button>
        {/each}
      </div>
      {#if tab === "party"}
        <PartyPanel {party} {out} {speciesName} />
      {:else}
        <OnlinePanel {mode} {players} {me} address={play.address} {addresses} busy={onlineBusy || status !== "playing"} error={switchingTo ? t("online.switching") : onlineError} onOpen={() => void openLan()} onJoin={joinOther} />
      {/if}
    </section>
    <nav class={NAV_CLASS}>{@render navButtons()}</nav>
    <div class="mt-[clamp(0.5rem,6vh,4rem)]">
      <MovePanel self={hudSelf} lead={party[leadIndex(party) ?? -1]} {moveName} moveType={(id: number) => types.get(id)} />
    </div>
  {/snippet}
  <!-- With the menu open, the whole panel takes the pad: tabs (also LB/RB), the Online tab and the buttons. -->
  {#if menuOpen && !page}
    <aside class={ASIDE} use:menu={{ onBack: () => setMenu(false), onAction: (a) => (a === "menu" ? (setMenu(false), true) : a === "tabPrev" || a === "tabNext" ? ((tab = tab === "party" ? "online" : "party"), true) : false) }}>{@render side()}</aside>
  {:else}
    <aside class={ASIDE}>{@render side()}</aside>
  {/if}

  {#if showDebug}
    <dl class="debug fixed top-2 right-2 m-0 px-3 py-2 bg-black/75 text-white [font:12px_monospace] z-6" aria-label={t("debug.label")}>
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
