// O.1: room codes players read to each other, so characters that read alike (0/O, 1/I/L) are left out.

export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 6;

const CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`, "u");

export function isRoomCode(text: string): boolean {
  return CODE.test(text);
}

/** `fill` defaults to the platform's secure random source; tests pass their own. */
export function generateRoomCode(fill: (bytes: Uint8Array<ArrayBuffer>) => void = (b) => crypto.getRandomValues(b)): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  fill(bytes);
  // 256 is not a multiple of 31, so the first letters are a little more likely; harmless for a room code.
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

/** "K7P2QX" as players read it: "K7P-2QX". */
export function formatRoomCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** What a player typed (any case, with a dash or spaces) as a code; undefined if it is not one. */
export function readRoomCode(text: string): string | undefined {
  const code = text.toUpperCase().replace(/[\s-]/gu, "");
  return isRoomCode(code) ? code : undefined;
}
