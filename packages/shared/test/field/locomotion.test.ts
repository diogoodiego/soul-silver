import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { launchAllowed, parseFieldFile } from "../../src/field/index.ts";

// Spec 025: every species has one locomotion class; surfing limits who can be launched.

const raw = JSON.parse(readFileSync(new URL("../../../../content/species/locomotion.json", import.meta.url), "utf8")) as { value: { species: Record<string, string> } };

describe("locomotion.json", () => {
  it("passes the schema", () => {
    expect(parseFieldFile("locomotion", raw, "locomotion.json")).toMatchObject({ ok: true });
  });

  it("covers exactly species 1 to 493", () => {
    const keys = Object.keys(raw.value.species).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual(Array.from({ length: 493 }, (_, i) => i + 1));
  });

  it("rejects an unknown class", () => {
    const bad = structuredClone(raw);
    bad.value.species["25"] = "swimming";
    expect(parseFieldFile("locomotion", bad, "locomotion.json")).toMatchObject({ ok: false, error: { path: "value.species.25" } });
  });

  it("rejects a missing species", () => {
    const bad = structuredClone(raw);
    delete bad.value.species["493"];
    expect(parseFieldFile("locomotion", bad, "locomotion.json")).toMatchObject({ ok: false });
  });

  it("keeps known exceptions", () => {
    const s = raw.value.species;
    expect(s["130"]).toBe("aquatic"); // Gyarados
    expect(s["249"]).toBe("flying"); // Lugia
    expect(s["94"]).toBe("levitating"); // Gengar
    expect(s["25"]).toBe("terrestrial"); // Pikachu
  });
});

describe("launchAllowed", () => {
  it.each([
    ["terrestrial", false],
    ["aquatic", true],
    ["flying", true],
    ["levitating", true],
  ] as const)("while surfing, %s is %s", (cls, ok) => {
    expect(launchAllowed(cls, "surf")).toBe(ok);
  });

  it.each(["walk", "run", "bike", "fish"] as const)("allows everyone while in mode %s", (mode) => {
    for (const cls of ["terrestrial", "aquatic", "flying", "levitating"] as const) expect(launchAllowed(cls, mode)).toBe(true);
  });
});
