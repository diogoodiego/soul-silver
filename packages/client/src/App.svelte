<script lang="ts">
  // The screen flow (spec 017): first run → title → main menu → play (save → mode → match) or arena → game.
  import type { AssetsState, UpdateState } from "@soulsilver/shared";
  import { onMount } from "svelte";
  import FirstRun from "./screens/FirstRun.svelte";
  import GameSession from "./screens/GameSession.svelte";
  import { t } from "./i18n";
  import type { PlayRequest } from "./play-request";
  import { arenaSave } from "@soulsilver/shared/save";
  import type { ArenaSpec } from "@soulsilver/shared/game";
  import ArenaSetup from "./screens/ArenaSetup.svelte";
  import About from "./screens/About.svelte";
  import Home from "./screens/Home.svelte";
  import Play from "./screens/Play.svelte";
  import Settings from "./screens/Settings.svelte";
  import { slide } from "./screens/slide-up";
  import Title from "./screens/Title.svelte";
  import { loadSettings, settings } from "./settings";
  import { createTitleBackdrop } from "./render/title-backdrop";

  /** Mounts the moving scenery; kept while the title hands over to the main menu. */
  const backdrop = (node: HTMLElement) => ({ destroy: createTitleBackdrop(node) });

  /** How long "Assets prontos" stays up after an extraction before the title. */
  const READY_NOTICE_MS = 1000;

  type Screen = "title" | "home" | "about" | "settings" | "play" | "arena";
  let screen = $state<Screen>("title");
  /** `dir` slides title ⇄ menu (1 up, -1 down); every other change is instant. */
  function go(next: Screen, dir: -1 | 0 | 1 = 0): void {
    slide.dir = dir;
    screen = next;
  }
  let appVersion = $state<string | undefined>();
  let serverReady = $state(false);
  let failed = $state(false);
  let update = $state<UpdateState>({ status: "disabled" });
  let assets = $state<AssetsState>({ status: "checking" });
  let showMain = $state(false);
  let play = $state<PlayRequest | undefined>();
  /** Why the last switch to another session failed, shown on the main menu. */
  let switchError = $state<string | undefined>();

  /** From the Online tab: the old session saved and closed; join the new host with the same slot. */
  async function switchTo(address: string): Promise<void> {
    const slot = play!.slot;
    if (slot === undefined) return;
    const result = await window.soulSilver.joinSession(slot, address);
    if (result.ok) {
      play = { save: result.save, slot, address };
      attempt++;
      return;
    }
    play = undefined;
    go("home");
    switchError = result.reason;
  }

  let arenaBusy = $state(false);
  /** The dev arena runs on no save: the session opens on no slot and the game gets a throwaway one. */
  async function startArena(spec: ArenaSpec): Promise<void> {
    if (arenaBusy) return;
    arenaBusy = true;
    await window.soulSilver.startArena();
    arenaBusy = false;
    play = { save: arenaSave(spec.trainer.name, spec.trainer.character, new Date().toISOString()), arena: spec };
  }

  /** Bumped on reconnect so the game screen starts over. */
  let attempt = $state(0);

  async function reconnect(): Promise<string | undefined> {
    if (!play?.address || play.slot === undefined) return t("game.noAddress");
    const result = await window.soulSilver.joinSession(play.slot, play.address);
    if (!result.ok) return result.reason;
    play = { ...play, save: result.save };
    attempt++;
    return undefined;
  }

  function onAssets(next: AssetsState): void {
    const wasExtracting = assets.status === "extracting";
    assets = next;
    if (next.status !== "ready") {
      showMain = false;
    } else if (wasExtracting) {
      setTimeout(() => (showMain = true), READY_NOTICE_MS);
    } else {
      showMain = true;
    }
  }

  onMount(() => {
    const api = window.soulSilver;
    void loadSettings();
    const unsubscribeStatus = api.onServerStatus((next) => {
      // The server starts only once the assets are ready, so readiness comes from its status, not a request at mount.
      if (next.state === "stopped") failed = true;
      else if (next.state === "running") serverReady = true;
    });
    const unsubscribeUpdate = api.onUpdateState((next) => {
      update = next;
    });
    const unsubscribeAssets = api.onAssetsState(onAssets);
    void api.getAppVersion().then((version) => {
      appVersion = version;
    });
    void api.getUpdateState().then((state) => {
      update = state;
    });
    void api.getAssetsState().then(onAssets);
    return () => {
      unsubscribeStatus();
      unsubscribeUpdate();
      unsubscribeAssets();
    };
  });

  // 4×4 Bayer thresholds, (k + 0.5) / 16 as greys, one 2 px cell each: the tile the #dex-dither filter repeats.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayerTile =
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges">${BAYER.map((k, i) => `<rect x="${(i % 4) * 2}" y="${Math.floor(i / 4) * 2}" width="2" height="2" fill="rgb(${k * 16 + 8},${k * 16 + 8},${k * 16 + 8})"/>`).join("")}</svg>`,
    );
