// 主要构建器
export {
  type BuilderOptions,
  defaultBuilder,
  PhotoGalleryBuilder,
} from './builder/index.js'

// 日志系统
export { type Logger, logger, type WorkerLogger } from './logger/index.js'

// 类型定义
export type {
  ImageMetadata,
  PhotoInfo,
  PhotoManifestItem,
  ProcessPhotoResult,
  ThumbnailResult,
} from './types/photo.js'

// S3 操作
export { s3Client } from './s3/client.js'
export {
  generateS3Url,
  getImageFromS3,
  listImagesFromS3,
} from './s3/operations.js'

// 图像处理
export { generateBlurhash } from './image/blurhash.js'
export { extractExifData } from './image/exif.js'
export {
  getImageMetadataWithSharp,
  preprocessImageBuffer,
} from './image/processor.js'
export {
  generateThumbnailAndBlurhash,
  thumbnailExists,
} from './image/thumbnail.js'

// 照片处理
export { extractPhotoInfo } from './photo/info-extractor.js'
export {
  type PhotoProcessorOptions,
  processPhoto,
  type WorkerLoggers,
} from './photo/processor.js'

// Manifest 管理
export {
  handleDeletedPhotos,
  loadExistingManifest,
  needsUpdate,
  saveManifest,
} from './manifest/manager.js'

// Worker 池
export {
  type TaskFunction,
  WorkerPool,
  type WorkerPoolOptions,
} from './worker/pool.js'
