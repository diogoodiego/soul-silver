<script lang="ts">
  // The screen flow (spec 017): first run → title → main menu → play (save → mode → match) → game.
  import type { AssetsState, UpdateState } from "@soulsilver/shared";
  import { onMount } from "svelte";
  import FirstRun from "./screens/FirstRun.svelte";
  import GameSession from "./screens/GameSession.svelte";
  import { t } from "./i18n";
  import type { PlayRequest } from "./play-request";
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

  type Screen = "title" | "home" | "about" | "settings" | "play";
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

  /** Bumped on reconnect so the game screen starts over. */
  let attempt = $state(0);

  async function reconnect(): Promise<string | undefined> {
    if (!play?.address) return t("game.noAddress");
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
</script>

{#if showMain && !play && (screen === "title" || screen === "home" || screen === "settings" || screen === "play")}
  <div class="fixed inset-0 overflow-hidden bg-black" class:crt={$settings.crt} aria-hidden="true" use:backdrop></div>
  <div class="fixed inset-0 bg-black/40" aria-hidden="true"></div>
{/if}
<!-- Positioned, so it paints over the fixed backdrop above it (static content would sit under it). -->
<main class="relative p-8">
  {#if !showMain}
    <h1>SoulSilver Desktop</h1>
    <FirstRun {assets} />
    <p class="text-quiet text-[0.85rem]">{t("app.version", { version: appVersion ?? "—" })}</p>
  {:else if play}
    {#key attempt}
      <GameSession {play} onExit={() => ((play = undefined), go("home"))} onReconnect={play.address ? reconnect : undefined} onSwitch={play.arena ? undefined : (address: string) => void switchTo(address)} />
    {/key}
  {:else if screen === "title"}
    <Title version={appVersion} onStart={() => go("home", 1)} />
  {:else if screen === "home"}
    <Home notice={switchError} {update} {serverReady} serverFailed={failed} onPlay={() => go("play")} onSettings={() => go("settings")} onAbout={() => go("about")} onBack={() => go("title", -1)} />
  {:else if screen === "about"}
    <About version={appVersion} onBack={() => go("home")} />
  {:else if screen === "settings"}
    <Settings onBack={() => go("home")} />
  {:else}
    <Play onPlay={(request: PlayRequest) => (play = request)} onBack={() => go("home")} />
  {/if}
</main>
