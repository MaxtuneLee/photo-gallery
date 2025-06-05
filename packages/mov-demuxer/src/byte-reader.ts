/**
 * Binary data reading utilities
 * Inspired by FFmpeg's avio.h and bytestream functions
 */

export class ByteReader {
  private view: DataView
  private offset = 0
  private littleEndian = false

  constructor(
    buffer: ArrayBuffer | Uint8Array,
    offset = 0,
    littleEndian = false,
  ) {
    if (buffer instanceof Uint8Array) {
      this.view = new DataView(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      )
    } else {
      this.view = new DataView(buffer)
    }
    this.offset = offset
    this.littleEndian = littleEndian
  }

  get position(): number {
    return this.offset
  }

  get remaining(): number {
    return this.view.byteLength - this.offset
  }

  seek(offset: number): void {
    this.offset = offset
  }

  skip(bytes: number): void {
    this.offset += bytes
  }

  readUint8(): number {
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value
  }

  readUint16(): number {
    const value = this.view.getUint16(this.offset, this.littleEndian)
    this.offset += 2
    return value
  }

  readUint24(): number {
    if (this.littleEndian) {
      return (
        this.readUint8() | (this.readUint8() << 8) | (this.readUint8() << 16)
      )
    } else {
      return (
        (this.readUint8() << 16) | (this.readUint8() << 8) | this.readUint8()
      )
    }
  }

  readUint32(): number {
    const value = this.view.getUint32(this.offset, this.littleEndian)
    this.offset += 4
    return value
  }

  readUint64(): bigint {
    const value = this.view.getBigUint64(this.offset, this.littleEndian)
    this.offset += 8
    return value
  }

  readInt8(): number {
    const value = this.view.getInt8(this.offset)
    this.offset += 1
    return value
  }

  readInt16(): number {
    const value = this.view.getInt16(this.offset, this.littleEndian)
    this.offset += 2
    return value
  }

  readInt32(): number {
    const value = this.view.getInt32(this.offset, this.littleEndian)
    this.offset += 4
    return value
  }

  readFloat32(): number {
    const value = this.view.getFloat32(this.offset, this.littleEndian)
    this.offset += 4
    return value
  }

  readFloat64(): number {
    const value = this.view.getFloat64(this.offset, this.littleEndian)
    this.offset += 8
    return value
  }

  readBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      length,
    )
    this.offset += length
    return bytes
  }

  readString(length: number, encoding: 'utf8' | 'ascii' = 'ascii'): string {
    const bytes = this.readBytes(length)
    if (encoding === 'utf8') {
      return new TextDecoder('utf-8').decode(bytes)
    } else {
      return String.fromCodePoint(...bytes)
    }
  }

  readFourCC(): string {
    return this.readString(4)
  }

  // Read fixed-point numbers (common in QuickTime)
  readFixed16(): number {
    return this.readInt32() / (1 << 16)
  }

  readFixed32(): number {
    return this.readInt32() / (1 << 16)
  }

  // Peek functions (read without advancing offset)
  peekUint8(offset = 0): number {
    return this.view.getUint8(this.offset + offset)
  }

  peekUint16(offset = 0): number {
    return this.view.getUint16(this.offset + offset, this.littleEndian)
  }

  peekUint32(offset = 0): number {
    return this.view.getUint32(this.offset + offset, this.littleEndian)
  }

  peekFourCC(offset = 0): string {
    const savedOffset = this.offset
    this.offset += offset
    const fourcc = this.readFourCC()
    this.offset = savedOffset
    return fourcc
  }

  // Create a sub-reader for a specific range
  subReader(length: number): ByteReader {
    const subView = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      length,
    )
    this.offset += length
    return new ByteReader(subView, 0, this.littleEndian)
  }

  // Check if we can read the specified number of bytes
  canRead(bytes: number): boolean {
    return this.offset + bytes <= this.view.byteLength
  }
}

export function createByteReader(
  buffer: ArrayBuffer | Uint8Array,
  offset = 0,
): ByteReader {
  return new ByteReader(buffer, offset)
}
