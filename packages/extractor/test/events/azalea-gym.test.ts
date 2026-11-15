import { describe, expect, it } from "vitest";
import { gymLevers, readAzaleaGym } from "../../src/events/azalea-gym.ts";

// Spec 030.5: the Azalea Gym's thread tables in a synthetic overlay (principle II). The overlay loads at
// `base`; stops are u16 x, u16 z; the route table has one pointer per stop to four 8-byte records (one per
// lever state): u16 point count, u16 destination stop, u32 pointer to the path's u16 x, u16 z points.

const BASE = 0x02200000;
const layout = { base: BASE, stations: 0x10, routes: 0x40, count: 2, spiders: [0] };

function overlay(over: { pointer?: number; dest?: number } = {}) {
  const b = new Uint8Array(0x200);
  const v = new DataView(b.buffer);
  [[1, 9], [4, 3]].forEach(([x, z], i) => (v.setUint16(0x10 + i * 4, x!, true), v.setUint16(0x10 + i * 4 + 2, z!, true)));
  // Stop i's four records at 0x80 + i * 32; one shared path at 0x100.
  [[1, 9], [1, 6], [4, 6], [4, 3]].forEach(([x, z], i) => (v.setUint16(0x100 + i * 4, x!, true), v.setUint16(0x100 + i * 4 + 2, z!, true)));
  for (let i = 0; i < 2; i++) {
    v.setUint32(0x40 + i * 4, over.pointer ?? BASE + 0x80 + i * 32, true);
    // Lever state 0 only; the other three records stay empty.
    v.setUint16(0x80 + i * 32, 4, true);
    v.setUint16(0x80 + i * 32 + 2, over.dest ?? 1 - i, true);
    v.setUint32(0x80 + i * 32 + 4, BASE + 0x100, true);
  }
  return b;
}

describe("readAzaleaGym", () => {
  it("reads the stops, each stop's thread per lever state and the spiders' start", () => {
    const path = [{ x: 1, z: 9 }, { x: 1, z: 6 }, { x: 4, z: 6 }, { x: 4, z: 3 }];
    expect(readAzaleaGym(overlay(), layout)).toEqual({
      stations: [{ x: 1, z: 9 }, { x: 4, z: 3 }],
      routes: [
        [{ to: 1, path }, null, null, null],
        [{ to: 0, path }, null, null, null],
      ],
      spiders: [0],
    });
  });

  it("refuses a pointer outside the overlay", () => {
    expect(() => readAzaleaGym(overlay({ pointer: BASE + 0x10000 }), layout)).toThrow(/ginásio de Azalea/);
  });

  it("refuses a thread to a stop that does not exist", () => {
    expect(() => readAzaleaGym(overlay({ dest: 5 }), layout)).toThrow(/ginásio de Azalea.*5/);
  });
});

describe("gymLevers", () => {
  // Pieces are 32 tiles of 16 units, buildings placed from the piece's center (scene.ts).
  const piece = (models: [number, number, number, number][]) => ({ buildings: models.map(([model, x, y, z]) => ({ model, position: [x, y, z] as [number, number, number], scale: [1, 1, 1] as [number, number, number] })) });

  it("lists the buildings the levers move, in map pixels, with their lever; other buildings are left out", () => {
    const cells = [
      { x: 0, z: 0, piece: piece([[117, -184, 0, -136], [1, 0, 0, 0], [116, -56, -1, -56]]) },
      { x: 0, z: 1, piece: piece([[122, -216, 0, 40]]) },
    ];
    expect(gymLevers(cells, { 116: 0, 117: 0, 122: 1 })).toEqual([
      { model: 117, lever: 0, x: 72, y: 0, z: 120 },
      { model: 116, lever: 0, x: 200, y: -1, z: 200 },
      { model: 122, lever: 1, x: 40, y: 0, z: 808 },
    ]);
  });
});
