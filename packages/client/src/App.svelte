<script lang="ts">
  import type { AssetsState, ServerInfo, ServerStatus, UpdateState } from "@soulsilver/shared";
  import { onMount } from "svelte";
  import FirstRun from "./FirstRun.svelte";
  import GameSession from "./GameSession.svelte";
  import UpdateNotice from "./UpdateNotice.svelte";

  /** How long "Assets prontos" stays up after an extraction before the main screen. */
  const READY_NOTICE_MS = 1000;

  let appVersion = $state<string | undefined>();
  let info = $state<ServerInfo | undefined>();
  let status = $state<ServerStatus>({ state: "starting", tick: 0 });
  let failed = $state(false);
  let update = $state<UpdateState>({ status: "disabled" });
  let assets = $state<AssetsState>({ status: "checking" });
  let showMain = $state(false);

  function onAssets(next: AssetsState): void {
    const wasExtracting = assets.status === "extracting";
    assets = next;
    if (next.status !== "ready") {
      showMain = false;
    } else if (wasExtracting) {
      setTimeout(() => (showMain = true), READY_NOTICE_MS);
    } else {
      showMain = true;
    }
  }

  onMount(() => {
    const api = window.soulSilver;
    const unsubscribeStatus = api.onServerStatus((next) => {
      status = next;
      if (next.state === "stopped") failed = true;
    });
    const unsubscribeUpdate = api.onUpdateState((next) => {
      update = next;
    });
    const unsubscribeAssets = api.onAssetsState(onAssets);
    void api.getAppVersion().then((version) => {
      appVersion = version;
    });
    void api.getUpdateState().then((state) => {
      update = state;
    });
    void api.getAssetsState().then(onAssets);
    api.getServerInfo().then(
      (result) => {
        info = result;
      },
      () => {
        failed = true;
      },
    );
    return () => {
      unsubscribeStatus();
      unsubscribeUpdate();
      unsubscribeAssets();
    };
  });
</script>

<main>
  <h1>SoulSilver Desktop</h1>

  <UpdateNotice {update} onRestart={() => void window.soulSilver.restartToUpdate()} />

  {#if !showMain}
    <FirstRun {assets} />
  {:else}
    {#if failed}
      <p class="error" role="alert">Servidor de jogo indisponível.</p>
    {:else if !info}
      <p>Conectando ao servidor de jogo…</p>
    {/if}

    <dl>
      <dt>Versão do app</dt>
      <dd>{appVersion ?? "—"}</dd>
      <dt>Versão do protocolo</dt>
      <dd>{info?.protocolVersion ?? "—"}</dd>
      <dt>Estado do servidor</dt>
      <dd>{status.state}</dd>
      <dt>Ticks</dt>
      <dd class="tick">{status.tick}</dd>
    </dl>

    {#if info}
      <GameSession />
    {/if}
  {/if}

  {#if !showMain}
    <p class="version">Versão {appVersion ?? "—"}</p>
  {/if}
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
  .version {
    color: #555;
    font-size: 0.85rem;
  }
</style>
