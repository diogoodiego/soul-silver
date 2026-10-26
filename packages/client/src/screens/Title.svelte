<script lang="ts">
  // Title screen (spec 017, US1): the original title art, the app version and "press any button".
  import { onMount } from "svelte";
  import { t } from "../i18n";
  import { playTitleMusic } from "../audio";
  import { input } from "../input/app-input";

  let { version, onStart }: { version: string | undefined; onStart: () => void } = $props();

  /** Written by the extractor's title stage; missing on an old extraction until it runs again. */
  const ART = "assets://stages/title/title";
  let artMissing = $state(false);

  onMount(() => {
    void playTitleMusic();
    const start = () => onStart();
    // Any key, click or pad button; the pad arrives as an action.
    const offAction = input.onAction(start);
    window.addEventListener("keydown", start, { once: true });
    window.addEventListener("click", start, { once: true });
    return () => {
      offAction();
      window.removeEventListener("keydown", start);
      window.removeEventListener("click", start);
    };
  });
</script>

<section class="fixed inset-0 grid place-items-center content-center gap-6 bg-black">
  {#if artMissing}
    <h1 class="text-[3rem] m-0">SoulSilver Desktop</h1>
  {:else}
    <div class="relative w-[min(90vw,calc(75vh*4/3))] aspect-[4/3] bg-size-[100%_100%] [image-rendering:pixelated]" style:background-image="url({ART}/background.png)">
      <!-- The screen map is taller than the DS screen; the logo sits at its top. -->
      <img class="absolute inset-0 w-full h-full object-cover object-top [image-rendering:pixelated]" src="{ART}/logo.png" alt="Pokémon SoulSilver" onerror={() => (artMissing = true)} />
    </div>
  {/if}
  <p class="text-[1.3rem] animate-title-pulse motion-reduce:animate-none" aria-live="polite">{t("title.pressAny")}</p>
  <p class="absolute right-4 bottom-3 m-0 text-quiet text-[0.85rem]">{t("app.version", { version: version ?? "—" })}</p>
</section>
