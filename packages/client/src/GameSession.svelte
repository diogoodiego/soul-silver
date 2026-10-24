<script lang="ts">
  // Text-only view of the local game session until the renderer lands (spec 011).
  import { PROTOCOL_VERSION } from "@soulsilver/shared";
  import type { Direction } from "@soulsilver/shared/maps";
  import type { Entity, TickMetrics } from "@soulsilver/shared/game";
  import { onMount } from "svelte";
  import { createGameConnection, type GameStatus } from "./net/game-connection";

  const TICK_MS = 50;
  const KEYS: Record<string, Direction> = { ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east" };

  let status = $state<GameStatus>("connecting");
  let rejectMessage = $state<string | undefined>();
  let closeReason = $state<string | undefined>();
  let self = $state<Entity | undefined>();
  let others = $state(0);
  let tick = $state(0);
  let metrics = $state<TickMetrics | undefined>();
  let showDebug = $state(false);

  onMount(() => {
    const api = window.soulSilver;
    const game = createGameConnection({
      name: "Jogador",
      protocolVersion: PROTOCOL_VERSION,
      send: (msg) => api.sendGame(msg),
      collision: () => undefined,
      log: (message) => console.warn(`[game] ${message}`),
    });
    const held: Direction[] = [];

    const unsubscribeMessage = api.onGameMessage((msg) => game.receive(msg, performance.now()));
    const unsubscribeClosed = api.onGameClosed(() => game.disconnected());
    void api.connectGame().then(() => game.start());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        showDebug = !showDebug;
        event.preventDefault();
        return;
      }
      const dir = KEYS[event.key];
      if (dir && !held.includes(dir)) held.push(dir);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const at = held.indexOf(KEYS[event.key]!);
      if (at !== -1) held.splice(at, 1);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // The most recently pressed direction wins.
    const inputTimer = setInterval(() => game.sendInput(held.at(-1) ?? null), TICK_MS);

    let frame = requestAnimationFrame(function draw(now) {
      const view = game.view(now);
      status = game.status;
      rejectMessage = game.rejectMessage;
      closeReason = game.closeReason;
      self = view.self;
      others = view.others.length;
      tick = game.tick;
      metrics = game.metrics;
      frame = requestAnimationFrame(draw);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(inputTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      unsubscribeMessage();
      unsubscribeClosed();
    };
  });
</script>

<section aria-label="Sessão de jogo">
  {#if status === "rejected"}
    <p class="error" role="alert">{rejectMessage}</p>
  {:else if status === "closed"}
    <p role="status">Sessão encerrada ({closeReason}).</p>
  {:else if status === "connecting"}
    <p role="status">Entrando na sessão…</p>
  {:else if self}
    <p>Posição: {Math.round(self.x)}, {Math.round(self.y)} ({self.facing}) · outros jogadores: {others}</p>
    <p class="hint">Setas para andar · F3 para depuração</p>
  {/if}

  {#if showDebug}
    <dl class="debug" aria-label="Depuração">
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
    </dl>
  {/if}
</section>

<style>
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
    color: #b00020;
    font-weight: bold;
  }
  .hint {
    opacity: 0.7;
  }
</style>
