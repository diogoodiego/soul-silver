/** CRC-16/MODBUS (reflected poly 0xA001, init 0xFFFF), as used by the DS BIOS for the header. */
export function crc16(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffff;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i]!;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}