</script>

<!-- The ordered dither of the Pokédex screen (the `dither` utility): each pixel's own colour (made opaque), nudged by
     the Bayer threshold and cut to 4 levels, then given its alpha back untouched, so translucent layers keep letting
     the glass (dithered by the model's shader) and its reflections through. -->
<svg class="absolute size-0" aria-hidden="true">
  <filter id="dex-dither" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
    <feImage href={bayerTile} x="0" y="0" width="8" height="8" result="cell" />
    <feTile in="cell" result="bayer" />
    <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="flat" />
    <feComposite in="flat" in2="bayer" operator="arithmetic" k2="1" k3="0.25" k4="-0.125" result="nudged" />
    <feComponentTransfer in="nudged" result="colour">
      <feFuncR type="discrete" tableValues="0 0.3333 0.6667 1" />
      <feFuncG type="discrete" tableValues="0 0.3333 0.6667 1" />
      <feFuncB type="discrete" tableValues="0 0.3333 0.6667 1" />
    </feComponentTransfer>
    <feComposite in="colour" in2="SourceGraphic" operator="in" />
  </filter>
</svg>

{#if showMain && !play && (screen === "title" || screen === "home" || screen === "settings" || screen === "play" || screen === "arena")}
  <div class="fixed inset-0 overflow-hidden bg-surface-canvas" class:crt={$settings.crt} aria-hidden="true" use:backdrop></div>
  <div class="fixed inset-0 bg-surface-overlay" aria-hidden="true"></div>
{/if}
<!-- Positioned, so it paints over the fixed backdrop above it (static content would sit under it). -->
<main class="relative p-8">
  {#if !showMain}
    <h1>SoulSilver Desktop</h1>
    <FirstRun {assets} />
    <p class="text-tertiary text-sm">{t("app.version", { version: appVersion ?? "—" })}</p>
  {:else if play}
    {#key attempt}
      <GameSession {play} onExit={() => ((play = undefined), go("home"))} onReconnect={play.address ? reconnect : undefined} onSwitch={play.arena ? undefined : (address: string) => void switchTo(address)} />
    {/key}
  {:else if screen === "title"}
    <Title version={appVersion} onStart={() => go("home", 1)} />
  {:else if screen === "home"}
    <Home notice={switchError} {update} {serverReady} serverFailed={failed} onPlay={() => go("play")} onArena={() => go("arena")} onSettings={() => go("settings")} onAbout={() => go("about")} onBack={() => go("title", -1)} />
  {:else if screen === "about"}
    <About version={appVersion} onBack={() => go("home")} />
  {:else if screen === "settings"}
    <Settings onBack={() => go("home")} />
  {:else if screen === "arena"}
    <ArenaSetup busy={arenaBusy} onStart={(spec: ArenaSpec) => void startArena(spec)} onBack={() => go("home")} />
  {:else}
    <Play onPlay={(request: PlayRequest) => (play = request)} onBack={() => go("home")} />
  {/if}
</main>
