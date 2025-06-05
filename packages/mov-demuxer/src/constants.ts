/**
 * MOV/MP4 constants and utilities
 * Based on ISO/IEC 14496-12 and FFmpeg constants
 */

// Box types
export const BOX_TYPES = {
  // File type
  FTYP: 'ftyp',

  // Movie
  MOOV: 'moov',
  MVHD: 'mvhd',

  // Track
  TRAK: 'trak',
  TKHD: 'tkhd',

  // Media
  MDIA: 'mdia',
  MDHD: 'mdhd',
  HDLR: 'hdlr',

  // Media info
  MINF: 'minf',
  VMHD: 'vmhd',
  SMHD: 'smhd',
  DINF: 'dinf',

  // Sample table
  STBL: 'stbl',
  STSD: 'stsd',
  STTS: 'stts',
  STSC: 'stsc',
  STSZ: 'stsz',
  STZ2: 'stz2',
  STCO: 'stco',
  CO64: 'co64',
  STSS: 'stss',

  // Media data
  MDAT: 'mdat',

  // Free space
  FREE: 'free',
  SKIP: 'skip',
  WIDE: 'wide',
} as const

// Handler types
export const HANDLER_TYPES = {
  VIDEO: 'vide',
  AUDIO: 'soun',
  HINT: 'hint',
  META: 'meta',
  TEXT: 'text',
} as const

// Video codec mappings
export const VIDEO_CODECS = {
  // H.264/AVC
  avc1: 'avc1.420029',
  avc3: 'avc1.420029',
  h264: 'avc1.420029',

  // H.265/HEVC
  hev1: 'hev1.1.6.L93.B0',
  hvc1: 'hvc1.1.6.L93.B0',
  hevc: 'hev1.1.6.L93.B0',

  // VP8
  vp08: 'vp8',
  vp80: 'vp8',

  // VP9
  vp09: 'vp9',
  vp90: 'vp9',

  // AV1
  av01: 'av01.0.01M.08',

  // MPEG-4 Visual
  mp4v: 'mp4v.20.9',
  xvid: 'mp4v.20.9',

  // Motion JPEG
  mjpa: 'mjpeg',
  mjpb: 'mjpeg',
  mjpg: 'mjpeg',
  jpeg: 'mjpeg',

  // Apple ProRes
  apch: 'prores',
  apcn: 'prores',
  apcs: 'prores',
  apco: 'prores',
  ap4h: 'prores',
  ap4x: 'prores',
} as const

// Audio codec mappings
export const AUDIO_CODECS = {
  // AAC
  mp4a: 'mp4a.40.2',
  'aac ': 'mp4a.40.2',

  // Opus
  Opus: 'opus',
  opus: 'opus',

  // MP3
  'mp3 ': 'mp3',
  '.mp3': 'mp3',
  mpeg: 'mp3',

  // FLAC
  fLaC: 'flac',
  flac: 'flac',

  // Vorbis
  vorb: 'vorbis',

  // PCM variants
  lpcm: 'pcm-s16',
  sowt: 'pcm-s16', // Little-endian signed 16-bit
  twos: 'pcm-s16', // Big-endian signed 16-bit
  in24: 'pcm-s24', // Signed 24-bit
  in32: 'pcm-s32', // Signed 32-bit
  fl32: 'pcm-f32', // 32-bit float
  fl64: 'pcm-f64', // 64-bit float
  'raw ': 'pcm-s16', // Raw PCM
  NONE: 'pcm-s16', // Uncompressed
} as const

// Brand mappings
export const BRANDS = {
  isom: 'ISO Base Media',
  mp41: 'MP4 v1',
  mp42: 'MP4 v2',
  avc1: 'MP4 Base w/ AVC',
  iso2: 'ISO Base Media 2',
  iso4: 'ISO Base Media 4',
  iso5: 'ISO Base Media 5',
  iso6: 'ISO Base Media 6',
  mmp4: 'Mobile MP4',
  mp71: 'MP4 w/ Advanced Video Coding',
  'qt  ': 'QuickTime Movie',
  'M4V ': 'iTunes Video',
  'M4A ': 'iTunes Audio',
  'M4P ': 'iTunes AES Protected Audio',
  'M4B ': 'iTunes AudioBook',
  'F4V ': 'Flash Video',
  'F4P ': 'Flash Protected Video',
  'F4A ': 'Flash Audio',
  'F4B ': 'Flash AudioBook',
} as const

// Utility functions
export class MOVUtils {
  /**
   * Convert FourCC to readable string
   */
  static fourCCToString(fourcc: string): string {
    return fourcc.replaceAll(/[^\x20-\x7E]/g, '?')
  }

