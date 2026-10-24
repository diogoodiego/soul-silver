import { describe, expect, it } from "vitest";
import { sequenceData, stepTrack, Track, type TrackHost } from "../../src/audio/sseq.ts";
import { buildSseq, ev } from "../fixtures/audio/builders.ts";

interface Recorded {
  notes: { tick: number; track: number; key: number; velocity: number; length: number }[];
  opened: [number, number][];
  loops: [number, number][];
  tempo: number[];
}

/** Runs a single track tick by tick and records what it asks of the player. */
function run(events: number[], ticks: number, setup: (t: Track, host: TrackHost) => void = () => {}): Recorded & { track: Track } {
  const data = sequenceData(buildSseq(events), "seq");
  const rec: Recorded = { notes: [], opened: [], loops: [], tempo: [] };
  let tick = 0;
  let seed = 1;
  const host: TrackHost = {
    noteOn: (t, key, velocity, length) => rec.notes.push({ tick, track: t.index, key, velocity, length }),
    openTrack: (i, o) => rec.opened.push([i, o]),
    loopedBack: (t, target) => rec.loops.push([tick, target]),
    setTempo: (bpm) => rec.tempo.push(bpm),
    setMainVolume: () => {},
    variables: new Int16Array(32).fill(-1),
    random: () => (seed = (seed * 75 + 74) % 65537) & 0xffff,
    get now() {
      return tick;
    },
  };
  const track = new Track(0, 0);
  setup(track, host);
  for (; tick < ticks; tick++) stepTrack(data, track, host);
  return { ...rec, track };
}

describe("sequence interpreter", () => {
  it("waits for the note length by default (note wait on) and for rests", () => {
    const r = run([...ev.note(60, 100, 4), ...ev.rest(2), ...ev.note(62, 90, 1), ...ev.end()], 10);
    expect(r.notes).toEqual([
      { tick: 0, track: 0, key: 60, velocity: 100, length: 4 },
      { tick: 6, track: 0, key: 62, velocity: 90, length: 1 },
    ]);
    expect(r.track.ended).toBe(true);
  });

  it("does not wait for notes with note wait off (polyphonic chords)", () => {
    const r = run([...ev.noteWait(false), ...ev.note(60, 100, 8), ...ev.note(64, 100, 8), ...ev.rest(8), ...ev.end()], 3);
    expect(r.notes.map((n) => [n.tick, n.key])).toEqual([[0, 60], [0, 64]]);
  });

  it("applies transpose, volume, pan, bend and the modulation settings to the track", () => {
    const r = run([0xc3, 2, 0xc1, 90, 0xc0, 80, 0xc4, 0xf0, 0xc5, 12, 0xca, 30, 0xcb, 20, 0xcc, 1, 0xcd, 2, 0xe0, 10, 0, 0xd5, 70, ...ev.note(60, 100, 1), ...ev.end()], 2);
    expect(r.notes[0]!.key).toBe(62);
    expect(r.track).toMatchObject({ volume: 90, pan: 16, bend: -16, bendRange: 12, expression: 70, mod: { depth: 30, speed: 20, type: 1, range: 2, delay: 10 } });
  });

  it("repeats a counted loop and then goes on", () => {
    const r = run([...ev.loopStart(3), ...ev.note(60, 100, 1), ...ev.loopEnd(), ...ev.note(70, 100, 1), ...ev.end()], 10);
    expect(r.notes.map((n) => n.key)).toEqual([60, 60, 60, 70]);
    expect(r.loops).toEqual([]);
  });

  it("calls and returns", () => {
    // 0: call 9; 4: note 61; 7: end; 8: (pad) ; 9: note 60; 12: return
    const events = [...ev.call(9), ...ev.note(61, 100, 1), ...ev.end(), 0, ...ev.note(60, 100, 1), ...ev.ret()];
    const r = run(events, 4);
    expect(r.notes.map((n) => n.key)).toEqual([60, 61]);
  });

  it("reports a jump back to code it already ran as the sequence's loop, with the target", () => {
    // 0: note 60; 3: note 62; 6: jump 3
    const r = run([...ev.note(60, 100, 2), ...ev.note(62, 100, 2), ...ev.jump(3)], 9);
    expect(r.notes.map((n) => [n.tick, n.key])).toEqual([[0, 60], [2, 62], [4, 62], [6, 62], [8, 62]]);
    expect(r.loops[0]).toEqual([4, 3]);
    expect(r.track.seen.get(3)).toBe(2);
  });

  it("treats an endless loop (count 0) as the sequence's loop", () => {
    const r = run([...ev.note(50, 100, 1), ...ev.loopStart(0), ...ev.note(60, 100, 1), ...ev.loopEnd()], 4);
    expect(r.notes.map((n) => n.key)).toEqual([50, 60, 60, 60]);
    expect(r.loops[0]).toEqual([2, 5]);
  });

  it("opens tracks and sets the tempo", () => {
    const r = run([...ev.allocTracks(3), ...ev.openTrack(1, 20), ...ev.tempo(150), ...ev.end()], 1);
    expect(r.opened).toEqual([[1, 20]]);
    expect(r.tempo).toEqual([150]);
  });

  it("runs variables, comparisons and the conditional prefix", () => {
    // var 3 = 5; if var 3 == 5 then note 60; if var 3 != 5 then note 70; note 80
    const events = [0xb0, 3, 5, 0, 0xb8, 3, 5, 0, 0xa2, ...ev.note(60, 100, 1), 0xbd, 3, 5, 0, 0xa2, ...ev.note(70, 100, 1), ...ev.note(80, 100, 1), ...ev.end()];
    const r = run(events, 5);
    expect(r.notes.map((n) => n.key)).toEqual([60, 80]);
  });

  it("takes the last argument from a variable or from a random range", () => {
    const fromVar = run([0xb0, 4, 9, 0, 0xa1, 0x80, 4, ...ev.note(60, 100, 1), ...ev.end()], 12);
    expect(fromVar.notes[0]!.tick).toBe(9);
    const random = run([0xa0, 0xc1, 10, 0, 20, 0, ...ev.end()], 1);
    expect(random.track.volume).toBeGreaterThanOrEqual(10);
    expect(random.track.volume).toBeLessThanOrEqual(20);
  });

  it("fails naming the command it does not know", () => {
    expect(() => run([0xe5], 1)).toThrow(/comando 0xe5 desconhecido/);
  });
});
