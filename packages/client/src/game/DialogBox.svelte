<script lang="ts">
  // Text box (spec 017, US4): types the head of the dialog queue at the configured speed; confirm
  // finishes and advances, and a question ends in Yes/No (cancel is No). Clicks work the same.
  import { onMount } from "svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import { currentSettings } from "../settings";
  import type { DialogQueue, DialogView } from "./dialog-queue";

  let { queue }: { queue: DialogQueue } = $props();

  let view = $state<DialogView | undefined>();
  const refresh = () => (view = queue.view());

  onMount(() => {
    let last = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      queue.step(now - last, currentSettings().textSpeed);
      last = now;
      refresh();
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  });

  function onAction(action: string): boolean {
    if (action === "confirm") queue.confirm();
    else if (action === "cancel") queue.cancel();
    else if (view?.choosing && (action === "up" || action === "down" || action === "left" || action === "right")) queue.move();
    refresh();
    // The box owns every key while it is up.
    return true;
  }

  function choose(yes: boolean): void {
    if (view?.yes !== yes) queue.move();
    queue.confirm();
    refresh();
  }
</script>

{#if view}
  <div class="absolute left-1/2 bottom-4 -translate-x-1/2 w-[min(92%,40rem)] z-3" role="dialog" aria-live="polite" use:menu={{ onAction }}>
    <!-- Keys and the pad advance through the menu action; the click is the mouse's way. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <p
      class="m-0 min-h-[3.5em] px-4 py-3 bg-white/96 text-ink border-3 border-frame rounded-[6px] text-[1.1rem] leading-[1.5] whitespace-pre-line cursor-pointer"
      onclick={() => {
        queue.confirm();
        refresh();
      }}
    >
      {view.text}{#if view.complete && !view.choosing}<span class="ml-[0.4rem] animate-bob motion-reduce:animate-none" aria-hidden="true">▼</span>{/if}
    </p>
    {#if view.choosing}
      <div class="absolute right-0 bottom-[calc(100%+0.4rem)] grid gap-1 p-[0.4rem] bg-white/96 border-3 border-frame rounded-[6px]">
        <button type="button" class={["text-left bg-transparent border-none text-ink", view.yes && "before:content-['▶_']"]} onclick={() => choose(true)}>{t("common.yes")}</button>
        <button type="button" class={["text-left bg-transparent border-none text-ink", !view.yes && "before:content-['▶_']"]} onclick={() => choose(false)}>{t("common.no")}</button>
      </div>
    {/if}
  </div>
{/if}
