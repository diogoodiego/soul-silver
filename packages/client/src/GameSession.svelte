<script lang="ts">
  // The game screen: renderer, input, pause menu and the debug overlay (specs 010, 011 and 012).
  import { PROTOCOL_VERSION } from "@soulsilver/shared";
  import type { Entity, TickMetrics } from "@soulsilver/shared/game";
  import ArenaHud from "./ArenaHud.svelte";
  import { onMount } from "svelte";
  import { createInput } from "./input/input";
  import type { PlayRequest } from "./play-request";
  import { createGameConnection, type GameStatus } from "./net/game-connection";
  import { TICK_MS } from "./net/prediction";
  import { createCombatFx } from "./render/combat-fx";
  import { createGameRenderer } from "./render/game-renderer";
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
        menuOpen = !menuOpen;
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
      game.sendInput(move, run, performance.now(), input.buttons(), aim());
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

  {#if saveNote}<p class="note" role="status">{saveNote}</p>{/if}
  {#if play.arena && status === "playing"}<ArenaHud {combatants} />{/if}

  {#if showDebug}
    <dl class="debug" aria-label="Depuração">
      <dt>Posição</dt>
      <dd>{position}</dd>
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
  .error {
    color: #ff6b81;
    font-weight: bold;
  }
</style>
