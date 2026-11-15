<script lang="ts">
  // The hatch animation (spec 029.4), after the original's EggHatchAnim: the egg wobbles, cracks, bursts in a
  // white flash and the Pokémon shows. Timers drive the phases, so it ends the same with reduced motion.
  // shortcut: the extraction has no egg sprite, so the egg is drawn here; use the ROM's when the sprites include it.
  import { t } from "../i18n";
  import { pokemonFronts } from "./game-data";

  let { species, speciesName, onDone }: { species: number; speciesName: (id: number) => string; onDone: () => void } = $props();

  const WOBBLE_MS = 2400;
  const FLASH_MS = 500;
  const SHOWN_MS = 700;

  let phase = $state<"egg" | "flash" | "mon">("egg");
  let fronts = $state<Awaited<ReturnType<typeof pokemonFronts>>>(new Map());
  const front = $derived(fronts.get(species));
  $effect(() => {
    void pokemonFronts().then((m) => (fronts = m));
    const timers = [
      setTimeout(() => (phase = "flash"), WOBBLE_MS),
      setTimeout(() => (phase = "mon"), WOBBLE_MS + FLASH_MS),
      setTimeout(() => onDone(), WOBBLE_MS + FLASH_MS + SHOWN_MS),
    ];
    return () => timers.forEach(clearTimeout);
  });
</script>

<section class="absolute inset-0 z-2 grid place-items-center bg-[radial-gradient(circle_at_50%_45%,#6d8f6a,#1f2a1e)]" aria-label={t("hatch.title")} aria-live="polite">
  {#if phase === "mon"}
    {#if front}
      <span
        class="block [image-rendering:pixelated] [zoom:2]"
        role="img"
        aria-label={speciesName(species)}
        style:width="{front.w}px"
        style:height="{front.h}px"
        style:background-image="url({front.url})"
        style:background-position="-{front.x}px -{front.y}px"
      ></span>
    {:else}
      <p class="m-0 font-bold text-[#eef]">{speciesName(species)}</p>
    {/if}
  {:else}
    <!-- A cream egg with green spots; it cracks in the last wobbles. -->
    <span class="egg relative block w-20 h-24 motion-reduce:animate-none" class:cracked={phase === "flash"} role="img" aria-label={t("party.egg")}>
      <span class="absolute left-3 top-6 size-5 rounded-full bg-[#5aa05a]"></span>
      <span class="absolute right-3 top-12 size-6 rounded-full bg-[#5aa05a]"></span>
      <span class="absolute left-7 bottom-3 size-4 rounded-full bg-[#5aa05a]"></span>
    </span>
  {/if}
  {#if phase === "flash"}<span class="absolute inset-0 bg-white flash motion-reduce:animate-none" aria-hidden="true"></span>{/if}
</section>

<style>
  .egg {
    border-radius: 50% 50% 46% 46% / 58% 58% 42% 42%;
    background: radial-gradient(circle at 35% 30%, #fffbe8, #efe3b8 70%, #cdbd8a);
    box-shadow: 0 6px 0 #0004;
    transform-origin: 50% 90%;
    animation: wobble 2.4s ease-in-out;
  }
  .egg.cracked::after {
    content: "";
    position: absolute;
    inset: 38% 8% auto;
    height: 10px;
    background: linear-gradient(135deg, transparent 45%, #6b5a2a 45% 55%, transparent 55%) 0 0 / 14px 10px repeat-x;
  }
  .flash {
    animation: flash 0.5s ease-out forwards;
  }
  @keyframes wobble {
    0%, 30%, 52%, 100% { transform: rotate(0deg); }
    10%, 40% { transform: rotate(-12deg); }
    20%, 46% { transform: rotate(12deg); }
    62%, 78%, 92% { transform: rotate(-16deg); }
    70%, 86% { transform: rotate(16deg); }
  }
  @keyframes flash {
    from { opacity: 1; }
    to { opacity: 0; }
  }
</style>
