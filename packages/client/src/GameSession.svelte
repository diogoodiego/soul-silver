<script lang="ts">
  // The local game session: renderer, input and the debug overlay (specs 010 and 011).
  import { PROTOCOL_VERSION } from "@soulsilver/shared";
  import type { TickMetrics } from "@soulsilver/shared/game";
  import { onMount } from "svelte";
  import { createInput } from "./input/input";
  import { createGameConnection, type GameStatus } from "./net/game-connection";
  import { TICK_MS } from "./net/prediction";
  import { createGameRenderer } from "./render/game-renderer";
  import { createClientWorld } from "./render/map-assets";

  let status = $state<GameStatus>("connecting");
  let rejectMessage = $state<string | undefined>();
  let closeReason = $state<string | undefined>();
  let tick = $state(0);
  let metrics = $state<TickMetrics | undefined>();
  let fps = $state(0);
  let position = $state("—");
  let showDebug = $state(false);
  let host: HTMLDivElement;

  onMount(() => {
    const api = window.soulSilver;
    const log = (message: string) => console.warn(`[game] ${message}`);
    const world = createClientWorld(log);
    const game = createGameConnection({
      name: "Jogador",
      protocolVersion: PROTOCOL_VERSION,
      send: (msg) => api.sendGame(msg),
      world: world.lookup,
      log,
    });
    const input = createInput(window);
    let running = false;
    const renderer = createGameRenderer(host, world, log);

    const unsubscribeMessage = api.onGameMessage((msg) => game.receive(msg, performance.now()));
    const unsubscribeClosed = api.onGameClosed(() => game.disconnected());
    void api.connectGame().then(() => game.start());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F3") {
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
      game.sendInput(move, run, performance.now());
    }, TICK_MS);

    let frames = 0;
    let fpsSince = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      const view = game.view(now);
      renderer.draw(view, running, now);
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
      renderer.destroy();
      unsubscribeMessage();
      unsubscribeClosed();
    };
  });
</script>

<section class="game" aria-label="Sessão de jogo">
  <div class="screen" bind:this={host}></div>

  {#if status === "rejected"}
    <p class="message error" role="alert">{rejectMessage}</p>
  {:else if status === "closed"}
    <p class="message" role="status">Sessão encerrada ({closeReason}).</p>
  {:else if status === "connecting"}
    <p class="message" role="status">Entrando na sessão…</p>
  {/if}

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
