<script lang="ts">
  import { type AssetsFailure, type AssetsState, romRejectionMessage } from "@soulsilver/shared";

  let { assets }: { assets: AssetsState } = $props();

  let dragging = $state(false);

  const api = window.soulSilver;
  const acceptsRom = $derived(assets.status === "needs-rom" || assets.status === "rejected");

  const EXTRACTING_TITLE = {
    "first-run": "Preparando o jogo",
    update: "Atualizando os arquivos do jogo",
    repair: "Reparando os arquivos do jogo",
    resume: "Retomando a preparação do jogo",
  } as const;

  function formatBytes(bytes: number): string {
    const gb = bytes / 1024 ** 3;
    return gb >= 1 ? `${gb.toFixed(1).replace(".", ",")} GB` : `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
  }

  function failureMessage(failure: AssetsFailure): string {
    switch (failure.code) {
      case "disk-full":
        return `Falta espaço no disco: são necessários ${formatBytes(failure.requiredBytes)} e há ${formatBytes(failure.availableBytes)} livres. Libere espaço e tente de novo.`;
      case "write-permission":
        return `O jogo não tem permissão para gravar em ${failure.path}. Confira se a pasta não está protegida ou somente leitura.`;
      case "busy":
        return "Outra preparação do jogo já está em andamento. Espere ela terminar e tente de novo.";
      case "rom-copy-failed":
        return "Não foi possível guardar uma cópia do arquivo. Confira se há espaço no disco e tente de novo.";
      case "stage-failed":
        return `A etapa "${failure.stageTitle}" falhou. Tente de novo; se continuar, abra o log e envie para quem mantém o jogo.`;
      case "unexpected":
        return "Aconteceu um erro inesperado. Tente de novo; se continuar, abra o log e envie para quem mantém o jogo.";
    }
  }

  function onDragOver(event: DragEvent): void {
    if (!acceptsRom) return;
    event.preventDefault();
    dragging = true;
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    dragging = false;
    const file = event.dataTransfer?.files[0];
    if (acceptsRom && file) void api.submitRomFile(file);
  }

  function cancel(): void {
    if (confirm("Cancelar a preparação do jogo? Você pode retomar depois sem escolher o arquivo de novo.")) {
      void api.cancelExtraction();
    }
  }
</script>

<svelte:window ondragover={onDragOver} ondragleave={() => (dragging = false)} ondrop={onDrop} />

<section class="first-run" class:dragging aria-live="polite">
  {#if assets.status === "checking"}
    <p class="quiet">Verificando os arquivos do jogo…</p>
  {:else if assets.status === "needs-rom" || assets.status === "rejected"}
    <h2>Bem-vindo!</h2>
    <p>
      Para jogar, você precisa do arquivo do seu próprio cartucho de <strong>Pokémon SoulSilver</strong>, versão dos
      <strong>EUA</strong> (um arquivo <code>.nds</code>).
    </p>
    <p class="quiet">O arquivo fica só no seu PC: nada é enviado pela internet.</p>

    {#if assets.status === "needs-rom" && assets.previousRomInvalid}
      <div class="problem" role="alert">
        <p>
          A cópia da ROM que o jogo guardou sumiu ou foi alterada, e os arquivos do jogo precisam ser preparados de novo.
          Escolha o arquivo outra vez.
        </p>
      </div>
    {/if}

    {#if assets.status === "rejected"}
      {@const message = romRejectionMessage(assets.rejection)}
      <div class="problem" role="alert">
        <p><strong>{message.title}</strong></p>
        <p>{message.detail}</p>
      </div>
    {/if}

    {#if assets.status === "needs-rom" && assets.savedRom}
      <div class="resume">
        <p>A preparação do jogo foi interrompida. Você pode continuar com o arquivo que já escolheu.</p>
        <div class="actions">
          <button onclick={() => void api.startExtraction()}>Retomar extração</button>
        </div>
      </div>
    {/if}

    <div class="drop">
      <p>Arraste o arquivo para esta janela ou</p>
      <div class="actions">
        <button onclick={() => void api.chooseRom()}>
          {assets.status === "rejected" ? "Escolher outro arquivo" : "Escolher arquivo"}
        </button>
      </div>
    </div>
  {:else if assets.status === "validating"}
    <p>Conferindo o arquivo…</p>
  {:else if assets.status === "extracting"}
    <h2>{EXTRACTING_TITLE[assets.mode]}</h2>
    <p>{assets.stageTitle}</p>
    <progress max="100" value={assets.percent}></progress>
    <p class="percent">{assets.percent}%</p>
    <div class="actions">
      <button class="secondary" onclick={cancel}>Cancelar</button>
    </div>
  {:else if assets.status === "cancelling"}
    <p>Cancelando…</p>
  {:else if assets.status === "failed"}
    <div class="problem" role="alert">
      <p><strong>Não foi possível preparar o jogo.</strong></p>
      <p>{failureMessage(assets.failure)}</p>
    </div>
    <div class="actions">
      <button onclick={() => void api.startExtraction()}>Tentar de novo</button>
      <button class="secondary" onclick={() => void api.openExtractionLog()}>Abrir log</button>
    </div>
  {:else if assets.status === "ready"}
    <h2>Assets prontos</h2>
  {/if}
</section>

<style>
  .first-run {
    max-width: 36rem;
    padding: 1rem 1.25rem;
    border: 2px solid transparent;
    border-radius: 6px;
  }
  .dragging {
    border-color: #4a7bd0;
    border-style: dashed;
    background: #f2f6fd;
  }
  h2 {
    font-size: 1.2rem;
    margin: 0 0 0.75rem;
  }
  .quiet {
    color: #555;
    font-size: 0.9rem;
  }
  .drop {
    margin-top: 1.25rem;
    padding: 1rem;
    border: 1px dashed #b5b5b5;
    border-radius: 6px;
    text-align: center;
  }
  .resume {
    margin-top: 1rem;
  }
  .drop p {
    margin: 0 0 0.5rem;
  }
  .drop .actions {
    justify-content: center;
  }
  .problem {
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    border-left: 4px solid #b00020;
    background: #fdf2f3;
  }
  .problem p {
    margin: 0.25rem 0;
  }
  progress {
    width: 100%;
    height: 1rem;
  }
  .percent {
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  button {
    font: inherit;
    padding: 0.4rem 0.9rem;
    cursor: pointer;
  }
  .secondary {
    background: transparent;
  }
</style>
