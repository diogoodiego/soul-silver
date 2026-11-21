<script lang="ts">
  // A validation or blocking message. `alert` interrupts a screen reader; `status` waits its turn.
  import type { Snippet } from "svelte";

  let { role = "alert", class: extra, children }: { role?: "alert" | "status"; class?: string; children: Snippet } = $props();
</script>

<p class={["m-0 text-[0.85em] text-error", extra]} {role}>{@render children()}</p>
