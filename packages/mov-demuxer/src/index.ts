/**
 * MOV/MP4 Demuxer Package
 * WebCodecs-compatible demuxer inspired by FFmpeg
 */

export { BoxParser } from './box-parser.js'
export { ByteReader, createByteReader } from './byte-reader.js'
export {
  AUDIO_CODECS,
  BOX_TYPES,
  BRANDS,
  HANDLER_TYPES,
  MOVUtils,
  VIDEO_CODECS,
} from './constants.js'
export { MOVDemuxer } from './demuxer.js'
export { SampleTableParser } from './sample-table.js'
export { StreamParser } from './stream-parser.js'
export type {
  AudioDecoderConfig,
  EncodedFrame,
  MOVAtom,
  MOVBox,
  MOVContext,
  MOVDemuxerOptions,
  MOVSample,
  MOVSampleTable,
  MOVStreamContext,
  VideoDecoderConfig,
  WebCodecsConfig,
} from './types.js'
export { WebCodecsIntegration } from './webcodecs.js'

// Re-export for convenience
export { MOVDemuxer as default } from './demuxer.js'
