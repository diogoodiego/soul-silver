import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTimeFile } from "../../src/time/schemas.ts";

// Spec 026: the hand-written day-tint palette (research R2).

interface TintRaw {
  value: Record<string, unknown> & { morning: { r: number }; transitionMinutes: number };
}
const bundled = () => JSON.parse(readFileSync(new URL("../../../../content/time/tint.json", import.meta.url), "utf8")) as TintRaw;

describe("tint palette", () => {
  it("accepts the bundled file", () => {
    expect(parseTimeFile("tint", bundled(), "tint.json")).toMatchObject({ ok: true });
  });

  it.each([-0.1, 1.6])("rejects a colour channel of %d, with its path", (r) => {
    const raw = bundled();
    raw.value.morning.r = r;
    expect(parseTimeFile("tint", raw, "tint.json")).toMatchObject({ ok: false, error: { file: "tint.json", path: "value.morning.r" } });
  });

  it.each([-1, 2.5])("rejects a transition of %d minutes", (minutes) => {
    const raw = bundled();
    raw.value.transitionMinutes = minutes;
    expect(parseTimeFile("tint", raw, "tint.json")).toMatchObject({ ok: false, error: { path: "value.transitionMinutes" } });
  });

  it.each(["morning", "day", "night"])("rejects a palette without %s", (band) => {
    const raw = bundled();
    delete raw.value[band];
    expect(parseTimeFile("tint", raw, "tint.json")).toMatchObject({ ok: false, error: { path: `value.${band}` } });
  });
});
