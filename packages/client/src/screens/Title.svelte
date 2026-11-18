<script lang="ts">
  // Title screen (spec 017, US1): the original title art, the app version and "press (confirm) to start".
  import { onMount } from "svelte";
  import { t } from "../i18n";
  import { playTitleMusic } from "../audio";
  import { input } from "../input/app-input";
  import { PAD_BUTTONS } from "@soulsilver/shared/input";
  import Glyph from "../ui/Glyph.svelte";
  import { slideUp } from "./slide-up";

  let { version, onStart }: { version: string | undefined; onStart: () => void } = $props();

  /** Written by the extractor's title stage; missing on an old extraction until it runs again. */
  const ART = "assets://stages/title/title";
  let artMissing = $state(false);

  onMount(() => {
    void playTitleMusic();
    // Confirm (Enter, Space, pad A) or the pad's Start; "menu" is also Tab/Escape, so Start is read off the pad.
    const startPressed = () => navigator.getGamepads().some((p) => p?.buttons[PAD_BUTTONS.menu]?.pressed);
    const offAction = input.onAction((action) => {
      if (action === "confirm" || (action === "menu" && startPressed())) onStart();
    });
    return () => {
      offAction();
    };
  });
</script>

<section class="fixed inset-0 grid place-items-center content-center gap-6" in:slideUp out:slideUp>
  {#if artMissing}
    <h1 class="relative text-[3rem] m-0">SoulSilver Desktop</h1>
  {:else}
    <div class="relative w-[min(90vw,calc(75vh*4/3))] aspect-[4/3]">
      <!-- The screen map is taller than the DS screen; the logo sits at its top. -->
      <img class="absolute inset-0 w-full h-full object-cover object-top [image-rendering:pixelated]" src="{ART}/logo.png" alt="Pokémon SoulSilver" onerror={() => (artMissing = true)} />
    </div>
  {/if}
  <p class="relative text-[1.3rem] animate-title-pulse motion-reduce:animate-none" aria-live="polite">{t("title.press")} <Glyph action="confirm" round /> {t("title.toStart")}</p>
  <p class="absolute right-4 bottom-3 m-0 text-quiet text-[0.85rem]">{t("app.version", { version: version ?? "—" })}</p>
</section>
