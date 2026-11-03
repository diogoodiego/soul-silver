<script lang="ts">
  // The naming screen a script opens (spec 024: NicknameInput, NameRival). An empty name keeps the
  // default one (the species' name, the rival's from the game's text), as the original does when nothing is typed.
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  let { title, max, keep, onDone }: { title: string; max: number; keep: string; onDone: (text: string) => void } = $props();

  let text = $state("");
  const focusNow = (node: HTMLElement) => node.focus();
</script>

<section class="absolute inset-0 z-4 grid place-content-center p-6 bg-black/70" use:menu={{ onBack: () => onDone("") }}>
  <form
    class="grid gap-3 min-w-[18rem] px-4 py-3 bg-white/96 text-ink palette-ink border-3 border-frame rounded-[6px] text-[1.1rem]"
    onsubmit={(e) => {
      e.preventDefault();
      onDone(text.trim());
    }}
  >
    <label class="grid gap-2">
      <span>{title}</span>
      <input bind:value={text} maxlength={max} autocomplete="off" use:focusNow />
    </label>
    <div class="flex gap-2">
      <button type="submit">{t("name.ok")}</button>
      <button type="button" onclick={() => onDone("")}>{keep}</button>
    </div>
  </form>
</section>
