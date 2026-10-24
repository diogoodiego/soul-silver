<script lang="ts">
  // Shown once, before the first time the player hosts, so the Windows firewall prompt is no surprise (spec 012, FR-014).
  let { onContinue, onBack }: { onContinue: () => void; onBack: () => void } = $props();
</script>

<section>
  <h2>Antes de hospedar</h2>
  <p>
    Para que seus amigos entrem na partida, o jogo precisa receber conexões da rede. Ao continuar, o Windows vai mostrar um aviso do
    Firewall perguntando se o SoulSilver Desktop pode se comunicar.
  </p>
  <p>Marque <strong>Redes privadas</strong> e clique em <strong>Permitir acesso</strong>. Se você recusar, a partida abre, mas os outros PCs talvez não consigam entrar; nesse caso, libere o jogo depois nas configurações do Firewall do Windows.</p>
  <div class="actions">
    <button type="button" onclick={onContinue}>Entendi, continuar</button>
    <button type="button" onclick={onBack}>Voltar</button>
  </div>
</section>

<style>
  section {
    max-width: 36rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
