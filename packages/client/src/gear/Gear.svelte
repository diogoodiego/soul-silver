<script lang="ts">
  // The Pokégear (spec 026, US3): map, phone, radio and clock, as a page of the in-game menu.
  import Button from "../ui/Button.svelte";
  import { t, type MessageKey } from "../i18n";
  import { menu } from "../input/menu";
  import ClockTab from "./ClockTab.svelte";
  import MapTab from "./MapTab.svelte";
  import PhoneTab from "./PhoneTab.svelte";
  import RadioTab from "./RadioTab.svelte";

  type Props = {
    map: import("svelte").ComponentProps<typeof MapTab>;
    phone: { contacts: { id: number; name: string; seeking: boolean }[]; log: { name: string; direction: "in" | "out"; at: string }[] };
    radio: { stations: { id: string; title: string }[]; tuned: string | null; lines: string[] };
    clock: { minuteOfDay: number; weekday: number } | undefined;
    onDial: (id: number) => void;
    onTune: (id: string | null) => void;
    onBack: () => void;
  };
  let { map, phone, radio, clock, onDial, onTune, onBack }: Props = $props();
  const TABS = ["map", "phone", "radio", "clock"] as const;
  let tab = $state<(typeof TABS)[number]>("map");
</script>

<section class="grid gap-3" aria-label={t("gear.title")} use:menu={{ onBack }}>
  <h2 class="m-0">{t("gear.title")}</h2>
  <div class="flex gap-2" role="tablist">
    {#each TABS as id (id)}
      <Button role="tab" aria-selected={tab === id} variant="ghost" onclick={() => (tab = id)}>{t(`gear.${id}` as MessageKey)}</Button>
    {/each}
  </div>
  {#if tab === "map"}
    <MapTab {...map} />
  {:else if tab === "phone"}
    <PhoneTab contacts={phone.contacts} log={phone.log} {onDial} />
  {:else if tab === "radio"}
    <RadioTab {...radio} {onTune} />
  {:else if clock}
    <ClockTab {...clock} />
  {/if}
  <Button onclick={onBack}>{t("common.back")}</Button>
</section>
