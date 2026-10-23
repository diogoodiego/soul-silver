import { describe, expect, it } from "vitest";
import { validateReleaseTag } from "../release-tag.ts";

describe("validateReleaseTag", () => {
  it("accepts a new tag matching the app version", () => {
    expect(validateReleaseTag({ tag: "v0.2.0", appVersion: "0.2.0", publishedVersions: ["0.1.0"] })).toEqual({
      ok: true,
    });
  });

  it("accepts the first release", () => {
    expect(validateReleaseTag({ tag: "v0.1.0", appVersion: "0.1.0", publishedVersions: [] }).ok).toBe(true);
  });

  it.each(["v1.2", "1.2.3", "v1.2.3-beta", "v01.2.3", "v1.2.3.4", ""])("rejects the format of %j", (tag) => {
    expect(validateReleaseTag({ tag, appVersion: "1.2.3", publishedVersions: [] })).toMatchObject({
      ok: false,
      reason: "invalid-format",
    });
  });

  it("rejects a tag that differs from the app version, showing both", () => {
    const result = validateReleaseTag({ tag: "v0.2.1", appVersion: "0.2.0", publishedVersions: [] });
    expect(result).toMatchObject({ ok: false, reason: "version-mismatch" });
    if (!result.ok) {
      expect(result.message).toContain("0.2.1");
      expect(result.message).toContain("0.2.0");
    }
  });

  it("rejects an already published version, with or without the v prefix", () => {
    for (const published of ["0.2.0", "v0.2.0"]) {
      expect(
        validateReleaseTag({ tag: "v0.2.0", appVersion: "0.2.0", publishedVersions: [published] }),
      ).toMatchObject({ ok: false, reason: "already-published" });
    }
  });

  it("rejects a version that is not newer than every published one", () => {
    expect(
      validateReleaseTag({ tag: "v0.1.9", appVersion: "0.1.9", publishedVersions: ["v0.2.0"] }),
    ).toMatchObject({ ok: false, reason: "not-newer" });
  });

  it("compares versions numerically", () => {
    expect(
      validateReleaseTag({ tag: "v0.10.0", appVersion: "0.10.0", publishedVersions: ["0.9.0"] }).ok,
    ).toBe(true);
  });
});
