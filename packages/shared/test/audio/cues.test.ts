import { describe, expect, it } from "vitest";
import { EFFECT_CUES, moveSound, parseAudioCues, trackByName } from "../../src/audio/cues.ts";
import type { AudioIndexFile } from "../../src/audio/schemas.ts";

// Spec 018, contracts/audio-cues.md.

function cues(patch: Record<string, unknown> = {}) {
  return {
    kind: "audio-cues",
    formatVersion: 1,
    music: {
      title: "SEQ_TITLE",
      wildBattle: "SEQ_WILD",
      victory: "SEQ_WIN",
      trainerBattle: "SEQ_TRAINER",
      rivalBattle: "SEQ_RIVAL",
      leaderBattle: "SEQ_LEADER",
      rocketBattle: "SEQ_ROCKET",
      championBattle: "SEQ_CHAMP",
      trainerVictory: "SEQ_WIN1",
      leaderVictory: "SEQ_WIN3",
      bicycle: "SEQ_BICYCLE",
    },
    effects: Object.fromEntries(EFFECT_CUES.map((c) => [c, `SE_${c}`])),
    archetypes: { projectile: "SE_PROJECTILE" },
    defaultMove: "SE_DEFAULT",
    mix: { crossfadeMs: 800, rangeTiles: 12, maxVoices: 16, faintCryRate: 0.85 },
    ...patch,
  };
}

describe("cues file", () => {
  it("accepts the contract example", () => {
    expect(parseAudioCues(cues(), "cues.json").ok).toBe(true);
  });

  it("lists the 15 effect cues", () => {
    expect(EFFECT_CUES).toHaveLength(15);
  });

  it.each([
    ["kind", { kind: "audio-other" }],
    ["defaultMove", { defaultMove: undefined }],
    ["mix.crossfadeMs", { mix: { crossfadeMs: 5001, rangeTiles: 12, maxVoices: 16, faintCryRate: 0.85 } }],
    ["mix.rangeTiles", { mix: { crossfadeMs: 800, rangeTiles: 0, maxVoices: 16, faintCryRate: 0.85 } }],
    ["mix.maxVoices", { mix: { crossfadeMs: 800, rangeTiles: 12, maxVoices: 65, faintCryRate: 0.85 } }],
    ["mix.faintCryRate", { mix: { crossfadeMs: 800, rangeTiles: 12, maxVoices: 16, faintCryRate: 0.4 } }],
    ["mix.crossfadeMs", { mix: { crossfadeMs: 1.5, rangeTiles: 12, maxVoices: 16, faintCryRate: 0.85 } }],
  ])("rejects a bad %s, saying file and path", (path, patch) => {
    const result = parseAudioCues(cues(patch), "cues.json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.file).toBe("cues.json");
      expect(result.error.path).toBe(path);
      expect(result.error.problem).not.toBe("");
    }
  });

  it("rejects effects missing a cue", () => {
    const { hit: _, ...effects } = cues().effects;
    const result = parseAudioCues(cues({ effects }), "cues.json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.path).toBe("effects.hit");
  });
});

describe("moveSound", () => {
  const data = (() => {
    const r = parseAudioCues(cues(), "cues.json");
    if (!r.ok) throw new Error("fixture");
    return r.data;
  })();

  const has = (names: string[]) => (n: string) => names.includes(n);

  it("finds the move's own sound, HGSS first, then DP, then Platinum", () => {
    expect(moveSound(data, has(["SEQ_SE_DP_W052", "SEQ_SE_GS_W052"]), 52, "projectile")).toBe("SEQ_SE_GS_W052");
    expect(moveSound(data, has(["SEQ_SE_PL_W012", "SEQ_SE_DP_W012"]), 12, "melee")).toBe("SEQ_SE_DP_W012");
    expect(moveSound(data, has(["SEQ_SE_PL_W019"]), 19, "melee")).toBe("SEQ_SE_PL_W019");
  });

  it("falls back to the archetype", () => {
    expect(moveSound(data, has([]), 52, "projectile")).toBe("SE_PROJECTILE");
  });

  it("falls back to the default", () => {
    expect(moveSound(data, has([]), 52, "melee")).toBe("SE_DEFAULT");
  });
});

describe("trackByName", () => {
  it("maps each track's name to it", () => {
    const index = {
      tracks: [
        { id: 1, name: "SEQ_TITLE", kind: "music" },
        { id: 2, name: "SE_hit", kind: "effect" },
      ],
    } as unknown as AudioIndexFile;
    const map = trackByName(index);
    expect(map.get("SEQ_TITLE")?.id).toBe(1);
    expect(map.get("SE_hit")?.kind).toBe("effect");
    expect(map.get("nope")).toBeUndefined();
  });
});

describe("content/audio/cues.json", () => {
  it("is valid", async () => {
    const { readFile } = await import("node:fs/promises");
    const file = new URL("../../../../content/audio/cues.json", import.meta.url);
    const result = parseAudioCues(JSON.parse(await readFile(file, "utf8")), "cues.json");
    expect(result.ok ? true : result.error).toBe(true);
  });
});
