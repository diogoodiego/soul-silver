<script lang="ts">
  // New game: slot, name and character (spec 012, US1).
  import { PLAYER_NAME_MAX } from "@soulsilver/shared/game";
  import type { SlotSummary } from "@soulsilver/shared/save";
  import { untrack } from "svelte";

  let { slots, onCreated, onBack }: { slots: SlotSummary[]; onCreated: (slot: number) => void; onBack: () => void } = $props();

  let slot = $state(untrack(() => slots.find((s) => s.status === "empty")?.index ?? 1));
  let name = $state("");
  let character = $state<"male" | "female">("male");
  let error = $state<string | undefined>();
  let busy = $state(false);

  const label = (s: SlotSummary) => (s.status === "ok" ? `Slot ${s.index} — ${s.name} (será substituído)` : s.status === "empty" ? `Slot ${s.index} — vazio` : `Slot ${s.index} — com problema (será substituído)`);

  async function create(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = undefined;
    if (name.trim().length === 0) {
      error = "Digite um nome.";
      return;
    }
    const occupied = slots.find((s) => s.index === slot)?.status !== "empty";
    if (occupied && !window.confirm(`O slot ${slot} já tem um save. Apagar e começar um novo jogo?`)) return;
    busy = true;
    const result = await window.soulSilver.createSave(slot, name, character, occupied);
    busy = false;
    if (result.ok) onCreated(slot);
    else error = result.reason;
  }
</script>

<form onsubmit={create}>
  <h2>Novo jogo</h2>

  <label>
    Slot
    <select bind:value={slot}>
      {#each slots as s (s.index)}
        <option value={s.index}>{label(s)}</option>
      {/each}
    </select>
  </label>

  <label>
    Nome
    <input bind:value={name} maxlength={PLAYER_NAME_MAX} autocomplete="off" required />
  </label>

  <fieldset>
    <legend>Personagem</legend>
    <label><input type="radio" bind:group={character} value="male" /> Menino</label>
    <label><input type="radio" bind:group={character} value="female" /> Menina</label>
  </fieldset>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="actions">
    <button type="submit" disabled={busy}>Começar</button>
    <button type="button" onclick={onBack}>Voltar</button>
  </div>
</form>

<style>
  form {
    display: grid;
    gap: 0.75rem;
    max-width: 24rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
  }
  fieldset label {
    display: inline-flex;
    gap: 0.4rem;
    margin-right: 1rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .error {
    color: #b00020;
    margin: 0;
  }
</style>
