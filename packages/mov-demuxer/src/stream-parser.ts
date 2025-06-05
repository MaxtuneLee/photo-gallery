/**
 * MOV Stream Context parser
 * Inspired by FFmpeg's mov_read_trak and related functions
 */

import { BoxParser } from './box-parser.js'
import { ByteReader } from './byte-reader.js'
import type {
  AudioSampleDescription,
  MOVBox,
  MOVStreamContext,
  SampleDescription,
  VideoSampleDescription,
} from './types.js'

export class StreamParser {
  private debug: boolean

  constructor(debug = false) {
    this.debug = debug
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.info(`[StreamParser] ${message}`, ...args)
    }
  }

  /**
   * Parse track (trak) box to extract stream context
   * Similar to FFmpeg's mov_read_trak
   */
  parseTrack(trakBox: MOVBox, trackId: number): MOVStreamContext | null {
    if (!trakBox.children) {
      return null
    }

    // Find mdia box
    const mdiaBox = BoxParser.findBox(trakBox.children, 'mdia')
    if (!mdiaBox || !mdiaBox.children) {
      this.log(`No mdia box found in track ${trackId}`)
      return null
    }

    // Parse media header (mdhd)
    const mdhdBox = BoxParser.findBox(mdiaBox.children, 'mdhd')
    if (!mdhdBox) {
      this.log(`No mdhd box found in track ${trackId}`)
      return null
    }

    const mediaHeader = this.parseMDHD(mdhdBox)

    // Parse handler reference (hdlr)
    const hdlrBox = BoxParser.findBox(mdiaBox.children, 'hdlr')
    if (!hdlrBox) {
      this.log(`No hdlr box found in track ${trackId}`)
      return null
    }

    const handler = this.parseHDLR(hdlrBox)

    // Determine stream type
    let streamType: 'video' | 'audio'
    if (handler.type === 'vide') {
      streamType = 'video'
    } else if (handler.type === 'soun') {
      streamType = 'audio'
    } else {
      this.log(`Unsupported handler type: ${handler.type} for track ${trackId}`)
      return null
    }

    // Find minf box
    const minfBox = BoxParser.findBox(mdiaBox.children, 'minf')
    if (!minfBox || !minfBox.children) {
      this.log(`No minf box found in track ${trackId}`)
      return null
    }

    // Find stbl box
    const stblBox = BoxParser.findBox(minfBox.children, 'stbl')
    if (!stblBox || !stblBox.children) {
      this.log(`No stbl box found in track ${trackId}`)
      return null
    }

    // Parse sample description (stsd)
    const stsdBox = BoxParser.findBox(stblBox.children, 'stsd')
    if (!stsdBox) {
      this.log(`No stsd box found in track ${trackId}`)
      return null
    }

    const sampleDesc = this.parseSTSD(stsdBox, streamType)

    const streamContext: MOVStreamContext = {
      id: trackId,
      type: streamType,
      codecType: sampleDesc.codecType,
      codecPrivate: sampleDesc.codecPrivate,
      timeScale: mediaHeader.timeScale,
      duration: mediaHeader.duration,
      extraData: sampleDesc.extraData,
    }

    if (streamType === 'video') {
      streamContext.width = sampleDesc.width
      streamContext.height = sampleDesc.height

      // Calculate frame rate from sample table if available
      const frameRates = this.calculateFrameRate(stblBox, mediaHeader.timeScale)
      if (frameRates) {
        streamContext.frameRate = frameRates.frameRate
        streamContext.avgFrameRate = frameRates.avgFrameRate
      }
    } else if (streamType === 'audio') {
      streamContext.sampleRate = sampleDesc.sampleRate
      streamContext.channels = sampleDesc.channels
      streamContext.bitDepth = sampleDesc.bitDepth
    }

    this.log(`Parsed ${streamType} track ${trackId}:`, streamContext)
    return streamContext
  }

  /**
   * Parse Media Header Box (mdhd)
   * Similar to FFmpeg's mov_read_mdhd
   */
  private parseMDHD(mdhdBox: MOVBox): { timeScale: number; duration: number } {
    if (!mdhdBox.data) {
      return { timeScale: 1000, duration: 0 }
    }

    const reader = new ByteReader(mdhdBox.data)

    const version = reader.readUint8()
    const _flags = reader.readUint24()

    let timeScale: number
    let duration: number

    if (version === 1) {
      // 64-bit version
      const _creationTime = reader.readUint64()
      const _modificationTime = reader.readUint64()
      timeScale = reader.readUint32()
      duration = Number(reader.readUint64())
    } else {
      // 32-bit version
      const _creationTime = reader.readUint32()
      const _modificationTime = reader.readUint32()
      timeScale = reader.readUint32()
      duration = reader.readUint32()
    }

    const _language = reader.readUint16()
    const _quality = reader.readUint16()

    this.log(
      `MDHD: version=${version}, timeScale=${timeScale}, duration=${duration}`,
    )

    return { timeScale, duration }
  }

  /**
   * Parse Handler Reference Box (hdlr)
   * Similar to FFmpeg's mov_read_hdlr
   */
  private parseHDLR(hdlrBox: MOVBox): { type: string; name: string } {
    if (!hdlrBox.data) {
      return { type: '', name: '' }
    }

    const reader = new ByteReader(hdlrBox.data)

    const _version = reader.readUint8()
    const _flags = reader.readUint24()
    const _componentType = reader.readFourCC()
    const componentSubtype = reader.readFourCC()
    const _componentManufacturer = reader.readUint32()
    const _componentFlags = reader.readUint32()
    const _componentFlagsMask = reader.readUint32()

    // Read component name (Pascal string or C string)
    let name = ''
    if (reader.remaining > 0) {
      const nameLength = reader.readUint8()
      if (nameLength > 0 && nameLength <= reader.remaining) {
        name = reader.readString(nameLength)
      }
    }

    this.log(`HDLR: type=${componentSubtype}, name="${name}"`)

    return { type: componentSubtype, name }
  }

  /**
   * Parse Sample Description Box (stsd)
   * Similar to FFmpeg's mov_read_stsd
   */
  private parseSTSD(
    stsdBox: MOVBox,
    streamType: 'video' | 'audio',
  ): SampleDescription {
    {
      if (!stsdBox.data) {
        return { codecType: 'unknown' }
      }

      const reader = new ByteReader(stsdBox.data)

      const _version = reader.readUint8()
      const _flags = reader.readUint24()
      const entryCount = reader.readUint32()

      this.log(
        `STSD: version=${_version}, flags=${_flags}, entries=${entryCount}`,
      )

      if (entryCount === 0) {
        return { codecType: 'unknown' }
      }

      // Read first sample description entry
      const entrySize = reader.readUint32()
      const codecType = reader.readFourCC()
      const _reserved = reader.readBytes(6) // 6 bytes reserved
      const _dataReferenceIndex = reader.readUint16()

      this.log(`Sample description: codec=${codecType}, size=${entrySize}`)

      if (streamType === 'video') {
        return this.parseVideoSampleDescription(reader, codecType, entrySize)
      } else {
        return this.parseAudioSampleDescription(reader, codecType, entrySize)
      }
    }
  }

  /**
   * Parse video sample description
   * Similar to FFmpeg's mov_read_stsd for video
   */
  private parseVideoSampleDescription(
    reader: ByteReader,
    codecType: string,
    entrySize: number,
  ): VideoSampleDescription {
    // Video sample description structure
    const _version = reader.readUint16()
    const _revisionLevel = reader.readUint16()
    const _vendor = reader.readUint32()
    const _temporalQuality = reader.readUint32()
    const _spatialQuality = reader.readUint32()
    const width = reader.readUint16()
    const height = reader.readUint16()
    const _horizResolution = reader.readFixed32()
    const _vertResolution = reader.readFixed32()
    const _dataSize = reader.readUint32()
    const _frameCount = reader.readUint16()

    // Compressor name (32 bytes, Pascal string)
    const compressorNameLength = reader.readUint8()
    const compressorName = reader.readString(Math.min(compressorNameLength, 31))
    reader.skip(31 - Math.min(compressorNameLength, 31))

    const depth = reader.readUint16()
    const _colorTableId = reader.readInt16()

    // Read extension boxes if present
    let extraData: Uint8Array | undefined
    const remainingBytes = entrySize - (reader.position - 8) // 8 bytes for size + codec

    if (remainingBytes > 0) {
      extraData = reader.readBytes(remainingBytes)
    }

    this.log(`Video: ${codecType}, ${width}x${height}, depth=${depth}`)

    return {
      codecType,
      width,
      height,
      depth,
      compressorName,
      extraData,
    }
  }

  /**
   * Parse audio sample description
   * Similar to FFmpeg's mov_read_stsd for audio
   */
  private parseAudioSampleDescription(
    reader: ByteReader,
    codecType: string,
    entrySize: number,
  ): AudioSampleDescription {
    // Audio sample description structure
    const _version = reader.readUint16()
    const _revisionLevel = reader.readUint16()
    const _vendor = reader.readUint32()
    const channels = reader.readUint16()
    const bitDepth = reader.readUint16()
    const _compressionId = reader.readInt16()
    const _packetSize = reader.readUint16()
    const sampleRate = reader.readFixed16()

    // Read extension boxes if present
    let extraData: Uint8Array | undefined
    const remainingBytes = entrySize - (reader.position - 8) // 8 bytes for size + codec

    if (remainingBytes > 0) {
      extraData = reader.readBytes(remainingBytes)
    }

    this.log(
      `Audio: ${codecType}, ${sampleRate}Hz, ${channels}ch, ${bitDepth}bit`,
    )

    return {
      codecType,
      sampleRate,
      channels,
      bitDepth,
      extraData,
    }
  }

  /**
   * Calculate frame rate from sample table
   * Based on time-to-sample (stts) entries
   */
  private calculateFrameRate(
    stblBox: MOVBox,
    timeScale: number,
  ): { frameRate: number; avgFrameRate: number } | null {
    if (!stblBox.children) {
      return null
    }

    // Find time-to-sample box (stts)
    const sttsBox = BoxParser.findBox(stblBox.children, 'stts')
    if (!sttsBox || !sttsBox.data) {
      return null
    }

    const reader = new ByteReader(sttsBox.data)

    const _version = reader.readUint8()
    const _flags = reader.readUint24()
    const entryCount = reader.readUint32()

    if (entryCount === 0) {
      return null
    }

    let totalSamples = 0
    let totalDuration = 0
    let commonDelta = -1
    let isConstantFrameRate = true

    // Read time-to-sample entries
    for (let i = 0; i < entryCount; i++) {
      const sampleCount = reader.readUint32()
      const sampleDelta = reader.readUint32()

      totalSamples += sampleCount
      totalDuration += sampleCount * sampleDelta

      if (commonDelta === -1) {
        commonDelta = sampleDelta
      } else if (commonDelta !== sampleDelta) {
        isConstantFrameRate = false
      }
    }

    if (totalSamples === 0 || totalDuration === 0) {
      return null
    }

    // Calculate average frame rate
    const avgFrameRate = (totalSamples * timeScale) / totalDuration

    // Calculate constant frame rate if applicable
    let frameRate = avgFrameRate
    if (isConstantFrameRate && commonDelta > 0) {
      frameRate = timeScale / commonDelta
    }

    this.log(
      `Frame rate calculated: ${frameRate.toFixed(3)} fps (avg: ${avgFrameRate.toFixed(3)} fps, constant: ${isConstantFrameRate})`,
    )

    return {
      frameRate: Math.round(frameRate * 1000) / 1000, // Round to 3 decimal places
      avgFrameRate: Math.round(avgFrameRate * 1000) / 1000,
    }
  }
}
