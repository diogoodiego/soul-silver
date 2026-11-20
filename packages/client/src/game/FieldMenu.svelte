<script lang="ts">
  // Field moves and field items from the menu (spec 025, US4): Fly, Flash, Dig and Teleport when a
  // party member knows them, the bicycle and the Escape Rope when they are in the bag. The server
  // decides; a refusal comes back as a line on the screen.
  import Button from "../ui/Button.svelte";
  import movesJson from "../../../../content/field/moves.json";
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  let { party, bag, riding, onField, onBack }: { party: { moves?: number[] | undefined }[]; bag: { item: number; count: number }[]; riding: boolean; onField: (msg: object) => void; onBack: () => void } = $props();

  const rules = movesJson.value;
  const has = (item: number) => bag.some((b) => b.item === item && b.count > 0);
  const known = $derived(["fly", "flash", "dig", "teleport"].filter((name) => party.some((m) => m.moves?.includes(rules.moves.find((r) => r.name === name)!.move))));
</script>

<section class="grid gap-2" use:menu={{ onBack }}>
  <h2 class="m-0">{t("field.menu.title")}</h2>
  {#each known as name (name)}
    <Button onclick={() => onField({ type: "field-use", move: name })}>{t(`field.menu.${name}` as "field.menu.fly")}</Button>
  {/each}
  {#if has(rules.bicycle)}
    <Button onclick={() => onField(riding ? { type: "field-dismount" } : { type: "field-mount", mode: "bike" })}>{t(riding ? "field.menu.bikeOff" : "field.menu.bike")}</Button>
  {/if}
  {#if has(rules.escapeRope)}
    <Button onclick={() => onField({ type: "use-item", item: rules.escapeRope, partyIndex: 0 })}>{t("field.menu.escapeRope")}</Button>
  {/if}
  {#if known.length === 0 && !has(rules.bicycle) && !has(rules.escapeRope)}
    <p class="m-0">{t("field.menu.none")}</p>
  {/if}
  <Button onclick={onBack}>{t("common.back")}</Button>
</section>
