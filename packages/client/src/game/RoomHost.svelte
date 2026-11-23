<script lang="ts">
  // O.4: the host opens an online room: a code to pass on, or a place in the public list. The room lives in
  // net/room-store.ts, so it stays open while the player looks at other tabs.
  import { formatRoomCode } from "@soulsilver/shared/lobby";
  import Button from "../ui/Button.svelte";
  import { closeHostedRoom, hostedRoom, openHostedRoom, setRoomPlayers } from "../net/room-store";
  import { settings } from "../settings";
  import { t } from "../i18n";

  let { hostName, players }: { hostName: string; players: number } = $props();

  let roomName = $state("");
  let listed = $state(true);
  let copied = $state(false);

  $effect(() => setRoomPlayers(players));

  const room = $derived($hostedRoom);
  const active = $derived(room !== undefined && room.status !== "closed" && room.status !== "error");

  async function create(): Promise<void> {
    copied = false;
    const appVersion = await window.soulSilver.getAppVersion();
    openHostedRoom({
      lobbyUrl: $settings.lobbyServer,
      roomName: roomName.trim() || t("room.defaultName", { name: hostName }),
      hostName,
      appVersion,
      public: listed,
      hasPassword: $settings.roomPassword !== "",
    });
  }

  async function copy(): Promise<void> {
    if (!room?.code) return;
    await navigator.clipboard.writeText(formatRoomCode(room.code));
    copied = true;
  }
</script>

<section class="grid gap-2">
  <h3 class="m-0 text-base">{t("room.title")}</h3>
  <small class="text-secondary">{t("room.note")}</small>
  {#if !active}
    <label class="grid gap-1">
      {t("room.name")}
      <input class="[font:inherit]" bind:value={roomName} maxlength="40" placeholder={t("room.defaultName", { name: hostName })} autocomplete="off" />
    </label>
    <label class="flex gap-2 items-center">
      <input type="checkbox" bind:checked={listed} />
      {t("room.public")}
    </label>
    <Button class="justify-self-start" onclick={() => void create()}>{t("room.create")}</Button>
    {#if room?.status === "closed"}<p class="m-0 text-secondary" role="status">{t("room.closed")}</p>{/if}
  {:else if room?.status === "connecting"}
    <p class="m-0 text-secondary" role="status">{t("room.creating")}</p>
  {:else if room?.code}
    <p class="m-0">{t("room.code")}: <strong class="text-lg">{formatRoomCode(room.code)}</strong></p>
    <div class="flex gap-2">
      <Button onclick={() => void copy()}>{copied ? t("invite.copied") : t("invite.copy")}</Button>
      <Button onclick={closeHostedRoom}>{t("room.close")}</Button>
    </div>
  {/if}
  {#if room?.status === "reconnecting" || (room?.status === "open" && room.message)}<p class="m-0 text-secondary" role="status">{room.message}</p>{/if}
  {#if active && room?.turn === "unavailable"}<p class="m-0 text-secondary" role="status">{t("room.turnUnavailable")}</p>{/if}
  {#if active && room}
    <ul class="list-none m-0 p-0 grid gap-1 text-sm">
      {#each room.guests as g (g.id)}
        <li class={g.state === "failed" ? "text-danger" : "text-secondary"}>
          {g.state === "connecting" ? t("room.guestConnecting", { name: g.name }) : g.state === "connected" ? t("room.guestConnected", { name: g.name }) : t("room.guestFailed", { name: g.name })}
        </li>
      {/each}
    </ul>
  {/if}
  {#if room?.status === "error"}<p class="m-0 text-danger" role="alert">{room.message}</p>{/if}
</section>
