<script lang="ts">
  // R.3: the host invites one guest over the internet: an invite code out, the guest's answer code back.
  import { bridge, inviteGuest, type HostInvite } from "../net/peer";
  import { hostLink } from "../net/peer-link";
  import { settings } from "../settings";
  import { t } from "../i18n";

  let invite = $state<HostInvite | undefined>();
  let answer = $state("");
  let step = $state<"idle" | "creating" | "waiting" | "connecting" | "connected">("idle");
  let error = $state<string | undefined>();
  let copied = $state(false);

  async function create(): Promise<void> {
    invite?.cancel();
    error = undefined;
    answer = "";
    copied = false;
    step = "creating";
    try {
      invite = await inviteGuest($settings.stunServer);
      step = "waiting";
    } catch (e) {
      error = (e as Error).message;
      step = "idle";
    }
  }

  async function connect(): Promise<void> {
    const current = invite;
    if (!current) return;
    error = undefined;
    step = "connecting";
    try {
      const channel = await current.accept(answer);
      const port = await hostLink();
      bridge(channel, port, () => current.cancel());
      invite = undefined;
      step = "connected";
    } catch (e) {
      error = (e as Error).message;
      step = "waiting";
    }
  }

  function cancel(): void {
    invite?.cancel();
    invite = undefined;
    step = "idle";
  }

  async function copy(): Promise<void> {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.code);
    copied = true;
  }
</script>

<section class="grid gap-2">
  <h3 class="m-0 text-[1rem]">{t("invite.title")}</h3>
  <small class="text-muted">{t("invite.note")}</small>
  {#if step === "idle" || step === "connected"}
    {#if step === "connected"}<p class="m-0" role="status">{t("invite.connected")}</p>{/if}
    <button type="button" class="justify-self-start" onclick={() => void create()}>{t("invite.create")}</button>
  {:else if step === "creating"}
    <p class="m-0 text-muted" role="status">{t("invite.creating")}</p>
  {:else if invite}
    <label class="grid gap-1">
      {t("invite.code")}
      <textarea class="[font:inherit] text-[0.75rem] break-all" rows="3" readonly value={invite.code}></textarea>
    </label>
    <button type="button" class="justify-self-start" onclick={() => void copy()}>{copied ? t("invite.copied") : t("invite.copy")}</button>
    <label class="grid gap-1">
      {t("invite.answer")}
      <textarea class="[font:inherit] text-[0.75rem] break-all" rows="3" bind:value={answer} spellcheck="false"></textarea>
    </label>
    <div class="flex gap-2">
      <button type="button" disabled={answer.trim() === "" || step === "connecting"} onclick={() => void connect()}>{step === "connecting" ? t("invite.connecting") : t("invite.connect")}</button>
      <button type="button" onclick={cancel}>{t("invite.cancel")}</button>
    </div>
  {/if}
  {#if error}<p class="m-0 text-danger" role="alert">{error}</p>{/if}
</section>
