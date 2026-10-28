import { describe, expect, it } from "vitest";
import { BUNDLED_TRAINER_CONTENT, buildTrainerData } from "../src/trainer-loader";
import { trainer } from "./trainer-fixture";

// Spec 022, T008: content/trainer is checked on load, including the AI profiles it names.

const extracted = {
  trainers: [trainer(1, ["sentret"]), trainer(2, ["sentret"])],
  classes: [{ id: 5, prizeBase: 4, music: "rival" as const }],
  // Trainer 1 has single lines; trainer 2 only those of the first trainer of a double (kinds 3 to 5).
  messages: [
    { trainer: 1, kind: 0, text: "0728:0" },
    { trainer: 1, kind: 1, text: "0728:1" },
    { trainer: 2, kind: 3, text: "0728:2" },
    { trainer: 2, kind: 4, text: "0728:3" },
    { trainer: 2, kind: 5, text: "0728:4" },
  ],
  learnsets: [],
};
const PROFILES = ["novice", "rookie", "skilled", "veteran"];

describe("trainer data", () => {
  it("loads the bundled content with the extraction", () => {
    const data = buildTrainerData(extracted, PROFILES);
    expect(data.trainer(1)?.team).toHaveLength(1);
    expect(data.trainerClass(5)).toEqual({ id: 5, prizeBase: 4, music: "rival" });
    expect(data.tuning.trainerFlagBase).toBe(1360);
  });

  it("gives each trainer its lines, falling back to a double's first-trainer lines", () => {
    const data = buildTrainerData(extracted, PROFILES);
    expect(data.lines(1)).toEqual({ intro: "0728:0", defeat: "0728:1", after: undefined });
    expect(data.lines(2)).toEqual({ intro: "0728:2", defeat: "0728:3", after: "0728:4" });
    expect(data.lines(9)).toEqual({ intro: undefined, defeat: undefined, after: undefined });
  });

  it("refuses a profile that content/ai does not have, naming the file and field", () => {
    const classProfiles = structuredClone(BUNDLED_TRAINER_CONTENT.classProfiles) as { value: { default: { combat: string } } };
    classProfiles.value.default.combat = "grandmaster";
    expect(() => buildTrainerData(extracted, PROFILES, { ...BUNDLED_TRAINER_CONTENT, classProfiles })).toThrow("content/trainer/class-profiles.json: value.default.combat: perfil grandmaster");
  });
});
