import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAssetPath } from "../src/main/assets-protocol";

const root = resolve("/data/extraction");

describe("resolveAssetPath", () => {
  it("maps a URL to a file under the root", () => {
    expect(resolveAssetPath(root, "assets://stages/maps/maps/0060/layers/0-lower.png")).toBe(join(root, "stages", "maps", "maps", "0060", "layers", "0-lower.png"));
  });

  it("decodes escaped characters", () => {
    expect(resolveAssetPath(root, "assets://stages/a%20b.json")).toBe(join(root, "stages", "a b.json"));
  });

  it.each(["assets://stages/../../secret.txt", "assets://stages/%2e%2e/%2e%2e/secret.txt"])("keeps %s inside the root (the URL parser drops the dot segments)", (url) => {
    expect(resolveAssetPath(root, url)).toBe(join(root, "stages", "secret.txt"));
  });

  it.each([
    "assets://stages/..%2f..%2fsecret.txt",
    "assets://stages/..%5c..%5csecret.txt",
    "assets://stages/C:%5cWindows%5cwin.ini",
    "assets://stages/%00.json",
    "file:///etc/passwd",
    "not a url",
  ])("refuses %s", (url) => {
    expect(resolveAssetPath(root, url)).toBeUndefined();
  });
});
