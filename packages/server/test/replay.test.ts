import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { createRng, recording as recordingSchema, type CollisionMap } from "@soulsilver/shared/game";
import type { CollisionCell } from "@soulsilver/shared/maps";
import { describe, expect, it } from "vitest";
import { createRecorder, replay } from "../src/recorder";
import { hashWorld } from "../src/world";
import { setup } from "./harness";

const free: CollisionCell = { category: "free", raw: 0 };
const wall: CollisionCell = { category: "blocked", raw: 0x8000 };
const map: CollisionMap = { width: 8, height: 8, tiles: Array.from({ length: 64 }, (_, i) => (i % 9 === 4 ? wall : free)) };
const world = { spawn: (id: number) => ({ area: "a", x: 24 + id * 16, y: 24 }), collision: () => map };

function record() {
  const recorder = createRecorder(77);
  const { session, connect } = setup({ ...world, seed: 77, onRecord: recorder.onRecord });
  const rng = createRng(5);
  const dirs = ["north", "south", "east", "west", null] as const;
  const clients = [connect("A"), connect("B"), connect("C"), connect("D")];
  const seqs = [0, 0, 0, 0];
  const nextSeq = (i: number) => {
    const seq = seqs[i]!;
    seqs[i] = seq + 1;
    return seq;
  };
  for (let t = 0; t < 600; t++) {
    clients.forEach((c, i) => {
      if (c.closed) return;
      const n = rng.nextInt(3); // 0, 1 or 2 inputs this tick
      for (let k = 0; k < n; k++) c.input(nextSeq(i), dirs[rng.nextInt(5)]!);
      if (rng.nextInt(10) === 0) c.input(Math.max(0, seqs[i]! - 3), "east"); // stale duplicate
    });
    if (t === 200) clients[2]!.conn.send({ type: "leave" });
    if (t === 300) clients[2] = connect("E");
    session.step();
  }
  return { session, recording: recorder.recording(session.tick) };
}

describe("record and replay", () => {
  it("replays a 4-player session to the same final state", () => {
    const original = record();
    expect(recordingSchema.safeParse(original.recording).success).toBe(true);
    const replayed = replay(original.recording, world);
    expect(replayed.tick).toBe(original.session.tick);
    expect(hashWorld(replayed.world)).toBe(hashWorld(original.session.world));
  });

  it("refuses a recording from another protocol version", () => {
    const { recording } = record();
    expect(() => replay({ ...recording, protocolVersion: PROTOCOL_VERSION + 1 }, world)).toThrow(/protocolo/);
  });
});
