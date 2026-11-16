import { describe, expect, it } from "vitest";
import { readNpcTrade } from "../../src/events/npc-trades.ts";

// Item 030.10: one NARC a/1/1/2 member per in-game trade, 21 u32 fields (NPCTrade, npc_trade.h), from
// synthetic bytes (principle II). The names are text ids: the nickname at the trade number, the trainer 13 after.

/** give, hp/atk/def/spe/spa/spd IVs, ability, otId, 5 contest stats, pid, item, gender, sheen, language, ask, unused. */
function member(fields: Partial<Record<"give" | "otId" | "pid" | "item" | "gender" | "ask", number>> & { ivs?: number[] } = {}) {
  const words = [fields.give ?? 16, ...(fields.ivs ?? [1, 2, 3, 4, 5, 6]), 0, fields.otId ?? 0x12345678, 0, 0, 0, 0, 0, fields.pid ?? 0x9abcdef0, fields.item ?? 0, fields.gender ?? 0, 0, 2, fields.ask ?? 0, 0];
  const b = new Uint8Array(0x54);
  const view = new DataView(b.buffer);
  words.forEach((w, i) => view.setUint32(i * 4, w >>> 0, true));
  return b;
}

describe("readNpcTrade", () => {
  it("reads the species, IVs, personality, trainer id, item and the name text ids", () => {
    expect(readNpcTrade(member({ give: 66, ask: 96, item: 0, gender: 0 }), 1, 200)).toEqual({
      id: 1,
      give: 66,
      ask: 96,
      ivs: { hp: 1, attack: 2, defense: 3, speed: 4, specialAttack: 5, specialDefense: 6 },
      pid: 0x9abcdef0,
      otId: 0x12345678,
      heldItem: 0,
      otGender: 0,
      nickname: "0200:1",
      ot: "0200:14",
    });
  });

  it("reads a loan with a held item and a female trainer", () => {
    expect(readNpcTrade(member({ give: 21, item: 137, gender: 1 }), 7, 200)).toMatchObject({ id: 7, give: 21, ask: 0, heldItem: 137, otGender: 1, nickname: "0200:7", ot: "0200:20" });
  });

  it("refuses a member of the wrong size or an IV over 31", () => {
    expect(() => readNpcTrade(new Uint8Array(0x50), 3, 200)).toThrow(/npc trade 3/);
    expect(() => readNpcTrade(member({ ivs: [32, 0, 0, 0, 0, 0] }), 3, 200)).toThrow(/npc trade 3/);
  });
});
