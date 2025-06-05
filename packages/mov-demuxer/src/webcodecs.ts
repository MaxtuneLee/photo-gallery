/**
 * WebCodecs integration for MOV demuxer
 * Handles decoder configuration and frame processing
 */

import type {
  EncodedFrame,
  MOVStreamContext,
  WebCodecsConfig,
} from './types.js'

export class WebCodecsIntegration {
  private debug: boolean
  private videoDecoder?: VideoDecoder
  private audioDecoder?: AudioDecoder

  constructor(debug = false) {
    this.debug = debug
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.info(`[WebCodecs] ${message}`, ...args)
    }
  }

  /**
   * Check if WebCodecs is supported
   */
  static isSupported(): boolean {
    return (
      typeof VideoDecoder !== 'undefined' && typeof AudioDecoder !== 'undefined'
    )
  }

  /**
   * Create WebCodecs configuration from stream contexts
   */
  createConfig(streams: MOVStreamContext[]): WebCodecsConfig {
    const config: WebCodecsConfig = {}

    for (const stream of streams) {
      if (stream.type === 'video') {
        config.video = this.createVideoDecoderConfig(stream)
      } else if (stream.type === 'audio') {
        config.audio = this.createAudioDecoderConfig(stream)
      }
    }

    return config
  }

  /**
   * Create video decoder configuration
   */
  private createVideoDecoderConfig(
    stream: MOVStreamContext,
  ): VideoDecoderConfig {
    const codec = this.mapVideoCodec(stream.codecType)

    const config: VideoDecoderConfig = {
      codec,
      optimizeForLatency: true,
    }

    if (stream.width && stream.height) {
      config.codedWidth = stream.width
      config.codedHeight = stream.height
    }

    if (stream.extraData) {
      config.description = stream.extraData
    }

    this.log(`Video decoder config:`, config)
    return config
  }

  /**
   * Create audio decoder configuration
   */
  private createAudioDecoderConfig(
    stream: MOVStreamContext,
  ): AudioDecoderConfig {
    const codec = this.mapAudioCodec(stream.codecType)

    const config: AudioDecoderConfig = {
      codec,
      numberOfChannels: stream.channels || 2,
      sampleRate: stream.sampleRate || 44100,
    }

    if (stream.extraData) {
      config.description = stream.extraData
    }

    this.log(`Audio decoder config:`, config)
    return config
  }

  /**
   * Map MOV codec fourcc to WebCodecs codec string
   */
  private mapVideoCodec(fourcc: string): string {
    const codecMap: Record<string, string> = {
      // H.264/AVC
      avc1: 'avc1',
      avc3: 'avc1',
      h264: 'avc1',

      // H.265/HEVC
      hev1: 'hev1',
      hvc1: 'hvc1',
      hevc: 'hev1',

      // VP8
      vp08: 'vp8',
      vp80: 'vp8',

      // VP9
      vp09: 'vp9',
      vp90: 'vp9',

      // AV1
      av01: 'av01',

      // MPEG-4 Visual
      mp4v: 'mp4v.20.9',

      // Motion JPEG
      mjpa: 'mjpeg',
      mjpb: 'mjpeg',
      mjpg: 'mjpeg',

      // Apple ProRes (if supported)
      apch: 'prores',
      apcn: 'prores',
      apcs: 'prores',
      apco: 'prores',
      ap4h: 'prores',
    }

    const codec = codecMap[fourcc.toLowerCase()]
    if (!codec) {
      this.log(`Unknown video codec: ${fourcc}, using fallback`)
      return fourcc
    }

    return codec
  }

  /**
   * Map MOV codec fourcc to WebCodecs codec string
   */
  private mapAudioCodec(fourcc: string): string {
    const codecMap: Record<string, string> = {
      // AAC
      mp4a: 'mp4a.40.2',
      'aac ': 'mp4a.40.2',

      // Opus
      Opus: 'opus',
      opus: 'opus',

      // MP3
      'mp3 ': 'mp3',
      '.mp3': 'mp3',

      // FLAC
      fLaC: 'flac',
      flac: 'flac',

      // Vorbis
      vorb: 'vorbis',

      // PCM variants
      lpcm: 'pcm-s16',
      sowt: 'pcm-s16',
      twos: 'pcm-s16',
      in24: 'pcm-s24',
      in32: 'pcm-s32',
      fl32: 'pcm-f32',
      fl64: 'pcm-f64',
    }

    const codec = codecMap[fourcc]
    if (!codec) {
      this.log(`Unknown audio codec: ${fourcc}, using fallback`)
      return fourcc
    }

    return codec
  }

  /**
   * Initialize video decoder
   */
  async initVideoDecoder(
    config: VideoDecoderConfig,
    onFrame: (frame: VideoFrame) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    if (!WebCodecsIntegration.isSupported()) {
      throw new Error('WebCodecs not supported')
    }

    try {
      this.videoDecoder = new VideoDecoder({
        output: onFrame,
        error: onError,
      })

      await this.videoDecoder.configure(config)
      this.log('Video decoder initialized')
    } catch (error) {
      throw new Error(`Failed to initialize video decoder: ${error}`)
    }
  }

  /**
   * Initialize audio decoder
   */
  async initAudioDecoder(
    config: AudioDecoderConfig,
    onFrame: (frame: AudioData) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    if (!WebCodecsIntegration.isSupported()) {
      throw new Error('WebCodecs not supported')
    }

    try {
      this.audioDecoder = new AudioDecoder({
        output: onFrame,
        error: onError,
      })

      await this.audioDecoder.configure(config)
      this.log('Audio decoder initialized')
    } catch (error) {
      throw new Error(`Failed to initialize audio decoder: ${error}`)
    }
  }

  /**
   * Decode a frame
   */
  async decodeFrame(frame: EncodedFrame): Promise<void> {
    if (frame.type === 'video' && this.videoDecoder) {
      await this.decodeVideoFrame(frame)
    } else if (frame.type === 'audio' && this.audioDecoder) {
      await this.decodeAudioFrame(frame)
    }
  }

  /**
   * Decode video frame
   */
  private async decodeVideoFrame(frame: EncodedFrame): Promise<void> {
    if (!this.videoDecoder) {
      throw new Error('Video decoder not initialized')
    }

    const chunk = new EncodedVideoChunk({
      type: frame.isKeyframe ? 'key' : 'delta',
      timestamp: frame.timestamp,
      duration: frame.duration,
      data: frame.data,
    })

    try {
      this.videoDecoder.decode(chunk)
    } catch (error) {
      this.log(`Video decode error:`, error)
      throw error
    }
  }

  /**
   * Decode audio frame
   */
  private async decodeAudioFrame(frame: EncodedFrame): Promise<void> {
    if (!this.audioDecoder) {
      throw new Error('Audio decoder not initialized')
    }

    const chunk = new EncodedAudioChunk({
      type: frame.isKeyframe ? 'key' : 'delta',
      timestamp: frame.timestamp,
      duration: frame.duration,
      data: frame.data,
    })

    try {
      this.audioDecoder.decode(chunk)
    } catch (error) {
      this.log(`Audio decode error:`, error)
      throw error
    }
  }

  /**
   * Flush decoders
   */
  async flush(): Promise<void> {
    const promises: Promise<void>[] = []

    if (this.videoDecoder) {
      promises.push(this.videoDecoder.flush())
    }

    if (this.audioDecoder) {
      promises.push(this.audioDecoder.flush())
    }

    await Promise.all(promises)
    this.log('Decoders flushed')
  }

  /**
   * Close decoders
   */
  close(): void {
    if (this.videoDecoder) {
      this.videoDecoder.close()
      this.videoDecoder = undefined
    }

    if (this.audioDecoder) {
      this.audioDecoder.close()
      this.audioDecoder = undefined
    }

    this.log('Decoders closed')
  }

  /**
   * Get decoder states
   */
  getStates(): { video?: string; audio?: string } {
    return {
      video: this.videoDecoder?.state,
      audio: this.audioDecoder?.state,
    }
  }
}
