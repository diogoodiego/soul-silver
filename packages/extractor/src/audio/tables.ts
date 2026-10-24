// Conversions of the Nitro sound engine (research.md R2). Volumes are in tenths of a decibel
// (centibels below 0), envelope levels in centibels × 128, as in the engine. Where the engine
// uses a table of rounded values, the formula it approximates is used instead.

/** Silence, in centibels. */
export const MIN_CB = -723;

/** Envelope level of silence (centibels × 128). */
export const ENV_MIN = MIN_CB * 128;

/** 0..127 on a squared curve, in centibels: 20·log10((x/127)²) dB. Velocity, volume and expression use it. */
export function decibelSquare(x: number): number {
  if (x <= 0) return MIN_CB;
  return Math.max(MIN_CB, Math.round(400 * Math.log10(Math.min(x, 127) / 127)));
}

const ATTACK_TABLE = [0, 1, 5, 14, 26, 38, 51, 63, 73, 84, 92, 100, 109, 116, 123, 127, 132, 137, 143];

/** Attack: each frame the level is multiplied by rate/256 on its way up to 0. */
export function attackRate(attack: number): number {
  return attack < 109 ? 255 - attack : ATTACK_TABLE[127 - attack]!;
}

/** Decay and release: the level falls by this much (centibels × 128) each frame. */
export function fallRate(value: number): number {
  if (value === 127) return 0xffff;
  if (value === 126) return 0x3c00;
  if (value < 50) return value * 2 + 1;
  return Math.floor(0x1e00 / (126 - value));
}

/** Sustain level (centibels × 128). */
export function sustainLevel(sustain: number): number {
  return sustain === 127 ? 0 : decibelSquare(sustain) * 128;
}

/** Linear gain of a level in centibels; 0 at or below silence. */
export function amplitude(cb: number): number {
  return cb <= MIN_CB ? 0 : 10 ** (cb / 200);
}

/** The LFO's sine over a 128-step period, in -127..127. */
export function lfoSine(index: number): number {
  return Math.round(127 * Math.sin((2 * Math.PI * (index & 127)) / 128));
}
