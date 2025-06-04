import type { Exif } from 'exif-reader'

export interface PhotoInfo {
  title: string
  dateTaken: string
  views: number
  tags: string[]
  description: string
}

export interface ImageMetadata {
  width: number
  height: number
  format: string
}

export interface PhotoManifestItem {
  id: string
  title: string
  description: string
  dateTaken: string
  views: number
  tags: string[]
  originalUrl: string
  thumbnailUrl: string | null
  blurhash: string | null
  width: number
  height: number
  aspectRatio: number
  s3Key: string
  lastModified: string
  size: number
  exif: Exif | null
  isLivePhoto?: boolean
  livePhotoVideoUrl?: string
  livePhotoVideoS3Key?: string
}

export interface ProcessPhotoResult {
  item: PhotoManifestItem | null
  type: 'processed' | 'skipped' | 'new' | 'failed'
}

export interface ThumbnailResult {
  thumbnailUrl: string | null
  thumbnailBuffer: Buffer | null
  blurhash: string | null
}
