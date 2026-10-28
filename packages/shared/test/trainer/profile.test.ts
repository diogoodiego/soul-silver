import { describe, expect, it } from "vitest";
import { trainerProfile } from "../../src/trainer/profile.ts";
import type { AiFlagsTable, ClassProfiles } from "../../src/trainer/schemas.ts";

const classes: ClassProfiles = {
  default: { combat: "rookie", switch: { enabled: false, typeThreshold: 2, hpThreshold: 0.25, cooldownS: 8 }, item: { enabled: true, hpThreshold: 0.3 } },
  classes: { "20": { combat: "skilled", switch: { enabled: true } } },
};
const flags: AiFlagsTable = {
  bits: {
    "0": { name: "basic" },
    "1": { name: "evaluate", combat: "skilled" },
    "2": { name: "expert", combat: "veteran", switch: { enabled: true, typeThreshold: 4 } },
  },
};

describe("trainer profile", () => {
  it("uses the default for a class without an entry and no flags", () => {
    expect(trainerProfile({ classId: 3, aiFlags: 0 }, flags, classes)).toEqual(classes.default);
  });

  it("merges the class entry over the default", () => {
    const p = trainerProfile({ classId: 20, aiFlags: 0 }, flags, classes);
    expect(p.combat).toBe("skilled");
    expect(p.switch).toEqual({ enabled: true, typeThreshold: 2, hpThreshold: 0.25, cooldownS: 8 });
  });

  it("applies the set flag bits, the higher bit winning", () => {
    const p = trainerProfile({ classId: 3, aiFlags: 0b111 }, flags, classes);
    expect(p.combat).toBe("veteran");
    expect(p.switch).toMatchObject({ enabled: true, typeThreshold: 4 });
  });

  it("ignores bits with no mapping", () => {
    expect(trainerProfile({ classId: 3, aiFlags: 1 << 9 }, flags, classes)).toEqual(classes.default);
  });
});