  /**
   * Get codec name from fourcc
   */
  static getCodecName(fourcc: string, type: 'video' | 'audio'): string {
    const codecMap = type === 'video' ? VIDEO_CODECS : AUDIO_CODECS
    return codecMap[fourcc as keyof typeof codecMap] || fourcc
  }

  /**
   * Get brand description
   */
  static getBrandDescription(brand: string): string {
    return BRANDS[brand as keyof typeof BRANDS] || brand
  }

  /**
   * Check if codec is supported by WebCodecs
   */
  static async isCodecSupported(
    fourcc: string,
    type: 'video' | 'audio',
  ): Promise<boolean> {
    if (
      typeof VideoDecoder === 'undefined' ||
      typeof AudioDecoder === 'undefined'
    ) {
      return false
    }

    const codec = this.getCodecName(fourcc, type)

    try {
      if (type === 'video') {
        const support = await VideoDecoder.isConfigSupported({ codec })
        return support.supported ?? false
      } else {
        // AudioDecoder requires additional config parameters
        const config = {
          codec,
          numberOfChannels: 2,
          sampleRate: 44100,
        }
        const support = await AudioDecoder.isConfigSupported(config)
        return support.supported ?? false
      }
    } catch {
      return false
    }
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(microseconds: number): string {
    const seconds = microseconds / 1000000
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
    }
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
  }

  /**
   * Calculate bitrate from size and duration
   */
  static calculateBitrate(
    sizeBytes: number,
    durationMicroseconds: number,
  ): number {
    const durationSeconds = durationMicroseconds / 1000000
    return Math.round((sizeBytes * 8) / durationSeconds)
  }

  /**
   * Format bitrate for display
   */
  static formatBitrate(bitsPerSecond: number): string {
    if (bitsPerSecond >= 1000000) {
      return `${(bitsPerSecond / 1000000).toFixed(1)} Mbps`
    } else if (bitsPerSecond >= 1000) {
      return `${(bitsPerSecond / 1000).toFixed(0)} kbps`
    } else {
      return `${bitsPerSecond} bps`
    }
  }

  /**
   * Parse H.264 SPS to get profile/level info
   */
  static parseH264Profile(
    sps: Uint8Array,
  ): { profile: number; level: number; profileIdc: string } | null {
    if (sps.length < 4) return null

    try {
      const profileIdc = sps[1]
      const levelIdc = sps[3]

      // Determine profile based on profile_idc and constraint flags

      let profileName = 'Unknown'
      switch (profileIdc) {
        case 66: {
          profileName = 'Baseline'
          break
        }
        case 77: {
          profileName = 'Main'
          break
        }
        case 88: {
          profileName = 'Extended'
          break
        }
        case 100: {
          profileName = 'High'
          break
        }
        case 110: {
          profileName = 'High 10'
          break
        }
        case 122: {
          profileName = 'High 4:2:2'
          break
        }
        case 244: {
          {
            profileName = 'High 4:4:4'
            // No default
          }
          break
        }
      }

      const level = levelIdc / 10

      return {
        profile: profileIdc,
        level,
        profileIdc: profileName,
      }
    } catch {
      return null
    }
  }

  /**
   * Check if box type is a container
   */
  static isContainerBox(type: string): boolean {
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
      'iloc',
      'iinf',
      'iref',
      'ipro',
      'sinf',
      'fiin',
      'paen',
      'fire',
      'fpar',
      'fecr',
      'segr',
      'gitn',
      'tref',
      'iprp',
      'ipco',
    ])

    return containerTypes.has(type)
  }

  /**
   * Validate FourCC
   */
  static isValidFourCC(fourcc: string): boolean {
    if (fourcc.length !== 4) return false

    // Check if all characters are printable ASCII or null
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line unicorn/prefer-code-point
      const code = fourcc.charCodeAt(i)
      if (code !== 0 && (code < 32 || code > 126)) {
        return false
      }
    }

    return true
  }

  /**
   * Calculate sample aspect ratio
   */
  static calculateSampleAspectRatio(
    width: number,
    height: number,
    displayWidth?: number,
    displayHeight?: number,
  ): { num: number; den: number } {
    if (!displayWidth || !displayHeight) {
      return { num: 1, den: 1 }
    }

    const sarNum = displayWidth * height
    const sarDen = displayHeight * width

    // Simplify the fraction
    const gcd = this.gcd(sarNum, sarDen)

    return {
      num: sarNum / gcd,
      den: sarDen / gcd,
    }
  }

  /**
   * Greatest common divisor
   */
  private static gcd(a: number, b: number): number {
    while (b !== 0) {
      const temp = b
      b = a % b
      a = temp
    }
    return a
  }
}
