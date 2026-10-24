<script lang="ts">
  // Join: sessions found on the LAN, or an address typed in (spec 012, US5).
  import type { SessionListing } from "@soulsilver/shared/lan";
  import { onMount } from "svelte";

  let { onJoin, onBack, error }: { onJoin: (address: string) => void; onBack: () => void; error: string | undefined } = $props();

  let sessions = $state<SessionListing[]>([]);
  let address = $state("");

  onMount(() => window.soulSilver.watchSessions((list) => (sessions = list)));
</script>

<section>
  <h2>Entrar</h2>

  <h3>Partidas na sua rede</h3>
  {#if sessions.length === 0}
    <p role="status">Procurando partidas…</p>
  {/if}
  <ul>
    {#each sessions as s (s.address + s.sessionId)}
      <li>
        <span>{s.hostName} · {s.players}/{s.maxPlayers} jogadores · versão {s.appVersion} · {s.address}</span>
        {#if s.joinable}
          <button type="button" onclick={() => onJoin(s.address)}>Entrar</button>
        {:else}
          <button type="button" disabled>Entrar</button>
          <em>{s.reason}</em>
        {/if}
      </li>
    {/each}
  </ul>

  <h3>Por endereço</h3>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      onJoin(address);
    }}
  >
    <label>
      IP do anfitrião
      <input bind:value={address} placeholder="192.168.0.10" autocomplete="off" />
    </label>
    <button type="submit" disabled={address.trim().length === 0}>Conectar</button>
  </form>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button type="button" onclick={onBack}>Voltar</button>
</section>

<style>
  ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.4rem;
    max-width: 40rem;
  }
  li {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }
  form {
    display: flex;
    gap: 0.5rem;
    align-items: end;
    margin-bottom: 1rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
  }
  .error {
    color: #b00020;
  }
</style>
