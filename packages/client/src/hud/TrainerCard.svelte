<script lang="ts">
  // Block H: the Trainer Card app. The server sends the card on joining and on each change; opening the app
  // asks for a fresh one, since the play time runs.
  import Button from "../ui/Button.svelte";
  import type { ServerMessage } from "@soulsilver/shared/game";
  import { onMount } from "svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  type Card = Extract<ServerMessage, { type: "trainer-card" }>;
  let { card, onRefresh, onBack }: { card: Card | undefined; onRefresh: () => void; onBack: () => void } = $props();

  onMount(() => onRefresh());

  const playTime = (ms: number) => {
    const minutes = Math.floor(ms / 60_000);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  };
  const date = (iso: string | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : t("card.unknown"));
  const money = (n: number) => `₽ ${n.toLocaleString("pt-BR")}`;
  /** Bit i is badge i: the first 8 are Johto's, the rest Kanto's. */
  const REGIONS = [
    [0, 1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12, 13, 14, 15],
  ] as const;
</script>

<section class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 px-6 py-4" use:menu={{ onBack }}>
  <h2 class="m-0 text-xl">{t("card.title")}</h2>
  {#if card}
    <div class="grid grid-cols-[minmax(0,1fr)_auto] content-start gap-x-8 gap-y-3 rounded-[12px] bg-[linear-gradient(135deg,#2b3f6b,#1a2440)] p-5 text-primary shadow-[inset_0_0_0_2px_#ffffff22]">
      <div class="grid gap-1">
        <span class="text-xs uppercase tracking-wide opacity-70">{t("card.id")} {String(card.trainerId).padStart(5, "0")}</span>
        <strong class="text-2xl">{card.name}</strong>
      </div>
      <dl class="m-0 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 self-start text-right">
        <dt class="opacity-70">{t("card.money")}</dt>
        <dd class="m-0 tabular-nums">{money(card.money)}</dd>
        <dt class="opacity-70">{t("card.playTime")}</dt>
        <dd class="m-0 tabular-nums">{playTime(card.playTimeMs)}</dd>
        <dt class="opacity-70">{t("card.startedAt")}</dt>
        <dd class="m-0">{date(card.startedAt)}</dd>
        <dt class="opacity-70">{t("card.dex")}</dt>
        <dd class="m-0">{t("dex.counts", { seen: card.seen, caught: card.caught })}</dd>
        <dt class="opacity-70">{t("card.hallOfFame")}</dt>
        <dd class="m-0">{card.hallOfFame > 0 ? t("card.hallOfFame.count", { count: card.hallOfFame }) : t("card.hallOfFame.none")}</dd>
      </dl>
      <div class="col-span-full grid gap-2">
        <span class="text-xs uppercase tracking-wide opacity-70">{t("card.badges")}</span>
        {#each REGIONS as region, r (r)}
          <ol class="m-0 flex list-none gap-2 p-0">
            {#each region as bit (bit)}
              {@const has = (card.badgeSet & (1 << bit)) !== 0}
              <li class={["size-6 rotate-45 rounded-[5px] border-2", has ? "border-[#ffe9a8] bg-[linear-gradient(135deg,#ffd95a,#c8901e)] shadow-[0_0_6px_#ffd95a88]" : "border-white/25 bg-black/30"]}>
                <span class="sr-only">{has ? "✓" : "—"}</span>
              </li>
            {/each}
          </ol>
        {/each}
      </div>
    </div>
  {:else}
    <p class="m-0 opacity-70">…</p>
  {/if}
  <Button class="justify-self-start" onclick={onBack}>{t("common.back")}</Button>
</section>
