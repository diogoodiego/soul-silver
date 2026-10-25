<script lang="ts">
  // Minimal debug HUD of the dev arena (spec 013, US6): HP, cooldowns, status and stages of each combatant.
  import type { Entity } from "@soulsilver/shared/game";

  let { combatants }: { combatants: Entity[] } = $props();

  const TICK_S = 0.05;
  const stages = (e: Entity) =>
    Object.entries(e.data)
      .filter(([k]) => k.startsWith("stg_"))
      .map(([k, v]) => `${k.slice(4)} ${Number(v) > 0 ? "+" : ""}${String(v)}`)
      .join(", ");
  const cooldown = (e: Entity, slot: number) => Number(e.data[`cd${slot}`] ?? 0);
</script>

<div class="hud" aria-label="Arena: depuração">
  {#each combatants as e (e.id)}
    <dl>
      <dt>{e.data["owner"] === "wild" ? "B (selvagem)" : "A (você)"} · espécie {e.data["species"]} · nv {e.data["level"]}</dt>
      <dd>HP {e.data["hp"]} / {e.data["hpMax"]}</dd>
      <dd>
        {#each [1, 2, 3, 4] as slot (slot)}
          {#if e.data[`move${slot}`] !== undefined}
            <span class:ready={cooldown(e, slot) === 0}>{slot}: golpe {e.data[`move${slot}`]} · {cooldown(e, slot) === 0 ? "pronto" : `${(cooldown(e, slot) * TICK_S).toFixed(1)} s`}</span>
          {/if}
        {/each}
      </dd>
      <dd>Status: {e.data["status"] || "—"}{e.data["confused"] ? " + confusão" : ""}</dd>
      {#if stages(e)}<dd>Estágios: {stages(e)}</dd>{/if}
    </dl>
  {/each}
</div>

<style>
  .hud {
    position: absolute;
    left: 0.5rem;
    bottom: 0.5rem;
    display: flex;
    gap: 1rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font:
      12px system-ui,
      sans-serif;
  }
  dl,
  dd {
    margin: 0;
  }
  span {
    margin-right: 0.5rem;
    color: #aaa;
  }
  .ready {
    color: #7f7;
  }
</style>
