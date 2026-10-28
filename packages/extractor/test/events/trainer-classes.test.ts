import { describe, expect, it } from "vitest";
import { readTrainerClasses, readTrainerMessages, SEQ } from "../../src/events/trainer-classes.ts";

// Spec 022, T006: the prize table (overlay 12), the class music tables (ARM9) and the trainer message
// table, read from synthetic bytes (principle II).

const u16s = (values: number[]) => {
  const b = new Uint8Array(values.length * 2);
  values.forEach((v, i) => new DataView(b.buffer).setUint16(i * 2, v, true));
  return b;
};

/** `prize` holds (class, base) pairs; `music` maps class -> index; `seqs` is the (transition, sequence) list. */
function tables(o: { classes: number; prize: [number, number][]; music: [number, number][]; seqs: number[] }) {
  return {
    prize: u16s(o.prize.flat()),
    musicClasses: u16s(o.music.map(([cls, idx]) => cls | (idx << 10))),
    musicList: u16s(o.seqs.flatMap((s) => [0, s])),
    classes: o.classes,
  };
}

describe("readTrainerClasses", () => {
  it("joins the prize and the music of every class, in class order", () => {
    const t = tables({ classes: 4, prize: [[2, 4], [0, 0], [3, 30], [1, 16]], music: [[3, 0], [1, 1]], seqs: [SEQ.leader, SEQ.rival] });
    expect(readTrainerClasses(t)).toEqual([
      { id: 0, prizeBase: 0, music: "trainer" },
      { id: 1, prizeBase: 16, music: "rival" },
      { id: 2, prizeBase: 4, music: "trainer" },
      { id: 3, prizeBase: 30, music: "leader" },
    ]);
  });

  it("knows the Rocket, Champion and Kanto leader sequences", () => {
    const t = tables({ classes: 3, prize: [[0, 1], [1, 1], [2, 1]], music: [[0, 0], [1, 1], [2, 2]], seqs: [SEQ.rocket, SEQ.champion, SEQ.leaderKanto] });
    expect(readTrainerClasses(t).map((c) => c.music)).toEqual(["rocket", "champion", "leader"]);
  });

  it("refuses a prize table that misses a class or repeats one", () => {
    expect(() => readTrainerClasses(tables({ classes: 3, prize: [[0, 1], [1, 1], [1, 1]], music: [], seqs: [] }))).toThrow(/classe 2/);
  });
});

describe("readTrainerMessages", () => {
  it("numbers the messages in table order as texts of bank 728", () => {
    expect(readTrainerMessages(u16s([5, 0, 5, 1, 5, 2, 9, 0]))).toEqual([
      { trainer: 5, kind: 0, text: "0728:0" },
      { trainer: 5, kind: 1, text: "0728:1" },
      { trainer: 5, kind: 2, text: "0728:2" },
      { trainer: 9, kind: 0, text: "0728:3" },
    ]);
  });

  it("refuses a table that is not whole pairs", () => {
    expect(() => readTrainerMessages(new Uint8Array(6))).toThrow();
  });
});
