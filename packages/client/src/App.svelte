<script lang="ts">
  import type { ServerInfo, ServerStatus } from "@soulsilver/shared";
  import { onMount } from "svelte";

  let info = $state<ServerInfo | undefined>();
  let status = $state<ServerStatus>({ state: "starting", tick: 0 });
  let failed = $state(false);

  onMount(() => {
    const unsubscribe = window.soulSilver.onServerStatus((next) => {
      status = next;
      if (next.state === "stopped") failed = true;
    });
    window.soulSilver.getServerInfo().then(
      (result) => {
        info = result;
      },
      () => {
        failed = true;
      },
    );
    return unsubscribe;
  });
</script>

<main>
  <h1>SoulSilver Desktop</h1>

  {#if failed}
    <p class="error" role="alert">Servidor de jogo indisponível.</p>
  {:else if !info}
    <p>Conectando ao servidor de jogo…</p>
  {/if}

  <dl>
    <dt>Versão do app</dt>
    <dd>{info?.appVersion ?? "—"}</dd>
    <dt>Versão do protocolo</dt>
    <dd>{info?.protocolVersion ?? "—"}</dd>
    <dt>Estado do servidor</dt>
    <dd>{status.state}</dd>
    <dt>Ticks</dt>
    <dd class="tick">{status.tick}</dd>
  </dl>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    padding: 2rem;
  }
  dl {
    display: grid;
    grid-template-columns: max-content auto;
    gap: 0.5rem 1.5rem;
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .tick {
    font-size: 1.5rem;
  }
  .error {
    color: #b00020;
    font-weight: bold;
  }
</style>
