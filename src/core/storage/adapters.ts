import type { _Object } from '@aws-sdk/client-s3'

import type { Logger } from '../logger/index.js'
import type { StorageObject } from './interfaces.js'
import { defaultStorageManager } from './manager.js'

// 将 StorageObject 转换为 _Object 以保持兼容性
function convertStorageObjectToS3Object(storageObject: StorageObject): _Object {
  return {
    Key: storageObject.key,
    Size: storageObject.size,
    LastModified: storageObject.lastModified,
    ETag: storageObject.etag,
  }
}

/**
 * 从 S3 获取图片（兼容性函数）
 * @deprecated 推荐使用 defaultStorageManager.getFile()
 */
export async function getImageFromS3(
  key: string,
  s3Logger?: Logger['s3'],
): Promise<Buffer | null> {
  return defaultStorageManager.getFile(key, s3Logger)
}

/**
 * 列出 S3 中的所有图片文件（兼容性函数）
 * @deprecated 推荐使用 defaultStorageManager.listImages()
 */
export async function listImagesFromS3(): Promise<_Object[]> {
  const storageObjects = await defaultStorageManager.listImages()
  return storageObjects.map((obj) => convertStorageObjectToS3Object(obj))
}

/**
 * 列出 S3 中的所有文件（兼容性函数）
 * @deprecated 推荐使用 defaultStorageManager.listAllFiles()
 */
export async function listAllFilesFromS3(): Promise<_Object[]> {
  const storageObjects = await defaultStorageManager.listAllFiles()
  return storageObjects.map((obj) => convertStorageObjectToS3Object(obj))
}

/**
 * 检测 live photo 配对（兼容性函数）
 * @deprecated 推荐使用 defaultStorageManager.detectLivePhotos()
 */
export function detectLivePhotos(allObjects: _Object[]): Map<string, _Object> {
  // 转换 _Object 数组为 StorageObject 数组
  const storageObjects: StorageObject[] = allObjects.map((obj) => ({
    key: obj.Key || '',
    size: obj.Size,
    lastModified: obj.LastModified,
    etag: obj.ETag,
  }))

  // 使用存储管理器检测 Live Photos
  const livePhotoMap = defaultStorageManager
    .getProvider()
    .detectLivePhotos(storageObjects)

  // 转换回 _Object 格式
  const result = new Map<string, _Object>()
  for (const [key, storageObject] of livePhotoMap) {
    result.set(key, convertStorageObjectToS3Object(storageObject))
  }

  return result
}

/**
 * 生成 S3 公共 URL（兼容性函数）
 * @deprecated 推荐使用 defaultStorageManager.generatePublicUrl()
 */
export function generateS3Url(key: string): string {
  return defaultStorageManager.generatePublicUrl(key)
}
