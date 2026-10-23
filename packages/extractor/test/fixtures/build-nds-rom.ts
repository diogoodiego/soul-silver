import { createHash } from "node:crypto";
import { crc16 } from "../../src/rom/crc16.ts";
import { buildFnt } from "./build-fnt.ts";
import { ByteWriter } from "./byte-writer.ts";

export interface NdsRomOptions {
  gameCode?: string;
  title?: string;
  /** POSIX paths, nested directories allowed. */
  files?: Record<string, Uint8Array>;
  arm9?: Uint8Array;
  arm7?: Uint8Array;
  overlays9?: readonly Uint8Array[];
  overlays7?: readonly Uint8Array[];
  /** Sets the "compressed" flag (bit 24 of the word at 0x1C) of the matching ARM9 overlay entries. */
  compressedOverlays9?: readonly boolean[];
  banner?: Uint8Array;
}

export const HEADER_SIZE = 0x4000;
export const BANNER_SIZE = 0x840;
export const MIN_ROM_SIZE = 32 * 1024;

function filled(length: number, value: number): Uint8Array {
  return new Uint8Array(length).fill(value);
}

/** Builds a synthetic DS ROM with the layout documented in research R4. */
export function buildNdsRom(options: NdsRomOptions = {}): Uint8Array {
  const title = options.title ?? "POKEMON SS";
  const gameCode = options.gameCode ?? "IPGE";
  const files = options.files ?? { "data/hello.bin": filled(10, 0x11) };
  const arm9 = options.arm9 ?? filled(16, 0x09);
  const arm7 = options.arm7 ?? filled(16, 0x07);
  const overlays9 = options.overlays9 ?? [filled(8, 0x90)];
  const overlays7 = options.overlays7 ?? [filled(8, 0x70)];
  const banner = options.banner ?? filled(BANNER_SIZE, 0xbb);

  const firstFileId = overlays9.length + overlays7.length;
  const { fnt, order } = buildFnt(Object.keys(files), firstFileId);
  const fileData: Uint8Array[] = [...overlays9, ...overlays7, ...order.map((path) => files[path]!)];

  const rom = new ByteWriter();
  rom.raw(new Uint8Array(HEADER_SIZE));
  const place = (data: Uint8Array): number => {
    rom.align(4, 0xff);
    const offset = rom.length;
    rom.raw(data);
    return offset;
  };

  const arm9Offset = place(arm9);
  const arm7Offset = place(arm7);
  const overlayTable = (overlays: readonly Uint8Array[], firstId: number, compressed: readonly boolean[] = []): Uint8Array => {
    const table = new ByteWriter();
    overlays.forEach((overlay, i) => {
      table.u32(i).u32(0x02000000).u32(overlay.length).u32(0).u32(0).u32(0).u32(firstId + i).u32(compressed[i] ? 1 << 24 : 0);
    });
    return table.toBytes();
  };
  const y9 = overlayTable(overlays9, 0, options.compressedOverlays9);
  const y7 = overlayTable(overlays7, overlays9.length);
  const y9Offset = place(y9);
  const y7Offset = place(y7);
  const fntOffset = place(fnt);
  const fatOffset = place(new Uint8Array(fileData.length * 8));
  const bannerOffset = place(banner);
  fileData.forEach((data, id) => {
    const start = place(data);
    rom.setU32(fatOffset + id * 8, start);
    rom.setU32(fatOffset + id * 8 + 4, start + data.length);
  });
  const usedSize = rom.length;
  while (rom.length < MIN_ROM_SIZE) rom.u8(0xff);

  rom.set(0x00, new TextEncoder().encode(title.slice(0, 12)));
  rom.set(0x0c, new TextEncoder().encode(gameCode.slice(0, 4)));
  const fields: Array<[number, number]> = [
    [0x20, arm9Offset], [0x24, 0x02000800], [0x28, 0x02000000], [0x2c, arm9.length],
    [0x30, arm7Offset], [0x34, 0x02380000], [0x38, 0x02380000], [0x3c, arm7.length],
    [0x40, fntOffset], [0x44, fnt.length], [0x48, fatOffset], [0x4c, fileData.length * 8],
    [0x50, y9Offset], [0x54, y9.length], [0x58, y7Offset], [0x5c, y7.length],
    [0x68, bannerOffset], [0x80, usedSize], [0x84, HEADER_SIZE],
  ];
  for (const [offset, value] of fields) rom.setU32(offset, value);
  rom.setU16(0x15c, 0xcf56);
  const bytes = rom.toBytes();
  const crc = crc16(bytes, 0, 0x15e);
  bytes[0x15e] = crc & 0xff;
  bytes[0x15f] = crc >>> 8;
  return bytes;
}

export function sha1Hex(bytes: Uint8Array): string {
  return createHash("sha1").update(bytes).digest("hex");
}

/** Returns a copy with the byte at `offset` inverted. */
export function corruptByte(rom: Uint8Array, offset: number): Uint8Array {
  const copy = rom.slice();
  copy[offset] = copy[offset]! ^ 0xff;
  return copy;
}
