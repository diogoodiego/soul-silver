import { describe, expect, it } from "vitest";
import { buildReleaseNotes } from "../release-notes.ts";

describe("buildReleaseNotes", () => {
  it("groups commits by type in a fixed order", () => {
    const notes = buildReleaseNotes([
      "docs: update README",
      "fix(app): keep window responsive",
      "feat: add installer",
      "feat(client): show version",
    ]);
    expect(notes).toBe(
      [
        "## Novidades",
        "",
        "- add installer",
        "- show version",
        "",
        "## Correções",
        "",
        "- keep window responsive",
        "",
        "## Outras mudanças",
        "",
        "- update README",
        "",
      ].join("\n"),
    );
  });

  it("omits empty sections", () => {
    expect(buildReleaseNotes(["fix: a"])).toBe("## Correções\n\n- a\n");
  });

  it("labels breaking changes", () => {
    expect(buildReleaseNotes(["feat!: drop old saves", "feat(net)!: new handshake"])).toBe(
      "## Novidades\n\n- **(incompatível)** drop old saves\n- **(incompatível)** new handshake\n",
    );
  });

  it("keeps subjects without a conventional prefix unchanged", () => {
    expect(buildReleaseNotes(["Initial commit"])).toBe("## Outras mudanças\n\n- Initial commit\n");
  });

  it("handles an empty history", () => {
    expect(buildReleaseNotes([])).toBe("Sem mudanças registradas.\n");
  });
});
