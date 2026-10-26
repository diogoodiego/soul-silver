// Gain, pan and priority of a sound effect or cry, and the voice limit (spec 018, research R6).

export interface SoundRequest {
  source: "ui" | "own" | "other";
  kind: "effect" | "cry";
  /** World position in px; unused for "ui" and "own". */
  x?: number;
  y?: number;
}

export interface Listener {
  x: number;
  y: number;
  halfWidthPx: number;
}

/** Undefined when another's sound is out of range. */
export function mixSound(req: SoundRequest, at: Listener, rangePx: number): { gain: number; pan: number; priority: number } | undefined {
  if (req.source !== "other") return { gain: 1, pan: 0, priority: 3 };
  const x = req.x ?? at.x;
  const d = Math.hypot(x - at.x, (req.y ?? at.y) - at.y);
  if (d >= rangePx) return undefined;
  return { gain: 1 - d / rangePx, pan: Math.max(-1, Math.min(1, (x - at.x) / at.halfWidthPx)), priority: req.kind === "cry" ? 2 : 1 };
}

/** "free" below the limit; else the voice to replace (lowest priority, then quietest), or "drop". */
export function admitVoice(voices: readonly { priority: number; gain: number }[], next: { priority: number; gain: number }, max: number): number | "free" | "drop" {
  if (voices.length < max) return "free";
  let low = 0;
  voices.forEach((v, i) => {
    const l = voices[low]!;
    if (v.priority < l.priority || (v.priority === l.priority && v.gain < l.gain)) low = i;
  });
  return next.priority >= voices[low]!.priority ? low : "drop";
}
