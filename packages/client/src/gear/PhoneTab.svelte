<script lang="ts">
  // The Pokégear phone (spec 026): registered numbers, who seeks a rematch, and the last calls.
  import Button from "../ui/Button.svelte";
  import { t } from "../i18n";

  let { contacts, log, onDial }: { contacts: { id: number; name: string; seeking: boolean }[]; log: { name: string; direction: "in" | "out"; at: string }[]; onDial: (id: number) => void } = $props();
</script>

<div class="grid gap-2">
  <ul class="m-0 p-0 list-none grid gap-1">
    {#each contacts as c (c.id)}
      <li class="flex items-center gap-3">
        <Button onclick={() => onDial(c.id)}>{t("phone.call", { name: c.name })}</Button>
        {#if c.seeking}<span class="text-[0.85rem]">{t("phone.seeking")}</span>{/if}
      </li>
    {:else}
      <li>{t("phone.empty")}</li>
    {/each}
  </ul>
  <h3 class="m-0 text-[1rem]">{t("phone.log")}</h3>
  <ul class="m-0 pl-5">
    {#each [...log].reverse() as l, i (i)}<li>{t(l.direction === "in" ? "phone.logIn" : "phone.logOut", { name: l.name, at: new Date(l.at).toLocaleString("pt-BR") })}</li>{:else}<li>{t("gear.none")}</li>{/each}
  </ul>
</div>
