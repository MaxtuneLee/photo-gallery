/**
 * MOV/MP4 Demuxer
 * Main demuxer class inspired by FFmpeg's mov.c
 */

import { BoxParser } from './box-parser.js'
import { ByteReader } from './byte-reader.js'
import { SampleTableParser } from './sample-table.js'
import { StreamParser } from './stream-parser.js'
import type {
  EncodedFrame,
  FileInfo,
  FTYPInfo,
  MOVBox,
  MOVContext,
  MOVDemuxerOptions,
  MOVSample,
} from './types.js'
import { WebCodecsIntegration } from './webcodecs.js'

export class MOVDemuxer {
  private buffer: ArrayBuffer
  private context: MOVContext
  private samples: MOVSample[] = []
  private currentSampleIndex = 0
  private options: MOVDemuxerOptions
  private debug: boolean
  private webcodecs?: WebCodecsIntegration

  constructor(buffer: ArrayBuffer, options: MOVDemuxerOptions = {}) {
    this.buffer = buffer
    this.options = {
      enableVideo: true,
      enableAudio: true,
      debug: false,
      ...options,
    }
    this.debug = this.options.debug || false
    this.context = {
      streams: [],
      sampleTables: new Map(),
      mdatOffset: 0,
      mdatSize: 0,
      timeScale: 1000,
      duration: 0,
    }
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.info(`[MOVDemuxer] ${message}`, ...args)
    }
  }

  /**
   * Initialize the demuxer
   * Similar to FFmpeg's mov_read_header
   */
  async init(): Promise<void> {
    this.log('Initializing MOV demuxer...')

    // Parse boxes
    const boxParser = new BoxParser(this.buffer, this.debug)
    const boxes = boxParser.parseBoxes()

    // Parse file type (ftyp)
    const ftypBox = BoxParser.findBox(boxes, 'ftyp')
    if (ftypBox) {
      const ftypInfo = this.parseFTYP(ftypBox)
      if (ftypInfo) {
        this.context.ftyp = ftypInfo
        this.log('File type:', this.context.ftyp)
      }
    }

    // Find movie box (moov)
    const moovBox = BoxParser.findBox(boxes, 'moov')
    if (!moovBox) {
      throw new Error('No moov box found')
    }

    // Parse movie header (mvhd)
    const mvhdBox = BoxParser.findBox(moovBox.children || [], 'mvhd')
    if (mvhdBox) {
      const movieHeader = this.parseMVHD(mvhdBox)
      if (!movieHeader) {
        throw new Error('Invalid mvhd box')
      }
      this.context.timeScale = movieHeader.timeScale
      this.context.duration = movieHeader.duration
      this.log('Movie header:', movieHeader)
    }

    // Parse tracks
    const trakBoxes = BoxParser.findAllBoxes(moovBox.children || [], 'trak')
    const streamParser = new StreamParser(this.debug)

    for (const [i, trakBox] of trakBoxes.entries()) {
      const stream = streamParser.parseTrack(trakBox, i)
      if (
        stream && // Filter streams based on options
        ((stream.type === 'video' && this.options.enableVideo) ||
          (stream.type === 'audio' && this.options.enableAudio))
      ) {
        this.context.streams.push(stream)

        // Parse sample table
        const mdiaBox = BoxParser.findBox(trakBox.children || [], 'mdia')
        const minfBox = BoxParser.findBox(mdiaBox?.children || [], 'minf')
        const stblBox = BoxParser.findBox(minfBox?.children || [], 'stbl')

        if (stblBox) {
          const sampleTableParser = new SampleTableParser(this.debug)
          const sampleTable = sampleTableParser.parseSampleTable(stblBox)
          if (sampleTable) {
            this.context.sampleTables.set(stream.id, sampleTable)

            // Build sample index
            const streamSamples = sampleTableParser.buildSampleIndex(
              sampleTable,
              stream.id,
              stream.timeScale,
            )
            this.samples.push(...streamSamples)
          }
        }
      }
    }

    // Find media data (mdat)
    const mdatBox = BoxParser.findBox(boxes, 'mdat')
    if (mdatBox) {
      this.context.mdatOffset = mdatBox.offset + 8 // Skip box header
      this.context.mdatSize = mdatBox.size - 8
      this.log(
        `Found mdat at offset ${this.context.mdatOffset}, size ${this.context.mdatSize}`,
      )
    }

    // Sort samples by timestamp for proper playback order
    this.samples.sort((a, b) => a.timestamp - b.timestamp)

    // Calculate bit rates for each stream
    this.calculateBitRates()

    this.log(
      `Initialization complete. Found ${this.context.streams.length} streams, ${this.samples.length} samples`,
    )
  }

  /**
   * Initialize WebCodecs integration
   */
  async initWebCodecs(
    onVideoFrame?: (frame: VideoFrame) => void,
    onAudioFrame?: (frame: AudioData) => void,
    onError?: (error: Error) => void,
  ): Promise<void> {
    if (!WebCodecsIntegration.isSupported()) {
      throw new Error('WebCodecs not supported in this environment')
    }

    this.webcodecs = new WebCodecsIntegration(this.debug)
    const config = this.webcodecs.createConfig(this.context.streams)

    const defaultError = (error: Error) => {
      this.log('WebCodecs error:', error)
      onError?.(error)
    }

    // Initialize video decoder
    if (config.video && onVideoFrame) {
      await this.webcodecs.initVideoDecoder(
        config.video,
        onVideoFrame,
        defaultError,
      )
    }

    // Initialize audio decoder
    if (config.audio && onAudioFrame) {
      await this.webcodecs.initAudioDecoder(
        config.audio,
        onAudioFrame,
        defaultError,
      )
    }

    this.log('WebCodecs initialized')
  }

  /**
   * Get next sample
   */
  getNextSample(): MOVSample | null {
    if (this.currentSampleIndex >= this.samples.length) {
      return null
    }

    return this.samples[this.currentSampleIndex++]
  }

  /**
   * Get sample data
   */
  getSampleData(sample: MOVSample): Uint8Array {
    const absoluteOffset = this.context.mdatOffset + sample.offset
    return new Uint8Array(this.buffer, absoluteOffset, sample.size)
  }

  /**
   * Read and decode next frame
   */
  async readFrame(): Promise<EncodedFrame | null> {
    const sample = this.getNextSample()
    if (!sample) {
      return null
    }

    const data = this.getSampleData(sample)
    const stream = this.context.streams.find((s) => s.id === sample.streamId)

    if (!stream) {
      this.log(`Stream ${sample.streamId} not found for sample`)
      return null
    }

    const frame: EncodedFrame = {
      data,
      timestamp: sample.timestamp,
      duration: sample.duration,
      isKeyframe: sample.isKeyframe,
      streamId: sample.streamId,
      type: stream.type,
    }

    // Decode with WebCodecs if available
    if (this.webcodecs) {
      try {
        await this.webcodecs.decodeFrame(frame)
      } catch (error) {
        this.log('Decode error:', error)
      }
    }

    return frame
  }

  /**
   * Seek to timestamp (microseconds)
   */
  seek(timestamp: number): void {
    // Find the nearest keyframe before the target timestamp
    let bestIndex = 0

    for (let i = 0; i < this.samples.length; i++) {
      const sample = this.samples[i]

      if (sample.timestamp > timestamp) {
        break
      }

      if (sample.isKeyframe) {
        bestIndex = i
      }
    }

    this.currentSampleIndex = bestIndex
    this.log(
      `Seeked to sample ${bestIndex}, timestamp ${this.samples[bestIndex]?.timestamp || 0}`,
    )
  }

  /**
   * Get file information
   */
  getInfo(): FileInfo {
    return {
      duration: this.context.duration,
      timeScale: this.context.timeScale,
      streams: this.context.streams,
      sampleCount: this.samples.length,
      ftyp: this.context.ftyp,
    }
  }

  /**
   * Get frame rate information for video streams
   */
  getFrameRateInfo(): Array<{
    streamId: number
    frameRate?: number
    avgFrameRate?: number
    isConstant: boolean
  }> {
    return this.context.streams
      .filter((stream) => stream.type === 'video')
      .map((stream) => ({
        streamId: stream.id,
        frameRate: stream.frameRate,
        avgFrameRate: stream.avgFrameRate,
        isConstant: stream.frameRate === stream.avgFrameRate,
      }))
  }

  /**
   * Parse File Type Box (ftyp)
   */
  private parseFTYP(ftypBox: MOVBox): FTYPInfo | null {
    if (!ftypBox.data) return null

    const reader = new ByteReader(ftypBox.data)
    const majorBrand = reader.readFourCC()
    const minorVersion = reader.readUint32()

    const compatibleBrands: string[] = []
    while (reader.remaining >= 4) {
      compatibleBrands.push(reader.readFourCC())
    }

    return { majorBrand, minorVersion, compatibleBrands }
  }

  /**
   * Parse Movie Header Box (mvhd)
   */
  private parseMVHD(
    mvhdBox: MOVBox,
  ): { timeScale: number; duration: number } | null {
    if (!mvhdBox.data) return null

    const reader = new ByteReader(mvhdBox.data)
    const version = reader.readUint8()
    const _flags = reader.readUint24()

    let timeScale: number
    let duration: number

    if (version === 1) {
      const _creationTime = reader.readUint64()
      const _modificationTime = reader.readUint64()
      timeScale = reader.readUint32()
      duration = Number(reader.readUint64())
    } else {
      const _creationTime = reader.readUint32()
      const _modificationTime = reader.readUint32()
      timeScale = reader.readUint32()
      duration = reader.readUint32()
    }

    const _rate = reader.readFixed32()
    const _volume = reader.readFixed16()

    return { timeScale, duration }
  }

  /**
   * Close the demuxer and clean up resources
   */
  close(): void {
    if (this.webcodecs) {
      this.webcodecs.close()
      this.webcodecs = undefined
    }

    this.samples = []
    this.currentSampleIndex = 0
    this.log('Demuxer closed')
  }

  /**
   * Reset to beginning
   */
  reset(): void {
    this.currentSampleIndex = 0
    this.log('Demuxer reset')
  }

  /**
   * Calculate bit rates for all streams
   */
  private calculateBitRates(): void {
    for (const stream of this.context.streams) {
      const streamSamples = this.samples.filter((s) => s.streamId === stream.id)

      if (streamSamples.length === 0) {
        continue
      }

      // Calculate total data size for this stream
      let totalDataSize = 0
      for (const sample of streamSamples) {
        totalDataSize += sample.size
      }

      // Calculate stream duration in seconds
      const durationInSeconds = stream.duration / stream.timeScale

      if (durationInSeconds > 0) {
        // Calculate average bit rate (bits per second)
        const avgBitRate = Math.round((totalDataSize * 8) / durationInSeconds)
        stream.avgBitRate = avgBitRate
        stream.bitRate = avgBitRate // For now, use average as primary bitrate

        this.log(
          `Stream ${stream.id} (${stream.type}): ${(avgBitRate / 1000).toFixed(1)} kbps`,
        )
      }
    }
  }

  /**
   * Get bit rate information for all streams
   */
  getBitRateInfo(): Array<{
    streamId: number
    type: 'video' | 'audio'
    bitRate?: number
    avgBitRate?: number
    bitRateKbps?: number
    avgBitRateKbps?: number
  }> {
    return this.context.streams.map((stream) => ({
      streamId: stream.id,
      type: stream.type,
      bitRate: stream.bitRate,
      avgBitRate: stream.avgBitRate,
      bitRateKbps: stream.bitRate
        ? Math.round(stream.bitRate / 1000)
        : undefined,
      avgBitRateKbps: stream.avgBitRate
        ? Math.round(stream.avgBitRate / 1000)
        : undefined,
    }))
  }
}
