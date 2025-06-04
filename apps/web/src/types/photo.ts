import type { Exif } from 'exif-reader'
import type getRecipe from 'fuji-recipes'

export interface PhotoManifest {
  id: string
  title: string
  description: string
  views: number
  tags: string[]
  originalUrl: string
  thumbnailUrl: string
  blurhash: string
  width: number
  height: number
  aspectRatio: number
  s3Key: string
  lastModified: string
  size: number
  exif: Exif & { FujiRecipe?: ReturnType<typeof getRecipe> }
  isLivePhoto?: boolean
  livePhotoVideoUrl?: string
  livePhotoVideoS3Key?: string
}
