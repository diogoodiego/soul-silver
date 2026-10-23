// Message banks of the DS game: cipher, offset table and compressed entries.
// See specs/005-text-catalog/research.md R1–R2. The round trip is exact by construction and is
// checked over every real bank by the stage.

export class BankFormatError extends Error {
  override name = "BankFormatError";
  readonly entry: number | undefined;

  constructor(problem: string, entry?: number) {
    super(entry === undefined ? problem : `Entrada ${entry}: ${problem}`);
    this.entry = entry;
  }
}

export interface BankEntry {
  /** 0xF100 marker present: the words are 9-bit characters packed in 15-bit words. */
  compressed: boolean;
  /**
   * Compressed entries only: false when the stream has no 0x1FF end and the text ends at the
   * word boundary (or in padding ones). Kept so that recoding gives the original bytes.
   */
  terminated: boolean;
  /** Text words without the 0xFFFF terminator (and, for compressed entries, unpacked characters). */
  words: number[];
}

export interface Bank {
  seed: number;
  entries: BankEntry[];
}

const TERMINATOR = 0xffff;
const COMPRESSED_MARK = 0xf100;
const COMPRESSED_END = 0x1ff;

/** key for the offset/length table of entry i: (seed × 0x2FD) × (i+1), both halves. */
function tableKey(seed: number, index: number): number {
  const key = (seed * 0x2fd) & 0xffff;
  const k = (key * (index + 1)) & 0xffff;
  return (k | (k << 16)) >>> 0;
}

/** key for the words of entry i: 0x91BD3 × (i+1), then +0x493D per word. */
function textKey(index: number): number {
  return (0x91bd3 * (index + 1)) & 0xffff;
}

/** 15-bit words → 9-bit codes, least significant bit first, stopping at 0x1FF. */
function unpack15into9(words: readonly number[]): { codes: number[]; terminated: boolean } {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const word of words) {
    acc |= (word & 0x7fff) << bits;
    bits += 15;
    while (bits >= 9) {
      const code = acc & 0x1ff;
      acc >>>= 9;
      bits -= 9;
      if (code === COMPRESSED_END) return { codes: out, terminated: true };
      out.push(code);
    }
  }
  // Some texts have no 0x1FF: they end at the word boundary, or in fewer than 9 padding ones (research R2).
  const leftover = bits;
  if (leftover < 9 && (acc & ((1 << leftover) - 1)) === (1 << leftover) - 1) return { codes: out, terminated: false };
  throw new BankFormatError("texto comprimido com bits de preenchimento inválidos");
}

export function decodeBank(bytes: Uint8Array): Bank {
  if (bytes.length < 4) throw new BankFormatError("banco menor que o cabeçalho");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(0, true);
  const seed = view.getUint16(2, true);
  if (4 + count * 8 > bytes.length) throw new BankFormatError(`tabela de ${count} entradas além do fim do banco`);

  const entries: BankEntry[] = [];
  for (let i = 0; i < count; i++) {
    const k = tableKey(seed, i);
    const offset = (view.getUint32(4 + i * 8, true) ^ k) >>> 0;
    const length = (view.getUint32(8 + i * 8, true) ^ k) >>> 0;
    if (offset + length * 2 > bytes.length) throw new BankFormatError("além do fim do banco", i);
    if (length === 0) throw new BankFormatError("entrada sem terminador", i);

    const tk = textKey(i);
    const words: number[] = [];
    let ck = tk;
    for (let j = 0; j < length; j++) {
      words.push((view.getUint16(offset + j * 2, true) ^ ck) & 0xffff);
      ck = (ck + 0x493d) & 0xffff;
    }
    if (words[length - 1] !== TERMINATOR) throw new BankFormatError("entrada sem terminador 0xFFFF", i);
    words.pop();

    if (words[0] === COMPRESSED_MARK) {
      const { codes, terminated } = unpack15into9(words.slice(1));
      entries.push({ compressed: true, terminated, words: codes });
    } else {
      entries.push({ compressed: false, terminated: true, words });
    }
  }
  return { seed, entries };
}

/** 9-bit codes → 15-bit words; the stream is 0x1FF-terminated and padded with 1 bits. */
function pack9into15(codes: readonly number[]): number[] {
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  const push = (value: number) => {
    acc |= value << bits;
    bits += 9;
    while (bits >= 15) {
      words.push(acc & 0x7fff);
      acc >>>= 15;
      bits -= 15;
    }
  };
  for (const code of codes) push(code);
  const needed = Math.ceil((codes.length * 9) / 15);
  while (words.length < needed) push(COMPRESSED_END);
  return words.slice(0, needed);
}

export function encodeBank(bank: Bank): Uint8Array {
  const bodies = bank.entries.map((entry) => {
    if (!entry.compressed) return [...entry.words, TERMINATOR];
    const codes = entry.terminated ? [...entry.words, COMPRESSED_END] : [...entry.words];
    return [COMPRESSED_MARK, ...pack9into15(codes), TERMINATOR];
  });
  const tableSize = 4 + bank.entries.length * 8;
  const total = tableSize + bodies.reduce((sum, body) => sum + body.length * 2, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, bank.entries.length, true);
  view.setUint16(2, bank.seed, true);

  let offset = tableSize;
  bodies.forEach((body, i) => {
    const k = tableKey(bank.seed, i);
    view.setUint32(4 + i * 8, (offset ^ k) >>> 0, true);
    view.setUint32(8 + i * 8, (body.length ^ k) >>> 0, true);
    let ck = textKey(i);
    for (const word of body) {
      view.setUint16(offset, (word ^ ck) & 0xffff, true);
      ck = (ck + 0x493d) & 0xffff;
      offset += 2;
    }
  });
  return out;
}
