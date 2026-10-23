<script lang="ts">
  import type { UpdateState } from "@soulsilver/shared";

  let { update, onRestart }: { update: UpdateState; onRestart: () => void } = $props();

  let hidden = $state(false);
</script>

{#if !hidden}
  {#if update.status === "downloading"}
    <p class="quiet">Baixando atualização {update.version}… {update.percent}%</p>
  {:else if update.status === "ready"}
    <section class="panel" aria-labelledby="update-title" aria-live="polite">
      <h2 id="update-title">Atualização pronta: {update.currentVersion} → {update.newVersion}</h2>
      <p>Versões diferentes não conseguem jogar juntas. Reinicie para continuar compatível com seus amigos.</p>
      <div class="actions">
        <button onclick={onRestart}>Reiniciar agora</button>
        <button class="secondary" onclick={() => (hidden = true)}>Depois</button>
      </div>
      <p class="quiet">Se escolher "Depois", a atualização é aplicada quando você fechar o app.</p>
    </section>
  {:else if update.status === "check-failed"}
    <footer class="quiet">
      Não foi possível verificar atualizações.
      <button class="link" onclick={() => (hidden = true)} aria-label="Dispensar aviso">Dispensar</button>
    </footer>
  {/if}
{/if}

<style>
  .quiet {
    color: #555;
    font-size: 0.9rem;
  }
  .panel {
    border: 1px solid #c8c8c8;
    border-radius: 6px;
    padding: 1rem 1.25rem;
    margin: 1rem 0;
    max-width: 36rem;
    background: #f7f7f7;
  }
  h2 {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
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
  footer {
    position: fixed;
    left: 1rem;
    bottom: 0.75rem;
  }
  .link {
    padding: 0 0.25rem;
    border: none;
    background: none;
    color: inherit;
    text-decoration: underline;
  }
</style>
