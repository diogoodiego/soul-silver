<script lang="ts">
  // Play, step 1 (spec 017, US2): the 3 slots with name, play time and badges; an empty slot starts
  // a new game. Restore, export and import stay from spec 012 (US1, US3, US7).
  import { CANCELLED, type SaveResult, type SlotSummary } from "@soulsilver/shared/save";
  import { tick } from "svelte";
  import Confirm from "./Confirm.svelte";
  import { t } from "./i18n";
  import { menu } from "./input/menu";
  import SmallButton from "./ui/SmallButton.svelte";

  let {
    slots,
    onPick,
    onNew,
    onChanged,
    onBack,
  }: { slots: SlotSummary[]; onPick: (slot: number) => void; onNew: (slot: number) => void; onChanged: () => void; onBack: () => void } = $props();

  let message = $state<string | undefined>();
  let asking = $state<{ question: string; then: () => void } | undefined>();
  /** The outdated slot whose choice is open (spec 024, US7). */
  let stale = $state<number | undefined>();
  let list: HTMLUListElement;

  const playTime = (ms: number) => `${Math.floor(ms / 3_600_000)}h${String(Math.floor(ms / 60_000) % 60).padStart(2, "0")}`;
  /** The slot saved last gets the focus, so continuing is one press. */
  const latest = $derived(slots.reduce<SlotSummary | undefined>((best, s) => (s.status === "ok" && (best?.status !== "ok" || s.savedAt > best.savedAt) ? s : best), undefined));

  $effect(() => {
    const index = latest?.index;
    if (index === undefined) return;
    void tick().then(() => list?.querySelector<HTMLButtonElement>(`[data-slot="${index}"]`)?.focus());
  });

  async function run(action: Promise<SaveResult>, done: string): Promise<void> {
    const result = await action;
    if (result.ok) message = done;
    else if (result.reason !== CANCELLED) message = result.reason;
    onChanged();
  }

  function confirmThen(question: string, then: () => void): void {
    asking = { question, then };
  }

  /** Deleting cannot be undone: the save and its backup go. */
  function remove(s: SlotSummary): void {
    const label = s.status === "ok" ? s.name : t("saves.slot", { slot: s.index });
    confirmThen(t("saves.confirmDelete", { name: label, slot: s.index }), () => void run(window.soulSilver.deleteSave(s.index), t("saves.deleted")));
  }

  /** Spec 024: the story starts again in the slot; name, character and play time stay, the old save becomes the backup. */
  function restart(slot: number): void {
    confirmThen(t("saves.confirmRestartStory", { slot }), () => {
      void window.soulSilver.restartStory(slot).then((result) => {
        if (result.ok) onPick(slot);
        else message = result.reason;
        onChanged();
      });
    });
  }

  function importInto(s: SlotSummary): void {
    const occupied = s.status !== "empty";
    const go = () => void run(window.soulSilver.importSave(s.index, occupied), t("saves.imported"));
    if (occupied) confirmThen(t("saves.confirmImport", { slot: s.index }), go);
    else go();
  }
</script>

<section use:menu={{ onBack }}>
  <h2>{t("play.chooseSave")}</h2>
  <ul class="list-none p-0 grid gap-3 max-w-[40rem]" bind:this={list}>
    {#each slots as s (s.index)}
      <li class="grid gap-[0.4rem]">
        {#if s.status === "ok"}
          <button type="button" class="grid gap-[0.2rem] text-left px-4 py-3" data-slot={s.index} onclick={() => (s.staleStory ? (stale = s.index) : onPick(s.index))}>
            <strong>{s.name}</strong>
            <span>{t("saves.summary", { slot: s.index, time: playTime(s.playTimeMs), badges: s.badges })}</span>
            {#if s.staleStory}<span class="text-danger">{t("saves.staleStory")}</span>{/if}
          </button>
          {#if stale === s.index}
            <p class="m-0">{t("saves.staleStoryExplain")}</p>
            <div class="flex gap-2">
              <SmallButton onclick={() => restart(s.index)}>{t("saves.restartStory")}</SmallButton>
              <SmallButton onclick={() => onPick(s.index)}>{t("saves.continueStale")}</SmallButton>
            </div>
          {/if}
          <div class="flex gap-2">
            <SmallButton onclick={() => void run(window.soulSilver.exportSave(s.index), t("saves.exported"))}>{t("saves.export")}</SmallButton>
            <SmallButton onclick={() => importInto(s)}>{t("saves.import")}</SmallButton>
            <SmallButton danger onclick={() => remove(s)}>{t("saves.delete")}</SmallButton>
          </div>
        {:else if s.status === "empty"}
          <button type="button" class="grid gap-[0.2rem] text-left px-4 py-3" onclick={() => onNew(s.index)}>
            <strong>{t("saves.newGame")}</strong>
            <span>{t("saves.emptySlot", { slot: s.index })}</span>
          </button>
          <div class="flex gap-2">
            <SmallButton onclick={() => importInto(s)}>{t("saves.import")}</SmallButton>
          </div>
        {:else}
          <p class="text-danger m-0">{s.status === "corrupt" ? t("saves.corrupt", { slot: s.index, reason: s.reason }) : t("saves.unrecoverable", { slot: s.index, reason: s.reason })}</p>
          <div class="flex gap-2">
            {#if s.status === "corrupt"}
              <SmallButton onclick={() => void run(window.soulSilver.restoreBackup(s.index), t("saves.restored"))}>{t("saves.restore")}</SmallButton>
            {/if}
            <SmallButton onclick={() => confirmThen(t("saves.confirmOverwrite", { slot: s.index }), () => onNew(s.index))}>{t("saves.newGameOverwrite")}</SmallButton>
            <SmallButton onclick={() => importInto(s)}>{t("saves.import")}</SmallButton>
            <SmallButton danger onclick={() => remove(s)}>{t("saves.delete")}</SmallButton>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if message}<p role="status">{message}</p>{/if}
  <button type="button" onclick={onBack}>{t("common.back")}</button>
</section>

{#if asking}
  <Confirm
    question={asking.question}
    onAnswer={(yes: boolean) => {
      const then = asking?.then;
      asking = undefined;
      if (yes) then?.();
    }}
  />
{/if}
