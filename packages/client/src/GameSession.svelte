<script lang="ts">
  // The game screen: renderer, input, pause menu and the debug overlay (specs 010, 011 and 012);
  // the companion's reactions, the quick swap and the fight notices (spec 014); progression after a fight (spec 016);
  // the combat HUD, the dialog box, the full menu that never pauses the world and the busy mark (spec 017).
  import { PROTOCOL_VERSION } from "@soulsilver/shared";
  import { BUTTON, type Entity, type ServerMessage, type TickMetrics } from "@soulsilver/shared/game";
  import type { ItemRecord } from "@soulsilver/shared/game-data";
  import { formatText, screenText } from "@soulsilver/shared/text";
  import { onMount, untrack } from "svelte";
  import { audio, createAudioReactions } from "./audio";
  import CombatHud from "./game/CombatHud.svelte";
  import { createDialogQueue } from "./game/dialog-queue";
  import DialogBox from "./game/DialogBox.svelte";
  import { BANK, bankTexts, itemRecords, moveTypes } from "./game/game-data";
  import PauseMenu from "./game/PauseMenu.svelte";
  import { t, type MessageKey } from "./i18n";
  import { input } from "./input/app-input";
  import type { PlayRequest } from "./play-request";
  import ProgressionPrompt from "./ProgressionPrompt.svelte";
  import { createGameConnection, type GameStatus } from "./net/game-connection";
  import { TICK_MS } from "./net/prediction";
  import { overlayShapes, type OverlayShape } from "./render/ai-overlay";
  import { VIEW_W } from "./render/camera";
  import { createCombatFx } from "./render/combat-fx";
  import { createGameRenderer, SHAKE_MS } from "./render/game-renderer";
  import { createClientWorld } from "./render/map-assets";
  import { currentSettings, saveSettings } from "./settings";
  import SwapPicker from "./SwapPicker.svelte";

  let {
    play,
    onExit,
    onReconnect,
  }: { play: PlayRequest; onExit: () => void; onReconnect?: (() => Promise<string | undefined>) | undefined } = $props();

  let menuOpen = $state(false);
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
  let party = $state<Member[]>([]);
  let activeMember = $state<number | undefined>();
  let picker = $state<"closed" | "open" | "fainted">("closed");
  let reaction = $state<string | undefined>();
  let notice = $state<string | undefined>();
  /** Marks over entities: who is in a fight or busy in a menu, and the companion's emotion bubble. */
  let marks = $state<{ key: string; x: number; y: number; text: string }[]>([]);
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

  const ballLabel = $derived.by(() => {
    const b = balls.find((x) => x.item === selectedBall) ?? balls[0];
    return b ? `${itemName(b.item)} ×${b.count}` : undefined;
  });

  function showNotice(text: string, ms = 3500): void {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = undefined), ms);
  }
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Opening and closing the full menu tells the server, so the others see the player as busy. */
  function setMenu(open: boolean): void {
    if (open === menuOpen) return;
    if (open && inCombat) {
      showNotice(t("notice.menu-blocked"));
      return;
    }
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

    /** Unit aim from the right stick, or from the own entity towards the mouse pointer. */
    function aim(): { x: number; y: number } | undefined {
      const stick = input.stickAim();
      if (stick) return stick;
      const pointer = input.pointer();
      const self = shown.find((e) => e.id === game.entityId);
      if (!pointer || !self) return undefined;
      const rect = host.getBoundingClientRect();
      const at = renderer.project(self.x, self.y);
      const dx = pointer.x - rect.left - at.x;
      const dy = pointer.y - rect.top - at.y;
      const len = Math.hypot(dx, dy);
      return len < 1 ? undefined : { x: dx / len, y: dy / len };
    }

    const unsubscribeMessage = api.onGameMessage((msg) => game.receive(msg, performance.now()));
    const unsubscribeClosed = api.onGameClosed(() => {
      game.disconnected();
      if (leaving) onExit();
    });
    let noteTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribeSaved = api.onGameSaved((result) => {
      saveNote = result.ok ? t("game.saved") : t("game.saveFailed", { reason: result.reason });
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => (saveNote = undefined), 2500);
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
        if (!showDebug) aiShapes = [];
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
      // Menus and the text box take the input; the world keeps going without it (FR-012).
      const blocked = menuOpen || dialogOpen;
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
      game.sendInput(move, run, performance.now(), buttons, aim());
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
      if (inCombat && menuOpen) menuOpen = false;
      if (!inCombat && picker !== "closed") picker = "closed";
      hudSelf = view.self?.kind === "pokemon" ? view.self : undefined;
      const fighting = hudSelf !== undefined;
      const nextBars = fighting
        ? shown.filter((e) => e.kind === "pokemon" && e.data["owner"] !== hudSelf!.data["owner"] && Number(e.data["hpMax"] ?? 0) > 0).map((e) => ({ key: `hp-${e.id}`, ...over(e), fraction: Number(e.data["hp"]) / Number(e.data["hpMax"]) }))
        : [];
      if (nextBars.length > 0 || bars.length > 0) bars = nextBars;
      const nextMarks = shown.filter((e) => e.data["inCombat"] === true).map((e) => ({ key: `fight-${e.id}`, ...over(e), text: "⚔" }));
      for (const e of shown) if (e.data["busy"] === true && e.id !== game.entityId) nextMarks.push({ key: `busy-${e.id}`, ...over(e), text: t("game.busy") });
      // A wild Pokémon that just noticed someone (spec 019, Alert state).
      for (const e of shown) if (e.data["alert"] === true) nextMarks.push({ key: `alert-${e.id}`, ...over(e), text: "!" });
      // Knocked out, waiting for a Poké Ball.
      for (const e of shown) if (e.data["owner"] === "wild" && e.data["hp"] === 0) nextMarks.push({ key: `ko-${e.id}`, ...over(e), text: t("game.knockedOut") });
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

  async function reconnect(): Promise<void> {
    reconnecting = true;
    reconnectError = await onReconnect?.();
    reconnecting = false;
  }

  const DIALOG = "absolute left-1/2 top-4 -translate-x-1/2 w-[min(90%,32rem)] m-0 px-4 py-3 bg-white/95 text-ink border-3 border-frame rounded-[6px] whitespace-pre-line z-3";
  const MESSAGE = "absolute left-1/2 top-1/2 -translate-1/2 m-0 text-white z-5";

  const REASONS: Record<string, MessageKey> = { "host-left": "game.hostLeft", "closed-by-host": "game.closedByHost", disconnected: "game.disconnected" };
</script>

<section class="fixed inset-0 bg-black" aria-label={t("game.label")}>
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
    <span class="absolute -translate-x-1/2 -translate-y-full text-white font-bold text-[1.1rem] [text-shadow:0_1px_2px_#000] pointer-events-none z-1" style:left="{m.x}px" style:top="{m.y}px" aria-hidden="true">{m.text}</span>
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
  {#if ballLabel && status === "playing" && !hudSelf}<p class="absolute right-2 bottom-2 m-0 text-white text-[0.85rem] [text-shadow:0_1px_2px_#000] z-1" aria-label={t("game.ballLabel")}>◓ {ballLabel}</p>{/if}

  {#if status === "playing" && (hudSelf || play.arena)}
    <CombatHud self={hudSelf} {bars} {party} active={activeMember} {speciesName} {moveName} moveType={(id: number) => types.get(id)} />
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

  {#if menuOpen && status === "playing"}
    <PauseMenu {party} {bag} {items} {dex} {names} {leaving} onClose={() => setMenu(false)} onLeave={leave} />
  {/if}

  {#if saveNote}<p class="absolute left-2 top-2 m-0 text-white text-[0.85rem] opacity-80 z-1" role="status">{saveNote}</p>{/if}

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
  {/if}
</section>
