<script lang="ts">
  // Continue: the 3 slots, with restore, export and import (spec 012, US1, US3, US7).
  import { CANCELLED, type SaveResult, type SlotSummary } from "@soulsilver/shared/save";

  let {
    slots,
    selected,
    onSelect,
    onChanged,
    onBack,
  }: { slots: SlotSummary[]; selected: number | undefined; onSelect: (slot: number) => void; onChanged: () => void; onBack: () => void } = $props();

  let message = $state<string | undefined>();

  const playTime = (ms: number) => `${Math.floor(ms / 3_600_000)}h${String(Math.floor(ms / 60_000) % 60).padStart(2, "0")}`;
  const date = (iso: string) => new Date(iso).toLocaleString("pt-BR");

  async function run(action: Promise<SaveResult>, done: string): Promise<void> {
    const result = await action;
    if (result.ok) message = done;
    else if (result.reason !== CANCELLED) message = result.reason;
    onChanged();
  }

  function importInto(s: SlotSummary): void {
    const occupied = s.status !== "empty";
    if (occupied && !window.confirm(`O slot ${s.index} já tem um save. Substituir pelo arquivo?`)) return;
    void run(window.soulSilver.importSave(s.index, occupied), "Save importado.");
  }
</script>

<section>
  <h2>Continuar</h2>
  <ul>
    {#each slots as s (s.index)}
      <li class:selected={selected === s.index}>
        <strong>Slot {s.index}</strong>
        {#if s.status === "ok"}
          <span>{s.name} · {s.character === "male" ? "menino" : "menina"} · mapa {s.area} · {playTime(s.playTimeMs)} · {date(s.savedAt)}</span>
          <div class="actions">
            <button type="button" onclick={() => onSelect(s.index)} aria-pressed={selected === s.index}>{selected === s.index ? "Escolhido" : "Escolher"}</button>
            <button type="button" onclick={() => void run(window.soulSilver.exportSave(s.index), "Save exportado.")}>Exportar</button>
          </div>
        {:else if s.status === "empty"}
          <span>Vazio</span>
        {:else if s.status === "corrupt"}
          <span class="error">Save corrompido ({s.reason}). Há um backup.</span>
          <div class="actions">
            <button type="button" onclick={() => void run(window.soulSilver.restoreBackup(s.index), "Backup restaurado.")}>Restaurar backup</button>
          </div>
        {:else}
          <span class="error">Save e backup corrompidos ({s.reason}). Os arquivos não foram apagados.</span>
        {/if}
        <div class="actions">
          <button type="button" onclick={() => importInto(s)}>Importar arquivo</button>
        </div>
      </li>
    {/each}
  </ul>

  {#if message}<p role="status">{message}</p>{/if}
  <button type="button" onclick={onBack}>Voltar</button>
</section>

<style>
  ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.5rem;
    max-width: 40rem;
  }
  li {
    display: grid;
    gap: 0.4rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid #aaa;
    border-radius: 4px;
  }
  li.selected {
    border-color: #1a5fb4;
    border-width: 2px;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .error {
    color: #b00020;
  }
</style>
