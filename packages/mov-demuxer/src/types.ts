/**
 * MOV/MP4 demuxer types and interfaces
 * Inspired by FFmpeg's mov.c implementation
 */

export interface MOVBox {
  type: string
  size: number
  offset: number
  data?: Uint8Array
  children?: MOVBox[]
}

export interface MOVAtom {
  type: string
  size: number
  offset: number
}

export interface MOVStreamContext {
  id: number
  type: 'video' | 'audio'
  codecType: string
  codecPrivate?: Uint8Array
  timeScale: number
  duration: number
  width?: number
  height?: number
  frameRate?: number
  avgFrameRate?: number
  bitRate?: number
  avgBitRate?: number
  sampleRate?: number
  channels?: number
  bitDepth?: number
  extraData?: Uint8Array
}

export interface MOVSample {
  offset: number
  size: number
  timestamp: number
  duration: number
  isKeyframe: boolean
  streamId: number
}

export interface MOVSampleTable {
  sampleSizes: number[]
  chunkOffsets: number[]
  samplesPerChunk: Array<{
    firstChunk: number
    samplesPerChunk: number
    descriptionIndex: number
  }>
  timeToSample: Array<{ count: number; delta: number }>
  syncSamples?: number[]
}

export interface MOVContext {
  ftyp?: {
    majorBrand: string
    minorVersion: number
    compatibleBrands: string[]
  }
  streams: MOVStreamContext[]
  sampleTables: Map<number, MOVSampleTable>
  mdatOffset: number
  mdatSize: number
  timeScale: number
  duration: number
}

export interface MOVDemuxerOptions {
  enableVideo?: boolean
  enableAudio?: boolean
  debug?: boolean
}

export interface EncodedFrame {
  data: Uint8Array
  timestamp: number
  duration: number
  isKeyframe: boolean
  streamId: number
  type: 'video' | 'audio'
}

export interface WebCodecsConfig {
  video?: VideoDecoderConfig
  audio?: AudioDecoderConfig
}

// WebCodecs types (for environments where they might not be available)
export interface VideoDecoderConfig {
  codec: string
  codedWidth?: number
  codedHeight?: number
  displayAspectWidth?: number
  displayAspectHeight?: number
  colorSpace?: VideoColorSpaceInit
  hardwareAcceleration?: HardwareAcceleration
  optimizeForLatency?: boolean
  description?: AllowSharedBufferSource
}

export interface AudioDecoderConfig {
  codec: string
  sampleRate: number
  numberOfChannels: number
  description?: AllowSharedBufferSource
}

export type HardwareAcceleration =
  | 'no-preference'
  | 'prefer-hardware'
  | 'prefer-software'
export type AllowSharedBufferSource = ArrayBufferView | ArrayBuffer

export interface SampleDescription {
  codecType: string
  codecPrivate?: Uint8Array
  extraData?: Uint8Array
  width?: number
  height?: number
  sampleRate?: number
  channels?: number
  bitDepth?: number
  [key: string]: unknown
}

export interface VideoSampleDescription extends SampleDescription {
  width: number
  height: number
}

export interface AudioSampleDescription extends SampleDescription {
  sampleRate: number
  channels: number
  bitDepth?: number
}

export interface FTYPInfo {
  majorBrand: string
  minorVersion: number
  compatibleBrands: string[]
}

export interface FileInfo {
  duration: number
  timeScale: number
  streams: MOVStreamContext[]
  sampleCount: number
  ftyp?: FTYPInfo
}
