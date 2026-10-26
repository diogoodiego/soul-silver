# Contrato: cues de áudio e API do cliente

**Feature**: [spec.md](../spec.md) | **Modelo**: [data-model.md](../data-model.md)

## `content/audio/cues.json`

Mesmo envelope dos outros arquivos de `content/` (`kind`, `formatVersion`), validado ao carregar
com erro que diz arquivo, caminho e problema.

```json
{
  "kind": "audio-cues",
  "formatVersion": 1,
  "music": { "title": "SEQ_GS_TITLE", "wildBattle": "SEQ_GS_VS_NORAPOKE", "victory": "SEQ_GS_WIN2" },
  "effects": { "hit": "SEQ_SE_DP_...", "menu-cursor": "SEQ_SE_DP_SELECT", "...": "..." },
  "archetypes": { "melee-contact": "...", "projectile": "..." },
  "defaultMove": "...",
  "mix": { "crossfadeMs": 800, "rangeTiles": 12, "maxVoices": 16, "faintCryRate": 0.85 }
}
```

Os nomes de `content/audio/cues.json` foram conferidos contra o `audio-index` extraído.

## `shared` (`@soulsilver/shared/audio`)

```ts
export const EFFECT_CUES: readonly EffectCue[];
export function parseAudioCues(value: unknown, file: string): GameDataParseResult<AudioCues>;

/** Nome da faixa → id; mapeia uma vez por índice. */
export function trackByName(index: AudioIndexFile): Map<string, Track>;
/** Som de um golpe: SEQ_SE_<GS|DP|PL>_W<id> que existir → archetypes[archetype] → defaultMove. */
export function moveSound(cues: AudioCues, has: (name: string) => boolean, move: number, archetype: string): string;

export interface MusicState { screen: "title" | "game"; musicDay: number; musicNight: number; night: boolean; inCombat: boolean; victory: boolean }
/** Faixa que deve tocar agora; null = silêncio. */
export function desiredMusic(state: MusicState, music: { title: number; wildBattle: number; victory: number }): number | null;

export interface SoundRequest { source: "ui" | "own" | "other"; kind: "effect" | "cry"; x?: number; y?: number }
export interface Listener { x: number; y: number; halfWidthPx: number }
export function mixSound(req: SoundRequest, at: Listener, rangePx: number): { gain: number; pan: number; priority: number } | undefined;
/** Índice da voz a substituir, "free" ou "drop". */
export function admitVoice(voices: readonly { priority: number; gain: number }[], next: { priority: number; gain: number }, max: number): number | "free" | "drop";
```

## `client` (`packages/client/src/audio`)

```ts
export const audio: {
  setMusic(trackId: number | null): void;                 // crossfade; mesma faixa = no-op
  play(cue: string | number, req: SoundRequest & { rate?: number }): void;  // nome de cue, nome de faixa ou cry
  preloadArea(trackIds: number[]): Promise<void>;
  setVolumes(v: AppSettings["audio"]): void;              // imediato
  setListener(l: Listener): void;
};
```

Erros de áudio (faixa ausente, WAV inválido, sem dispositivo) são logados e nunca sobem para o jogo.
