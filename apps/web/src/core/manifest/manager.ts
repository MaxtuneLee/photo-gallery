import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { _Object } from '@aws-sdk/client-s3'

import type { Logger } from '../logger/index.js'
import type { PhotoManifestItem } from '../types/photo.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 读取现有的 manifest
export async function loadExistingManifest(): Promise<PhotoManifestItem[]> {
  try {
    const manifestPath = path.join(
      __dirname,
      '../../../src/data/photos-manifest.json',
    )
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    return JSON.parse(manifestContent) as PhotoManifestItem[]
  } catch {
    return []
  }
}

// 检查照片是否需要更新（基于最后修改时间）
export function needsUpdate(
  existingItem: PhotoManifestItem | undefined,
  s3Object: _Object,
): boolean {
  if (!existingItem) return true
  if (!s3Object.LastModified) return true

  const existingModified = new Date(existingItem.lastModified)
  const s3Modified = s3Object.LastModified

  return s3Modified > existingModified
}

// 保存 manifest
export async function saveManifest(
  manifest: PhotoManifestItem[],
  fsLogger?: Logger['fs'],
): Promise<void> {
  const manifestPath = path.join(
    __dirname,
    '../../../src/data/photos-manifest.json',
  )

  // 按日期排序（最新的在前）
  const sortedManifest = [...manifest].sort(
    (a, b) => new Date(b.dateTaken).getTime() - new Date(a.dateTaken).getTime(),
  )

  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify(sortedManifest, null, 2))

  fsLogger?.info(`📁 Manifest 保存至：${manifestPath}`)
}

// 检测并处理已删除的图片
export async function handleDeletedPhotos(
  existingManifest: PhotoManifestItem[],
  s3ImageKeys: Set<string>,
  mainLogger?: Logger['main'],
  fsLogger?: Logger['fs'],
): Promise<number> {
  if (existingManifest.length === 0) {
    return 0
  }

  mainLogger?.info('🔍 检查已删除的图片...')
  let deletedCount = 0

  for (const existingItem of existingManifest) {
    // 如果现有 manifest 中的图片在 S3 中不存在了
    if (!s3ImageKeys.has(existingItem.s3Key)) {
      mainLogger?.info(`🗑️ 检测到已删除的图片：${existingItem.s3Key}`)
      deletedCount++

      // 删除对应的缩略图文件
      try {
        const thumbnailPath = path.join(
          __dirname,
          '../../../public/thumbnails',
          `${existingItem.id}.webp`,
        )
        await fs.unlink(thumbnailPath)
        fsLogger?.info(`🗑️ 已删除缩略图：${existingItem.id}.webp`)
      } catch (error) {
        // 缩略图可能已经不存在，忽略错误
        fsLogger?.warn(`删除缩略图失败：${existingItem.id}.webp`, error)
      }
    }
  }

  return deletedCount
}
