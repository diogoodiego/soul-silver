<script lang="ts">
  // The game screen: renderer, input, pause menu and the debug overlay (specs 010, 011 and 012);
  // the companion's reactions, the quick swap and the fight notices (spec 014); progression after a fight (spec 016).
  import { PROTOCOL_VERSION } from "@soulsilver/shared";
  import { BUTTON, type Entity, type ServerMessage, type TickMetrics } from "@soulsilver/shared/game";
  import { formatText, screenText, type TextBankFile } from "@soulsilver/shared/text";
  import ArenaHud from "./ArenaHud.svelte";
  import ProgressionPrompt from "./ProgressionPrompt.svelte";
  import SwapPicker from "./SwapPicker.svelte";
  import { onMount } from "svelte";
  import { createInput } from "./input/input";
  import type { PlayRequest } from "./play-request";
  import { createGameConnection, type GameStatus } from "./net/game-connection";
  import { TICK_MS } from "./net/prediction";
  import { createCombatFx, loadBank, SPECIES_BANK } from "./render/combat-fx";
  import { createGameRenderer, SHAKE_MS } from "./render/game-renderer";
  import { createClientWorld } from "./render/map-assets";

  let {
    play,
    onExit,
    onReconnect,
  }: { play: PlayRequest; onExit: () => void; onReconnect?: (() => Promise<string | undefined>) | undefined } = $props();

  const REASONS: Record<string, string> = {
    "host-left": "O anfitrião saiu da partida.",
    "closed-by-host": "O anfitrião encerrou a partida.",
    disconnected: "A conexão com a partida foi perdida.",
  };

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
  let combatants = $state<Entity[]>([]);
  let host: HTMLDivElement;

  const EMOTIONS: Record<string, string> = { exclaim: "!", question: "?", note: "♪", heart: "♥", sweat: "💧", angry: "💢", sleep: "💤" };
  let party = $state<{ species: number; level: number; hp: number; hpMax: number }[]>([]);
  let activeMember = $state<number | undefined>();
  let picker = $state<"closed" | "open" | "fainted">("closed");
  let reaction = $state<string | undefined>();
  let notice = $state<string | undefined>();
  /** Marks over entities: who is in a fight, and the companion's emotion bubble. */
  let marks = $state<{ key: string; x: number; y: number; text: string }[]>([]);
  /** The player controls a Pokémon: a fight is on. */
  let inCombat = $state(false);
  let speciesBank = $state<TextBankFile | undefined>();
  const speciesName = (id: number) => speciesBank?.records.find((r) => r.id === id)?.text ?? `#${id}`;
  /** Set by the picker's recall button: the next input carries the recall bit. */
  let recallOnce = false;

  // Spec 015: the balls in the bag, the one the next throw uses, and the capture lines.
  /** Item names (feature 005). */
  const ITEM_BANK = 222;
  const NOTICES: Record<string, string> = { "no-balls": "Você não tem Poké Balls.", "storage-full": "A equipe e o armazenamento estão cheios.", "ball-returned": "Outro treinador já está capturando esse Pokémon. A bola voltou." };
  let balls = $state<{ item: number; count: number }[]>([]);
  let selectedBall = $state<number | undefined>();
  let itemBank = $state<TextBankFile | undefined>();
  let dex = $state({ seen: 0, caught: 0 });
  let captureLine = $state<string | undefined>();
  const itemName = (id: number) => itemBank?.records.find((r) => r.id === id)?.text ?? `#${id}`;
  // Spec 016: the head of the progression queue, sent only out of combat.
  /** Move names (feature 005). */
  const MOVE_BANK = 750;
  let moveBank = $state<TextBankFile | undefined>();
  const moveName = (id: number) => moveBank?.records.find((r) => r.id === id)?.text ?? `#${id}`;
  let progression = $state<Extract<ServerMessage, { type: "progression" }> | undefined>();
  function answer(msg: { type: "progression-ack" } | { type: "learn-answer"; forget: number | null } | { type: "evolve-answer"; accept: boolean }): void {
    progression = undefined;
    window.soulSilver.sendGame(msg);
  }

  const ballLabel = $derived.by(() => {
    const b = balls.find((x) => x.item === selectedBall);
    return b ? `${itemName(b.item)} ×${b.count}` : undefined;
  });

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
    const input = createInput(window);
    let running = false;
    const renderer = createGameRenderer(host, world, log);
    const fx = createCombatFx(host, (x, y) => renderer.project(x, y), log);
    let shown: Entity[] = [];
    void loadBank(SPECIES_BANK).then((b) => (speciesBank = b));
    void loadBank(ITEM_BANK).then((b) => (itemBank = b));
    void loadBank(MOVE_BANK).then((b) => (moveBank = b));
    let captureTimers: ReturnType<typeof setTimeout>[] = [];
    /** Shows the lines one after the other, SHAKE_MS apart; a new capture replaces them. */
    function captureLines(lines: string[]): void {
      for (const t of captureTimers) clearTimeout(t);
      captureTimers = lines.map((line, i) => setTimeout(() => (captureLine = line), i * SHAKE_MS));
      captureTimers.push(setTimeout(() => (captureLine = undefined), lines.length * SHAKE_MS + 2000));
    }
    const banks: Record<number, Promise<TextBankFile | undefined>> = {};
    let emotion: { id: number; text: string; until: number } | undefined;
    let reactionTimer: ReturnType<typeof setTimeout> | undefined;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    let pickerHeld = false;
    let nextBallHeld = false;
    /** Screen point above a standing sprite: 40 px north of its feet on the ground. */
    const over = (e: Entity) => renderer.project(e.x, e.y - 40);

    function companionEvents(now: number): void {
      for (const ev of game.takeCompanionEvents()) {
        if (ev.type === "party") {
          party = ev.members;
          activeMember = ev.active;
        } else if (ev.type === "reaction") {
          emotion = { id: ev.companionId, text: EMOTIONS[ev.emotion] ?? "", until: now + 2000 };
          banks[ev.bank] ??= loadBank(ev.bank);
          void banks[ev.bank]!.then((bank) => {
            const raw = bank?.records.find((r) => r.id === ev.text)?.text;
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
          balls = ev.items;
          selectedBall = ev.selected;
        } else if (ev.type === "pokedex") {
          dex = { seen: ev.seen.length, caught: ev.caught.length };
        } else if (ev.type === "capture") {
          renderer.capture(ev.wildId, ev.shakes, now);
          const shakes = Array.from({ length: ev.shakes }, (_, i) => `A bola balançou… ${"●".repeat(i + 1)}`);
          captureLines(["A bola acertou!", ...shakes, ev.caught ? "Capturado!" : "O Pokémon escapou!"]);
        } else if (ev.type === "captured") {
          captureLines([`${speciesName(ev.species)} ${ev.to === "party" ? "entrou na equipe" : "foi para o armazenamento temporário"}.`]);
        } else if (ev.type === "notice") {
          captureLines([NOTICES[ev.code] ?? ev.code]);
        } else if (ev.type === "exp-gain") {
          const m = party[ev.partyIndex];
          captureLines([`${m ? speciesName(m.species) : "Seu Pokémon"} ganhou ${ev.amount} de experiência.`]);
        } else if (ev.type === "progression") {
          progression = ev;
        } else {
          picker = "closed";
          notice = `Todos os seus Pokémon desmaiaram. Você perdeu ¥${ev.moneyLost} e voltou para se recuperar.`;
          clearTimeout(noticeTimer);
          noticeTimer = setTimeout(() => (notice = undefined), 5000);
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
      saveNote = result.ok ? "Progresso salvo" : `Não foi possível salvar: ${result.reason}`;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => (saveNote = undefined), 2500);
    });
    // The main process opened the connection before this screen.
    game.start();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // No full menu during a fight (spec 014, FR-024); Escape only closes the quick swap.
        if (picker === "open") picker = "closed";
        else if (!inCombat) menuOpen = !menuOpen;
        event.preventDefault();
      } else if (event.key === "F3") {
        showDebug = !showDebug;
        event.preventDefault();
      } else if (event.key === "F11") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const inputTimer = setInterval(() => {
      const { move, run } = input.read();
      running = run;
      let buttons = input.buttons();
      // Interacting needs no menu, swap picker or dialog open (FR-011); cutscenes do not exist yet.
      if (menuOpen || picker !== "closed" || reaction || progression) buttons &= ~BUTTON.interact;
      if (recallOnce) {
        buttons |= BUTTON.recall;
        recallOnce = false;
      }
      const pickerNow = input.held("picker");
      if (pickerNow && !pickerHeld && inCombat && picker === "closed") picker = "open";
      pickerHeld = pickerNow;
      const nextBallNow = input.held("nextBall");
      if (nextBallNow && !nextBallHeld && balls.length > 1) {
        const at = balls.findIndex((b) => b.item === selectedBall);
        api.sendGame({ type: "select-ball", item: balls[(at + 1) % balls.length]!.item });
      }
      nextBallHeld = nextBallNow;
      if (menuOpen || picker !== "closed" || progression) buttons &= ~(BUTTON.throw | BUTTON.combat);
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
      if (play.arena) combatants = shown.filter((e) => e.kind === "pokemon");
      companionEvents(now);
      inCombat = !play.arena && view.self?.kind === "pokemon";
      if (!inCombat && picker !== "closed") picker = "closed";
      const nextMarks = shown.filter((e) => e.data["inCombat"] === true).map((e) => ({ key: `fight-${e.id}`, ...over(e), text: "⚔" }));
      const bubbleOver = emotion && now < emotion.until ? shown.find((e) => e.id === emotion!.id) : undefined;
      if (bubbleOver && emotion) nextMarks.push({ key: "emotion", ...over(bubbleOver), text: emotion.text });
      if (nextMarks.length > 0 || marks.length > 0) marks = nextMarks;
      const self = view.self;
      position = self ? `mapa ${self.area} · ${Math.round(self.x)}, ${Math.round(self.y)} · nível ${self.level}` : "—";
      status = game.status;
      rejectMessage = game.rejectMessage;
      closeReason = game.closeReason;
      tick = game.tick;
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
      input.dispose();
      fx.destroy();
      renderer.destroy();
      unsubscribeMessage();
      unsubscribeClosed();
      unsubscribeSaved();
      clearTimeout(noteTimer);
      clearTimeout(reactionTimer);
      clearTimeout(noticeTimer);
      for (const t of captureTimers) clearTimeout(t);
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
</script>

<section class="game" aria-label="Sessão de jogo">
  <div class="screen" bind:this={host}></div>

  {#if status === "rejected"}
    <div class="message">
      <p class="error" role="alert">{rejectMessage}</p>
      <button type="button" onclick={onExit}>Voltar ao menu</button>
    </div>
  {:else if status === "closed"}
    <div class="message">
      <p role="status">{REASONS[closeReason ?? ""] ?? "A sessão foi encerrada."}</p>
      {#if reconnectError}<p class="error" role="alert">{reconnectError}</p>{/if}
      {#if onReconnect && closeReason === "disconnected"}
        <button type="button" disabled={reconnecting} onclick={() => void reconnect()}>Reconectar</button>
      {/if}
      <button type="button" onclick={onExit}>Voltar ao menu</button>
    </div>
  {:else if status === "connecting"}
    <p class="message" role="status">Entrando na sessão…</p>
  {:else if menuOpen}
    <div class="message">
      <button type="button" disabled={leaving} onclick={leave}>{leaving ? "Salvando…" : "Sair para o menu"}</button>
      <button type="button" onclick={() => (menuOpen = false)}>Continuar jogando</button>
    </div>
  {/if}

  {#each marks as m (m.key)}
    <span class="mark" style:left="{m.x}px" style:top="{m.y}px" aria-hidden="true">{m.text}</span>
  {/each}
  {#if reaction}<p class="dialog" role="status">{reaction}</p>{/if}
  {#if notice}<p class="dialog" role="alert">{notice}</p>{/if}
  {#if captureLine}<p class="dialog" role="status">{captureLine}</p>{/if}
  {#if ballLabel && status === "playing"}<p class="ball" aria-label="Bola selecionada (G arremessa, B troca)">◓ {ballLabel}</p>{/if}
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

  {#if saveNote}<p class="note" role="status">{saveNote}</p>{/if}
  {#if play.arena && status === "playing"}<ArenaHud {combatants} />{/if}

  {#if showDebug}
    <dl class="debug" aria-label="Depuração">
      <dt>Posição</dt>
      <dd>{position}</dd>
      <dt>Pokédex</dt>
      <dd>{dex.seen} vistos · {dex.caught} capturados</dd>
      <dt>Quadros por segundo</dt>
      <dd>{fps}</dd>
      <dt>Tick</dt>
      <dd>{tick}</dd>
      <dt>Tick (último / média / pior)</dt>
      <dd>
        {#if metrics}
          {metrics.lastMs.toFixed(2)} / {metrics.avgMs.toFixed(2)} / {metrics.maxMs.toFixed(2)} ms
        {:else}
          —
        {/if}
      </dd>
      <dt>Ticks descartados</dt>
      <dd>{metrics?.overruns ?? 0}</dd>
      <dt>Controles</dt>
      <dd>Setas/WASD ou analógico · Shift/B corre · F11 tela cheia</dd>
      <dd>F/LT combate · R/RT recolhe · Q/Start troca · E/View interage</dd>
    </dl>
  {/if}
</section>

<style>
  .game {
    position: fixed;
    inset: 0;
    background: #000;
  }
  .screen {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .message {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    color: #fff;
  }
  .ball {
    position: absolute;
    right: 8px;
    bottom: 8px;
    margin: 0;
    color: #fff;
    font: 12px monospace;
    text-shadow: 0 1px 2px #000;
  }
  .note {
    position: absolute;
    left: 8px;
    bottom: 8px;
    margin: 0;
    color: #fff;
    font: 12px monospace;
    opacity: 0.8;
  }
  div.message {
    display: grid;
    gap: 0.5rem;
    justify-items: center;
  }
  .debug {
    position: fixed;
    top: 8px;
    right: 8px;
    margin: 0;
    padding: 8px 12px;
    background: rgb(0 0 0 / 75%);
    color: #fff;
    font: 12px monospace;
  }
  .mark {
    position: absolute;
    transform: translate(-50%, -100%);
    color: #fff;
    font:
      bold 18px system-ui,
      sans-serif;
    text-shadow: 0 1px 2px #000;
    pointer-events: none;
    /* The renderer's canvas stacks above plain siblings. */
    z-index: 1;
  }
  .dialog {
    position: absolute;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    width: min(90%, 32rem);
    margin: 0;
    padding: 0.75rem 1rem;
    background: rgb(255 255 255 / 95%);
    color: #222;
    border: 3px solid #4a6;
    border-radius: 6px;
    font:
      15px system-ui,
      sans-serif;
    white-space: pre-line;
  }
  .error {
    color: #ff6b81;
    font-weight: bold;
  }
</style>
