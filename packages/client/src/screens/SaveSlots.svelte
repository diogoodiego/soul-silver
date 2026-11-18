<script lang="ts">
  // Play, step 1 (spec 017, US2): the 3 slots with name, play time and badges; an empty slot starts
  // a new game. Restore, export and import stay from spec 012 (US1, US3, US7).
  import type { Action } from "@soulsilver/shared/input";
  import { CANCELLED, type SaveResult, type SlotSummary } from "@soulsilver/shared/save";
  import { tick } from "svelte";
  import Confirm from "../ui/Confirm.svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import Glyph from "../ui/Glyph.svelte";
  import HoldButton from "../ui/HoldButton.svelte";
  import KeyHints from "../ui/KeyHints.svelte";
  import MenuItem from "../ui/MenuItem.svelte";
  import SmallButton from "../ui/SmallButton.svelte";

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

  const hints = [
    { actions: ["confirm" as const], label: t("hints.select") },
    { actions: ["cancel" as const], label: t("hints.back") },
    { actions: ["up" as const, "down" as const], label: t("hints.navigate") },
  ];
  /** Slot actions on their own buttons, for the focused slot; the arrows never land on them (tabindex -1). */
  const EXPORT = "move2";
  const IMPORT = "move3";
  const DELETE = "picker";
  /** The slot whose button has the focus. */
  let current = $state<number | undefined>();
  const focusedSlot = $derived(slots.find((s) => s.index === current));

  function onAction(action: Action): boolean {
    const s = focusedSlot;
    if (!s) return false;
    if (action === EXPORT && s.status === "ok") void run(window.soulSilver.exportSave(s.index), t("saves.exported"));
    else if (action === IMPORT) importInto(s);
    // Delete is held, not pressed: its HoldButton watches the action and confirms when full.
    else if (action !== DELETE) return false;
    return true;
  }
  /** A slot: the main menu's pill, on two lines; all as wide as the widest, so up/down go slot by slot. */
  const SLOT = "group grid justify-self-stretch gap-[0.1rem] justify-items-end rounded-2xl border-0 bg-transparent px-4 py-2 text-right text-zinc-200 outline-none focus:bg-white focus:text-ink";

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

{#snippet shortcut(s: SlotSummary, action: Action, label: string, onclick: () => void)}
  <SmallButton tabindex={-1} {onclick}>
    <span class="inline-flex items-center gap-1">{#if current === s.index}<Glyph {action} round />{/if}{label}</span>
  </SmallButton>
{/snippet}

<!-- The main menu's look: right edge, vertically centred, over the title backdrop. -->
<section class="fixed inset-0 flex flex-col items-end justify-center gap-2 pr-12 text-right" use:menu={{ onBack, onAction }} onfocusin={(event) => (current = Number((event.target as HTMLElement).dataset["slot"]) || undefined)}>
  <h2 class="m-0 text-[1.4rem]">{t("play.chooseSave")}</h2>
  <ul class="m-0 grid list-none justify-items-stretch gap-3 p-0" bind:this={list}>
    {#each slots as s (s.index)}
      <li class="grid justify-items-end gap-[0.4rem]">
        {#if s.status === "ok"}
          <button type="button" class={SLOT} data-slot={s.index} onclick={() => (s.staleStory ? (stale = s.index) : onPick(s.index))}>
            <strong class="flex items-center gap-2 text-[1.15rem]"><span class="hidden group-focus:inline-flex"><Glyph action="confirm" round /></span>{s.name}</strong>
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
            {@render shortcut(s, EXPORT, t("saves.export"), () => void run(window.soulSilver.exportSave(s.index), t("saves.exported")))}
            {@render shortcut(s, IMPORT, t("saves.import"), () => importInto(s))}
            <HoldButton label={t("saves.delete")} action={DELETE} armed={current === s.index && !asking} onHeld={() => remove(s)} />
          </div>
        {:else if s.status === "empty"}
          <button type="button" class={SLOT} data-slot={s.index} onclick={() => onNew(s.index)}>
            <strong class="flex items-center gap-2 text-[1.15rem]"><span class="hidden group-focus:inline-flex"><Glyph action="confirm" round /></span>{t("saves.newGame")}</strong>
            <span>{t("saves.emptySlot", { slot: s.index })}</span>
          </button>
          <div class="flex gap-2">
            {@render shortcut(s, IMPORT, t("saves.import"), () => importInto(s))}
          </div>
        {:else}
          <p class="text-danger m-0">{s.status === "corrupt" ? t("saves.corrupt", { slot: s.index, reason: s.reason }) : t("saves.unrecoverable", { slot: s.index, reason: s.reason })}</p>
          <div class="flex gap-2">
            {#if s.status === "corrupt"}
              <SmallButton onclick={() => void run(window.soulSilver.restoreBackup(s.index), t("saves.restored"))}>{t("saves.restore")}</SmallButton>
            {/if}
            <SmallButton onclick={() => confirmThen(t("saves.confirmOverwrite", { slot: s.index }), () => onNew(s.index))}>{t("saves.newGameOverwrite")}</SmallButton>
            <SmallButton onclick={() => importInto(s)}>{t("saves.import")}</SmallButton>
            <HoldButton label={t("saves.delete")} action={DELETE} armed={false} onHeld={() => remove(s)} />
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if message}<p role="status">{message}</p>{/if}
  <MenuItem label={t("common.back")} onclick={onBack} />
  <div class="absolute right-12 bottom-6"><KeyHints {hints} /></div>
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
