<script lang="ts">
  // A trainer calling out a move: its battle sprite from the extraction (one per trainer class) and the move's name.
  import { t } from "../i18n";
  import { trainerSprites, type Frame } from "./game-data";

  let { pic, move }: { pic: number; move: string } = $props();

  let frame = $state<Frame | undefined>();
  $effect(() => {
    const id = pic;
    void trainerSprites().then((map) => (frame = map.get(id)));
  });
</script>

<div class="flex items-end gap-1 pointer-events-none" role="status">
  {#if frame}
    <span
      class="shrink-0 [image-rendering:pixelated]"
      aria-hidden="true"
      style:width="{frame.w}px"
      style:height="{frame.h}px"
      style:background-image="url({frame.url})"
      style:background-position="-{frame.x}px -{frame.y}px"
    ></span>
  {/if}
  <p class="m-0 mb-6 px-3 py-1 rounded-[6px] border-3 border-frame bg-white/96 text-ink palette-ink text-[1.1rem] animate-[call_0.15s_ease-out]">{t("hud.call", { move })}</p>
</div>

<style>
  @keyframes call {
    from {
      transform: scale(0.6);
    }
  }
</style>
