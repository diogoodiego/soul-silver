import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePhoneFile } from "../../src/phone/schemas.ts";
import { parseRadioFile } from "../../src/radio/schemas.ts";

// Spec 026, research R7: the extracted phone book (tel/pmtel_book.dat, the call scripts of overlay 101
// and the rematch sets of overlay 26) and the hand-written radio channels.

const contact = { id: 10, type: 0, trainerClass: 0, trainer: 1, map: 7, gift: 0, localScript: 29, rematchWeekday: 1, rematchTime: 1, tier: 1, greeting: 255, bank: 675, outgoing: [], incoming: [{ type: 2, chance: 60, scriptType: 0, script: 33 }] };
const phone = () => ({
  kind: "phone",
  formatVersion: 1,
  value: {
    contacts: [structuredClone(contact)],
    scripts: [{ id: 33, lines: [10, 10], type: 3, param0: 1, param1: 0 }],
    greetings: [], rematchSets: [{ base: 8, sequence: [8, 279, 280, 510, 0] }],
  },
});
const radio = () => JSON.parse(readFileSync(new URL("../../../../content/radio/channels.json", import.meta.url), "utf8")) as {
  value: { shows: { id: string; bank?: number }[]; music: Record<string, number>; baseRate: number };
};

describe("phone file", () => {
  it("accepts a well-formed file", () => {
    expect(parsePhoneFile("phone", phone(), "phone.json")).toMatchObject({ ok: true });
  });

  it.each([
    ["a call header of an unknown type", (v: ReturnType<typeof phone>["value"]) => (v.contacts[0]!.incoming[0]!.type = 9), "value.contacts.0.incoming.0.type"],
    ["a greeting row without its 12 ids", (v: ReturnType<typeof phone>["value"]) => v.greetings.push([1, 2, 3] as never), "value.greetings.0"],
    ["a contact id above 74", (v: ReturnType<typeof phone>["value"]) => (v.contacts[0]!.id = 75), "value.contacts.0.id"],
    ["a rematch weekday above 7 (7 is none)", (v: ReturnType<typeof phone>["value"]) => (v.contacts[0]!.rematchWeekday = 8), "value.contacts.0.rematchWeekday"],
    ["a rematch time above 3 (3 is none)", (v: ReturnType<typeof phone>["value"]) => (v.contacts[0]!.rematchTime = 4), "value.contacts.0.rematchTime"],
    ["a script line above a byte (an index in the caller's bank)", (v: ReturnType<typeof phone>["value"]) => (v.scripts[0]!.lines[0] = 256), "value.scripts.0.lines.0"],
    ["a script type above 4 bits", (v: ReturnType<typeof phone>["value"]) => (v.scripts[0]!.type = 16), "value.scripts.0.type"],
    ["a script param0 above 12 bits", (v: ReturnType<typeof phone>["value"]) => (v.scripts[0]!.param0 = 0x1000), "value.scripts.0.param0"],
    ["a rematch set without its 5 columns", (v: ReturnType<typeof phone>["value"]) => v.rematchSets[0]!.sequence.pop(), "value.rematchSets.0.sequence"],
  ])("rejects %s, with its path", (_, change, path) => {
    const raw = phone();
    change(raw.value);
    expect(parsePhoneFile("phone", raw, "phone.json")).toMatchObject({ ok: false, error: { file: "phone.json", path } });
  });

  it("rejects a contact listed twice", () => {
    const raw = phone();
    raw.value.contacts.push(structuredClone(contact));
    expect(parsePhoneFile("phone", raw, "phone.json")).toMatchObject({ ok: false, error: { path: "value.contacts" } });
  });
});

describe("scripted calls", () => {
  const file = () => JSON.parse(readFileSync(new URL("../../../../content/phone/scripted-calls.json", import.meta.url), "utf8")) as { value: { calls: { caller: number; scripts: number[] }[] } };

  it("accepts the bundled file, with Elm's call after Mr. Pokémon as his first", () => {
    expect(parsePhoneFile("phone-scripted-calls", file(), "scripted-calls.json")).toMatchObject({ ok: true });
    expect(file().value.calls.find((c) => c.caller === 1)?.scripts[0]).toBe(2);
  });

  it("has Baoba's call once Amphy is healed (item 032.1): Olivine's frame (911:3) rings contact 24, index 0, the Safari Zone opening (141)", () => {
    expect(file().value.calls.find((c) => c.caller === 24)?.scripts[0]).toBe(141);
  });

  it("rejects a caller listed twice", () => {
    const raw = file();
    raw.value.calls.push({ caller: 1, scripts: [2] });
    expect(parsePhoneFile("phone-scripted-calls", raw, "scripted-calls.json")).toMatchObject({ ok: false, error: { path: "value.calls" } });
  });
});

describe("special callers", () => {
  it("accepts the bundled file: Elm and Mom", () => {
    const raw = JSON.parse(readFileSync(new URL("../../../../content/phone/callers.json", import.meta.url), "utf8")) as unknown;
    const parsed = parsePhoneFile("phone-callers", raw, "callers.json");
    expect(parsed).toMatchObject({ ok: true });
    expect(parsed.ok && parsed.data.value.callers.map((c) => c.caller)).toEqual([1, 0]);
  });
});

describe("radio channels", () => {
  it("accepts the bundled file", () => {
    expect(parseRadioFile("channels", radio(), "channels.json")).toMatchObject({ ok: true });
  });

  it("has March and Lullaby as encounter_check.c changes the rate", () => {
    expect(radio().value.music).toEqual({ march: 25, lullaby: -25 });
    expect(radio().value.baseRate).toBe(40);
  });

  it("rejects a show without its text bank", () => {
    const raw = radio();
    delete raw.value.shows[0]!.bank;
    expect(parseRadioFile("channels", raw, "channels.json")).toMatchObject({ ok: false, error: { path: "value.shows.0.bank" } });
  });

  it("rejects music that would take the rate to zero or below", () => {
    const raw = radio();
    raw.value.music["lullaby"] = -40;
    expect(parseRadioFile("channels", raw, "channels.json")).toMatchObject({ ok: false, error: { path: "value.music" } });
  });

  it("rejects an unknown music key", () => {
    const raw = radio();
    raw.value.music["hoenn"] = 10;
    expect(parseRadioFile("channels", raw, "channels.json")).toMatchObject({ ok: false });
  });
});
