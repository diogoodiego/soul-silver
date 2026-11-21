<script lang="ts">
  // Block H: the ball the next throw uses, beside the team's slots: its bag icon, how many are left, and arrows
  // (or the next-ball key) to step through the kinds in the bag. With none left, a greyed Poké Ball at ×0.
  import Button from "../ui/Button.svelte";
  import { t } from "../i18n";
  import BallIcon from "./BallIcon.svelte";
  import Glyph from "../ui/Glyph.svelte";

  let {
    balls,
    selected,
    itemName,
    onStep,
  }: {
    /** The bag's balls, in bag order. */
    balls: readonly { item: number; count: number }[];
    /** The server's pick; the first ball when unset or gone, as the server throws. */
    selected: number | undefined;
    itemName: (item: number) => string;
    onStep: (step: 1 | -1) => void;
  } = $props();

  const current = $derived(balls.find((b) => b.item === selected) ?? balls[0]);
  const many = $derived(balls.length > 1);
</script>

<div class="flex items-center gap-1.5 rounded-full bg-surface-overlay py-0.5 pl-1 pr-2 backdrop-blur-[2px]" role="group" aria-label={t("hud.balls")}>
  {#if many}
    <Button tabindex={-1} variant="bare" class="pointer-events-auto px-0.5 text-sm leading-none text-secondary hover:text-primary" onclick={() => onStep(-1)} aria-label={t("hud.prevBall")}>‹</Button>
  {/if}
  <span class="grid place-items-center" title={current ? itemName(current.item) : t("hud.noBalls")}>
    <BallIcon item={current?.item} />
  </span>
  <span class="text-xs font-bold tabular-nums leading-none" role="status">
    <span class="sr-only">{current ? itemName(current.item) : t("hud.noBalls")}</span>×{current?.count ?? 0}
  </span>
  {#if many}
    <Button tabindex={-1} variant="bare" class="pointer-events-auto px-0.5 text-sm leading-none text-secondary hover:text-primary" onclick={() => onStep(1)} aria-label={t("hud.nextBall")}>›</Button>
    <span class="text-sm"><Glyph action="nextBall" round /></span>
  {/if}
</div>
