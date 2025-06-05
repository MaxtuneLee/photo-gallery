/**
 * MOV/MP4 Box parser
 * Inspired by FFmpeg's mov_read_atom function
 */

import { ByteReader } from './byte-reader.js'
import type { MOVAtom, MOVBox } from './types.js'

export class BoxParser {
  private reader: ByteReader
  private debug: boolean

  constructor(buffer: ArrayBuffer | Uint8Array, debug = false) {
    this.reader = new ByteReader(buffer)
    this.debug = debug
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.info(`[BoxParser] ${message}`, ...args)
    }
  }

  /**
   * Read box header (size + type)
   * Similar to FFmpeg's mov_read_atom_into_extradata
   */
  private readBoxHeader(): MOVAtom | null {
    if (this.reader.remaining < 8) {
      return null
    }

    let size = this.reader.readUint32()
    const type = this.reader.readFourCC()

    // Handle extended size (64-bit)
    if (size === 1) {
      if (this.reader.remaining < 8) {
        return null
      }
      const extendedSize = this.reader.readUint64()
      size = Number(extendedSize)
    } else if (size === 0) {
      // Size 0 means the box extends to the end of file
      size = this.reader.remaining + 8
    }

    const offset = this.reader.position - (size === 1 ? 16 : 8)

    this.log(`Found box: ${type}, size: ${size}, offset: ${offset}`)

    return { type, size, offset }
  }

  /**
   * Parse all boxes in the file
   * Similar to FFmpeg's mov_read_header
   */
  parseBoxes(): MOVBox[] {
    const boxes: MOVBox[] = []

    while (this.reader.remaining > 0) {
      const atom = this.readBoxHeader()
      if (!atom) {
        break
      }

      const box = this.parseBox(atom)
      if (box) {
        boxes.push(box)
      }
    }

    return boxes
  }

  /**
   * Parse a single box
   * Similar to FFmpeg's mov_read_atom
   */
  private parseBox(atom: MOVAtom): MOVBox | null {
    const dataSize = atom.size - (this.reader.position - atom.offset)

    if (dataSize < 0 || this.reader.remaining < dataSize) {
      this.log(`Invalid box size for ${atom.type}: ${dataSize}`)
      return null
    }

    const box: MOVBox = {
      type: atom.type,
      size: atom.size,
      offset: atom.offset,
    }

    // For container boxes, parse children
    if (this.isContainerBox(atom.type)) {
      box.children = this.parseContainerBox(dataSize)
    } else {
      // For leaf boxes, store the data
      box.data = this.reader.readBytes(dataSize)
    }

    return box
  }

  /**
   * Parse container box children
   */
  private parseContainerBox(containerSize: number): MOVBox[] {
    const children: MOVBox[] = []
    const endOffset = this.reader.position + containerSize

    while (this.reader.position < endOffset && this.reader.remaining > 0) {
      const atom = this.readBoxHeader()
      if (!atom) {
        break
      }

      // Ensure we don't read beyond the container
      if (this.reader.position - 8 + atom.size > endOffset) {
        this.log(`Child box ${atom.type} extends beyond container`)
        break
      }

      const child = this.parseBox(atom)
      if (child) {
        children.push(child)
      }
    }

    return children
  }

  /**
   * Check if a box type is a container (has child boxes)
   * Based on ISO/IEC 14496-12 specification
   */
  private isContainerBox(type: string): boolean {
    const containerTypes = new Set([
      'moov',
      'trak',
      'mdia',
      'minf',
      'stbl',
      'udta',
      'meta',
      'dinf',
      'edts',
      'mvex',
      'moof',
      'traf',
      'mfra',
      'skip',
      'wide',
      'free',
      'uuid',
      'pnot',
    ])

    return containerTypes.has(type)
  }

  /**
   * Find a box by type (recursive search)
   */
  static findBox(boxes: MOVBox[], type: string): MOVBox | null {
    for (const box of boxes) {
      if (box.type === type) {
        return box
      }

      if (box.children) {
        const found = this.findBox(box.children, type)
        if (found) {
          return found
        }
      }
    }

    return null
  }

  /**
   * Find all boxes of a specific type
   */
  static findAllBoxes(boxes: MOVBox[], type: string): MOVBox[] {
    const result: MOVBox[] = []

    for (const box of boxes) {
      if (box.type === type) {
        result.push(box)
      }

      if (box.children) {
        result.push(...this.findAllBoxes(box.children, type))
      }
    }

    return result
  }

  /**
   * Get box path (for debugging)
   */
  static getBoxPath(
    boxes: MOVBox[],
    targetBox: MOVBox,
    path: string[] = [],
  ): string[] | null {
    for (const box of boxes) {
      const currentPath = [...path, box.type]

      if (box === targetBox) {
        return currentPath
      }

      if (box.children) {
        const found = this.getBoxPath(box.children, targetBox, currentPath)
        if (found) {
          return found
        }
      }
    }

    return null
  }
}
