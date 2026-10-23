import { ByteWriter } from "./byte-writer.ts";

interface Dir {
  name: string;
  files: string[];
  dirs: Map<string, Dir>;
}

export interface BuiltFnt {
  fnt: Uint8Array;
  /** File paths in file-id order, starting at `firstFileId`. */
  order: string[];
}

/**
 * Builds a DS file name table for the given POSIX paths (research R4): main table
 * with one 8-byte entry per directory, then one subtable per directory listing its
 * files (consecutive ids) followed by its subdirectories.
 */
export function buildFnt(paths: readonly string[], firstFileId: number): BuiltFnt {
  const root: Dir = { name: "", files: [], dirs: new Map() };
  for (const path of paths) {
    const parts = path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      let next = dir.dirs.get(part);
      if (!next) {
        next = { name: part, files: [], dirs: new Map() };
        dir.dirs.set(part, next);
      }
      dir = next;
    }
    dir.files.push(parts.at(-1)!);
  }

  // Breadth-first directory ids: root is 0xF000.
  const dirs: Array<{ dir: Dir; parent: number; path: string }> = [{ dir: root, parent: 0, path: "" }];
  for (let i = 0; i < dirs.length; i++) {
    const { dir, path } = dirs[i]!;
    for (const child of dir.dirs.values()) {
      dirs.push({ dir: child, parent: 0xf000 | i, path: path === "" ? child.name : `${path}/${child.name}` });
    }
  }
  const dirId = new Map<Dir, number>(dirs.map((d, i) => [d.dir, 0xf000 | i]));

  const order: string[] = [];
  const subtables: Uint8Array[] = [];
  const firstIds: number[] = [];
  for (const { dir, path } of dirs) {
    firstIds.push(firstFileId + order.length);
    const sub = new ByteWriter();
    for (const file of dir.files) {
      sub.u8(file.length).ascii(file);
      order.push(path === "" ? file : `${path}/${file}`);
    }
    for (const child of dir.dirs.values()) {
      sub.u8(0x80 + child.name.length).ascii(child.name).u16(dirId.get(child)!);
    }
    sub.u8(0);
    subtables.push(sub.toBytes());
  }

  const out = new ByteWriter();
  let subOffset = dirs.length * 8;
  dirs.forEach((d, i) => {
    out.u32(subOffset).u16(firstIds[i]!).u16(i === 0 ? dirs.length : d.parent);
    subOffset += subtables[i]!.length;
  });
  for (const sub of subtables) out.raw(sub);
  return { fnt: out.toBytes(), order };
}
