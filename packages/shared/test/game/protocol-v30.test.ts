import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";
import { SAVE_SCHEMA_VERSION } from "../../src/save/schema.ts";

// Item 030.10: the save the protocol carries (save v16) lets a member keep the in-game trade it came from.

describe("protocol v30", () => {
  it("is version 30, with save v16", () => {
    expect(PROTOCOL_VERSION).toBe(30);
    expect(SAVE_SCHEMA_VERSION).toBe(16);
  });
});
