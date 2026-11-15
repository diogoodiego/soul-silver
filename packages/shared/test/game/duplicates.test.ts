import { describe, expect, it } from "vitest";
import { findDuplicates } from "../../src/game/duplicates";

// Spec 024 US3 (research R8). The shapes follow New Bark Town: the friend's two versions share a sprite and a script.

const object = (id: number, sprite: number, script: number | null, hideFlag = 0) => ({ id, sprite, hideFlag, script: script === null ? null : { id: script } });
const all = () => true;
const ids = (groups: { id: number }[][]) => groups.map((g) => g.map((o) => o.id));

describe("findDuplicates", () => {
  it("finds two visible objects with the same sprite and script", () => {
    const objects = [object(4, 101, 5, 418), object(8, 101, 5, 744), object(1, 325, 2)];
    expect(ids(findDuplicates(objects, all))).toEqual([[4, 8]]);
  });

  // Spec 030.6: Azalea's four Slowpokes (sprite 1015, script 866:1) come back together once the well is cleared (flag 427).
  it("ignores a herd: the same sprite and script all shown and hidden by one flag", () => {
    const slowpokes = [5, 6, 7, 8].map((id) => object(id, 1015, 1, 427));
    expect(findDuplicates(slowpokes, all)).toEqual([]);
    expect(ids(findDuplicates([...slowpokes, object(9, 1015, 1, 428)], all))).toEqual([[5, 6, 7, 8, 9]]);
  });

  it("does not count an object the filter hides", () => {
    const objects = [object(4, 101, 5, 418), object(8, 101, 5, 744)];
    expect(findDuplicates(objects, (o) => o.id !== 8)).toEqual([]);
  });

  it("ignores the same sprite with different scripts, like two trainers", () => {
    expect(findDuplicates([object(1, 7, 10), object(2, 7, 11)], all)).toEqual([]);
  });

  it("ignores a shared script from the common banks, like Route 29's two apricorn trees (146:0)", () => {
    expect(findDuplicates([object(4, 86, 10000, 16), object(5, 86, 10000, 17)], all)).toEqual([]);
  });

  it("ignores the same sprite without a script, like scenery", () => {
    expect(findDuplicates([object(1, 99, null), object(2, 99, null)], all)).toEqual([]);
  });

  it("finds a known pair of versions, even with different sprites and scripts", () => {
    const objects = [object(1, 20, 1, 500), object(2, 21, 2, 501), object(3, 22, 3, 502)];
    expect(ids(findDuplicates(objects, all, [[500, 501]]))).toEqual([[1, 2]]);
  });

  it("does not report a known pair while only one version is visible", () => {
    const objects = [object(1, 20, 1, 500), object(2, 21, 2, 501)];
    expect(findDuplicates(objects, (o) => o.id === 1, [[500, 501]])).toEqual([]);
  });
});
