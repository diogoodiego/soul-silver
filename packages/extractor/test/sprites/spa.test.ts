import { describe, expect, it } from "vitest";
import { scriptEmitters } from "../../src/sprites/battle-fx.ts";
import { readSpaEmitters, readSpaTextures, SpaFormatError } from "../../src/sprites/spa.ts";
import { buildMoveScript, buildSpa } from "../fixtures/sprites/spa.ts";

describe("SPA files", () => {
  it("walk emitters across their optional blocks to the exact resource end", () => {
    const spa = buildSpa(
      [{ flags: (1 << 8) | (1 << 9) | (1 << 16) | (1 << 24) | (1 << 29), texture: 1, color: 0x001f }, { texture: 0 }],
      [{ colors: [0, 0x7fff] }, { colors: [0, 0x7fff] }],
    );
    const [a, b] = readSpaEmitters(spa, "t");
    expect(a).toMatchObject({ texture: 1, color: "ffffff", colorEnd: "ff0000", particleLife: 20, emitterLife: 10, count: 1, alpha: 1 });
    expect(b).toMatchObject({ texture: 0, color: "ffffff" });
    expect(b!.colorEnd).toBeUndefined();
  });

  it("refuses a file whose emitters do not end at the resource size", () => {
    const spa = buildSpa([{ flags: 1 << 8 }], [{ colors: [0, 0x7fff] }]);
    new DataView(spa.buffer).setUint32(0, 0, true); // drop the flag: the walk ends 12 bytes early
    expect(() => readSpaEmitters(spa, "t")).toThrow(SpaFormatError);
  });

  it("decodes textures and mirrors flipped halves into the whole shape", () => {
    const [plain, half] = readSpaTextures(buildSpa([], [{ colors: [0, 0x7fff] }, { colors: [0, 0x7fff], flip: [true, false] }]), "t");
    expect([plain!.width, plain!.height]).toEqual([8, 8]);
    expect([half!.width, half!.height]).toEqual([16, 8]);
  });
});

describe("move scripts", () => {
  it("pair each created emitter with the SPA loaded in its slot", () => {
    expect(scriptEmitters(buildMoveScript(84))).toEqual([{ spa: 84, emitter: 0, at: "attacker" }]);
    expect(scriptEmitters(new Uint8Array(new Uint32Array([45, 0, 0, 4]).buffer))).toEqual([]);
    // Flamethrower's shape: a stream from the user, then a burst on the target.
    const flamethrower = new Uint8Array(new Uint32Array([51, 0, 84, 1, 46, 0, 1, 17, 46, 0, 0, 4, 4]).buffer);
    expect(scriptEmitters(flamethrower)).toEqual([
      { spa: 84, emitter: 1, at: "travel" },
      { spa: 84, emitter: 0, at: "target" },
    ]);
  });
});
