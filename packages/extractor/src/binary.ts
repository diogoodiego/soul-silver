// Bounds-checked little-endian readers for DS binary formats.

function check(bytes: Uint8Array, offset: number, length: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset + length > bytes.length) {
    throw new RangeError(`Read of ${length} bytes at offset 0x${offset.toString(16)} exceeds length 0x${bytes.length.toString(16)}`);
  }
}

export function readU16(bytes: Uint8Array, offset: number): number {
  check(bytes, offset, 2);
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

export function readU32(bytes: Uint8Array, offset: number): number {
  check(bytes, offset, 4);
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

/** Reads `length` bytes as ASCII, stopping at the first NUL. */
export function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  check(bytes, offset, length);
  let text = "";
  for (let i = offset; i < offset + length; i++) {
    const byte = bytes[i]!;
    if (byte === 0) break;
    text += String.fromCharCode(byte);
  }
  return text;
}
