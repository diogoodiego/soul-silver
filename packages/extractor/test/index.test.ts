import { expect, it } from "vitest";
import { extractorPackageName } from "../src/index";

it("exposes the package name", () => {
  expect(extractorPackageName).toBe("@soulsilver/extractor");
});
