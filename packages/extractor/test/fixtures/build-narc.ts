import { buildFnt } from "./build-fnt.ts";
import { ByteWriter } from "./byte-writer.ts";

/**
 * Builds a valid NARC (research R5). Without `names`, BTNF holds only the root entry,
 * as in most HGSS archives. With `names`, `names[i]` is the path of `members[i]`;
 * members are stored in the id order the FNT assigns to those names.
 */
export function buildNarc(members: readonly Uint8Array[], names?: readonly string[]): Uint8Array {
  let ordered = [...members];
  let fnt: Uint8Array;
  if (names) {
    if (names.length !== members.length) throw new Error("names must match members");
    const built = buildFnt(names, 0);
    ordered = built.order.map((name) => members[names.indexOf(name)]!);
    fnt = built.fnt;
  } else {
    fnt = new ByteWriter().u32(4).u16(0).u16(1).toBytes();
  }

  const gmif = new ByteWriter();
  const ranges: Array<[number, number]> = [];
  for (const member of ordered) {
    const start = gmif.length;
    gmif.raw(member);
    ranges.push([start, gmif.length]);
    gmif.align(4, 0xff);
  }

  const btaf = new ByteWriter().ascii("BTAF").u32(12 + 8 * ordered.length).u16(ordered.length).u16(0);
  for (const [start, end] of ranges) btaf.u32(start).u32(end);

  const btnfBody = new ByteWriter().raw(fnt).align(4, 0xff).toBytes();
  const btnf = new ByteWriter().ascii("BTNF").u32(8 + btnfBody.length).raw(btnfBody);
  const gmifSection = new ByteWriter().ascii("GMIF").u32(8 + gmif.length).raw(gmif.toBytes());

  const total = 16 + btaf.length + btnf.length + gmifSection.length;
  return new ByteWriter()
    .ascii("NARC")
    .u8(0xfe)
    .u8(0xff)
    .u16(0x0100)
    .u32(total)
    .u16(0x10)
    .u16(3)
    .raw(btaf.toBytes())
    .raw(btnf.toBytes())
    .raw(gmifSection.toBytes())
    .toBytes();
}
