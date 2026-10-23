// Synthetic message banks for tests. This builder is deliberately independent of the production
// decoder: the cipher and the 9-bit / 15-bit packing are written again here from
// specs/005-text-catalog/research.md R1–R2, so a bug in one side cannot hide in the other.

export interface BankEntryInput {
  /** 16-bit words: text characters, 0xE000, 0x25BC, 0x25BD, or 0xFFFE command sequences. */
  words: readonly number[];
  /** Pack the characters as a compressed (0xF100) entry. Only valid for character codes 0x000–0x1FE. */
  compressed?: boolean;
  /** With compressed: omit the 0x1FF end; the text ends at the word boundary (research R2). */
  unterminated?: boolean;
}

export interface BankOptions {
  seed: number;
}

/** Packs 9-bit codes into 15-bit words, least significant bit first; pads with 1 bits. */
export function pack9into15(codes: readonly number[]): number[] {
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  const push = (value: number, width: number) => {
    acc |= value << bits;
    bits += width;
    while (bits >= 15) {
      words.push(acc & 0x7fff);
      acc = acc >>> 15;
      bits -= 15;
    }
  };
  for (const code of codes) push(code, 9);
  const needed = Math.ceil((codes.length * 9) / 15);
  while (words.length < needed) push(0x1ff, 9);
  return words.slice(0, needed);
}

/** Entry body as 16-bit words, before the cipher: compressed entries start with 0xF100. */
function entryWords(entry: BankEntryInput): number[] {
  if (!entry.compressed) return [...entry.words, 0xffff];
  const codes = entry.unterminated ? [...entry.words] : [...entry.words, 0x1ff];
  return [0xf100, ...pack9into15(codes), 0xffff];
}

function textKey(index: number): number {
  return (0x91bd3 * (index + 1)) & 0xffff;
}

function tableKey(seed: number, index: number): number {
  const key = (seed * 0x2fd) & 0xffff;
  const k = (key * (index + 1)) & 0xffff;
  return (k | (k << 16)) >>> 0;
}

/** Builds the bytes of a message bank with the given entries and seed. */
export function buildBank(entries: readonly BankEntryInput[], options: BankOptions): Uint8Array {
  const bodies = entries.map(entryWords);
  const tableSize = 4 + entries.length * 8;
  const total = tableSize + bodies.reduce((sum, body) => sum + body.length * 2, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, entries.length, true);
  view.setUint16(2, options.seed, true);

  let offset = tableSize;
  bodies.forEach((body, index) => {
    const k = tableKey(options.seed, index);
    view.setUint32(4 + index * 8, (offset ^ k) >>> 0, true);
    view.setUint32(8 + index * 8, (body.length ^ k) >>> 0, true);
    const ck0 = textKey(index);
    let ck = ck0;
    body.forEach((word) => {
      view.setUint16(offset, (word ^ ck) & 0xffff, true);
      ck = (ck + 0x493d) & 0xffff;
      offset += 2;
    });
  });
  return out;
}

/** Deterministic pseudo-random bank for property tests (no external randomness). */
export function randomBank(seed: number): Uint8Array {
  let state = seed >>> 0 || 1;
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state >>> 16;
  };
  const count = 1 + (next() % 6);
  const entries: BankEntryInput[] = [];
  for (let i = 0; i < count; i++) {
    const length = next() % 9;
    const words: number[] = [];
    for (let j = 0; j < length; j++) words.push(0x121 + (next() % 0x80));
    entries.push({ words, compressed: next() % 2 === 0 });
  }
  return buildBank(entries, { seed: next() });
}
