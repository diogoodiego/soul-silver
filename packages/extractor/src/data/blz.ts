// BLZ ("backward LZ") as used by the DS SDK for ARM9 and overlays; see
// specs/004-game-data-extraction/research.md R2.

export class BlzFormatError extends Error {
  override name = "BlzFormatError";
}

const FOOTER_SIZE = 8;

/**
 * Decompresses a BLZ file. The last 8 bytes are `u32` (compressed size in the low 24 bits,
 * footer length in the high 8) and `i32` (growth after decompressing). Everything before the
 * compressed region is copied as is. The stream is read from the end towards the start.
 */
export function decompressBlz(input: Uint8Array): Uint8Array {
  const end = input.length;
  if (end < FOOTER_SIZE) throw new BlzFormatError("Arquivo curto demais para ter o rodapé BLZ");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const footer = view.getUint32(end - 8, true);
  const extra = view.getInt32(end - 4, true);
  const headerLength = footer >>> 24;
  const compressedLength = footer & 0xffffff;
  if (headerLength < FOOTER_SIZE || headerLength > compressedLength || compressedLength > end) {
    throw new BlzFormatError(`Rodapé BLZ inválido (cabeçalho ${headerLength}, comprimido ${compressedLength}, arquivo ${end})`);
  }

  const head = end - compressedLength;
  const total = end + extra;
  if (total < head) throw new BlzFormatError(`Tamanho descomprimido inválido (${total})`);
  const out = new Uint8Array(total);
  out.set(input.subarray(0, head));

  let src = end - headerLength;
  let dst = total;
  while (src > head) {
    let flags = input[--src]!;
    for (let item = 0; item < 8 && src > head; item++, flags = (flags << 1) & 0xff) {
      if (flags & 0x80) {
        if (src - 2 < head) throw new BlzFormatError("Fluxo BLZ termina no meio de uma referência");
        const high = input[--src]!;
        const low = input[--src]!;
        const length = (high >> 4) + 3;
        const displacement = (((high & 0x0f) << 8) | low) + 3;
        if (dst - length < head || dst + displacement > total) {
          throw new BlzFormatError(`Referência BLZ fora dos limites (tamanho ${length}, distância ${displacement})`);
        }
        for (let k = 0; k < length; k++) {
          dst--;
          out[dst] = out[dst + displacement]!;
        }
      } else {
        if (dst <= head) throw new BlzFormatError("Fluxo BLZ produz mais dados do que o declarado");
        out[--dst] = input[--src]!;
      }
    }
  }
  if (dst !== head) throw new BlzFormatError(`Tamanho descomprimido não confere (faltam ${dst - head} bytes)`);
  return out;
}
