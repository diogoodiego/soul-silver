import { describe, expect, it } from "vitest";
import { findForbiddenFiles } from "../forbidden-files.ts";

const DS_EXTENSIONS = [
  ".narc", ".arc", ".ncgr", ".nclr", ".nscr", ".ncer", ".nanr", ".nmcr", ".nmar", ".nsbmd",
  ".nsbtx", ".nsbca", ".nsbta", ".nsbtp", ".nsbma", ".nsbva", ".sdat", ".sseq", ".ssar", ".sbnk",
  ".swar", ".strm", ".bmg",
];

const MEDIA_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tga", ".ico", ".svg", ".wav", ".ogg",
  ".mp3", ".flac", ".mid", ".midi",
];

function ruleOf(path: string): string | undefined {
  return findForbiddenFiles([path])[0]?.ruleId;
}

describe("findForbiddenFiles", () => {
  it.each(["assets/maps/route29.json", "assets/x.bin", "Assets/x.json", "ASSETS/a/b/c.txt"])(
    "blocks %s inside the assets folder",
    (path) => {
      expect(ruleOf(path)).toBe("asset-dir");
    },
  );

  it.each(["roms/soulsilver.nds", "game.NDS", "deep/dir/x.Nds"])("blocks the ROM %s", (path) => {
    expect(ruleOf(path)).toBe("rom");
  });

  it.each(DS_EXTENSIONS)("blocks the DS format %s anywhere", (ext) => {
    expect(ruleOf(`tmp/file${ext}`)).toBe("ds-format");
    expect(ruleOf(`tmp/FILE${ext.toUpperCase()}`)).toBe("ds-format");
  });

  it.each(MEDIA_EXTENSIONS)("blocks %s outside art/ and allows it inside", (ext) => {
    expect(ruleOf(`docs/screenshot${ext}`)).toBe("media-outside-art");
    expect(ruleOf(`art/icon${ext}`)).toBeUndefined();
  });

  it.each(["artwork/x.png", "docs/art/x.png", "packages/client/art/x.png"])(
    "treats only the root art/ folder as allowed (%s is blocked)",
    (path) => {
      expect(ruleOf(path)).toBe("media-outside-art");
    },
  );

  it("allows nested files in art/", () => {
    expect(ruleOf("art/ui/button.svg")).toBeUndefined();
  });

  it("reports only the first matching rule", () => {
    expect(findForbiddenFiles(["assets/x.nds"])).toEqual([
      expect.objectContaining({ path: "assets/x.nds", ruleId: "asset-dir" }),
    ]);
  });

  it("normalizes Windows separators", () => {
    expect(ruleOf("assets\\x.bin")).toBe("asset-dir");
    expect(ruleOf("art\\icon.png")).toBeUndefined();
  });

  it("allows ordinary project files", () => {
    expect(findForbiddenFiles(["src/a.ts", "README.md", "package.json", "docs/balance-log.md"])).toEqual(
      [],
    );
  });

  it("gives every violation a reason", () => {
    const violations = findForbiddenFiles(["assets/a", "a.nds", "a.narc", "a.png"]);
    expect(violations).toHaveLength(4);
    for (const v of violations) expect(v.reason.length).toBeGreaterThan(0);
  });
});
