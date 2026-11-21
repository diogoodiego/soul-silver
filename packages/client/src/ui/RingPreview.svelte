<script lang="ts">
  // The ring an indoor map builds (item V.3), in 3D, with `move`'s battle effect looping on it when given and
  // `user` (a sprite frame) standing where the move starts. No map: the open field's plain ground.
  import { onMount } from "svelte";
  import type { Frame } from "../game/game-data";
  import { createPreviewStage, STAGE_H, STAGE_W, USER_AT } from "../render/preview-stage";
  import Sprite from "./Sprite.svelte";

  let {
    ring,
    move,
    user,
    class: extra,
  }: { ring: number | undefined; move?: number | undefined; user?: Promise<Frame | undefined> | undefined; class?: string } = $props();

  let canvas: HTMLCanvasElement;
  let stage = $state<ReturnType<typeof createPreviewStage>>();

  onMount(() => {
    stage = createPreviewStage(canvas);
    return () => stage?.dispose();
  });
  $effect(() => void stage?.showRing(ring));
  $effect(() => stage?.playMove(move));
</script>

<div class={["relative overflow-hidden rounded-lg border border-solid border-default bg-surface-raised", extra]} style:aspect-ratio="{STAGE_W} / {STAGE_H}">
  <canvas bind:this={canvas} class="size-full [image-rendering:pixelated]" aria-hidden="true"></canvas>
  {#if user}
    <!-- Feet on the spot the move starts from. -->
    <span class="absolute -translate-x-1/2 -translate-y-full" style:left="{USER_AT.x * 100}%" style:top="{USER_AT.y * 100}%">
      <Sprite frame={user} scale={0.75} />
    </span>
  {/if}
</div>
