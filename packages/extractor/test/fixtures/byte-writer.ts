/** Growable little-endian buffer for the synthetic fixture builders. */
export class ByteWriter {
  private bytes = new Uint8Array(1024);
  length = 0;

  private ensure(size: number): void {
    if (size <= this.bytes.length) return;
    let capacity = this.bytes.length;
    while (capacity < size) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
  }

  u8(value: number): this {
    this.ensure(this.length + 1);
    this.bytes[this.length++] = value & 0xff;
    return this;
  }

  u16(value: number): this {
    return this.u8(value).u8(value >>> 8);
  }

  u32(value: number): this {
    return this.u16(value & 0xffff).u16(value >>> 16);
  }

  ascii(text: string): this {
    for (let i = 0; i < text.length; i++) this.u8(text.charCodeAt(i));
    return this;
  }

  raw(data: Uint8Array): this {
    this.ensure(this.length + data.length);
    this.bytes.set(data, this.length);
    this.length += data.length;
    return this;
  }

  align(boundary: number, fill = 0): this {
    while (this.length % boundary !== 0) this.u8(fill);
    return this;
  }

  set(offset: number, data: Uint8Array): void {
    this.bytes.set(data, offset);
  }

  setU16(offset: number, value: number): void {
    this.bytes[offset] = value & 0xff;
    this.bytes[offset + 1] = (value >>> 8) & 0xff;
  }

  setU32(offset: number, value: number): void {
    this.setU16(offset, value & 0xffff);
    this.setU16(offset + 2, value >>> 16);
  }

  toBytes(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}
