import type { PhotoManifest } from '~/types/photo'

import PhotosManifest from './photos-manifest.json'

class PhotoLoader {
  private photos: PhotoManifest[] = []
  private photoMap: Record<string, PhotoManifest> = {}

  constructor() {
    this.getAllTags = this.getAllTags.bind(this)
    this.getPhotos = this.getPhotos.bind(this)
    this.getPhoto = this.getPhoto.bind(this)

    if (import.meta.env.DEV) {
      this.photos = PhotosManifest.map((photo, index) => ({
        ...photo,
        originalUrl: photo.originalUrl.replace(
          'https://s3-private.innei.in',
          'http://10.0.0.33:18888',
        ),
        // 为演示目的添加一些示例标签
        tags: this.generateSampleTags(index, photo.id),
      })) as unknown as PhotoManifest[]
    } else {
      this.photos = PhotosManifest as unknown as PhotoManifest[]
    }

    // 为没有标签的照片添加"未分类"标签
    this.photos = this.photos.map((photo) => ({
      ...photo,
      tags: photo.tags && photo.tags.length > 0 ? photo.tags : ['未分类'],
    }))

    this.photos.forEach((photo) => {
      this.photoMap[photo.id] = photo
    })
  }

  // 为演示目的生成示例标签
  private generateSampleTags(index: number, photoId: string): string[] {
    const tags: string[] = []

    // 根据索引和照片ID生成一些标签
    if (index % 5 === 0) tags.push('风景')
    if (index % 7 === 0) tags.push('人像')
    if (index % 3 === 0) tags.push('街拍')
    if (index % 11 === 0) tags.push('建筑')
    if (index % 4 === 0) tags.push('自然')
    if (index % 13 === 0) tags.push('夜景')
    if (index % 17 === 0) tags.push('微距')
    if (index % 19 === 0) tags.push('黑白')

    // 所有富士相机的照片都添加"富士"标签
    if (photoId.startsWith('DSCF')) tags.push('富士')

    // 随机添加室内/室外标签
    if (index % 2 === 0) {
      tags.push('室外')
    } else {
      tags.push('室内')
    }

    // 如果没有生成任何标签，返回"未分类"
    return tags.length > 0 ? [...new Set(tags)] : ['未分类']
  }

  getPhotos() {
    return this.photos
  }

  getPhoto(id: string) {
    return this.photoMap[id]
  }

  getAllTags() {
    const tagSet = new Set<string>()
    this.photos.forEach((photo) => {
      photo.tags.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }
}
export const photoLoader = new PhotoLoader()
