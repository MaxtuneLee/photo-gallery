import path from 'node:path'

import type { _Object } from '@aws-sdk/client-s3'
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

import { env } from '../../../env.js'
import type { Logger } from '../logger/index.js'
import { s3Client, SUPPORTED_FORMATS } from './client.js'

// 从 S3 获取图片
export async function getImageFromS3(
  key: string,
  s3Logger?: Logger['s3'],
): Promise<Buffer | null> {
  const log = s3Logger

  try {
    log?.info(`下载图片：${key}`)
    const startTime = Date.now()

    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    })

    const response = await s3Client.send(command)

    if (!response.Body) {
      log?.error(`S3 响应中没有 Body: ${key}`)
      return null
    }

    // 处理不同类型的 Body
    if (response.Body instanceof Buffer) {
      const duration = Date.now() - startTime
      const sizeKB = Math.round(response.Body.length / 1024)
      log?.success(`下载完成：${key} (${sizeKB}KB, ${duration}ms)`)
      return response.Body
    }

    // 如果是 Readable stream
    const chunks: Uint8Array[] = []
    const stream = response.Body as NodeJS.ReadableStream

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Uint8Array) => {
        chunks.push(chunk)
      })

      stream.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const duration = Date.now() - startTime
        const sizeKB = Math.round(buffer.length / 1024)
        log?.success(`下载完成：${key} (${sizeKB}KB, ${duration}ms)`)
        resolve(buffer)
      })

      stream.on('error', (error) => {
        log?.error(`下载失败：${key}`, error)
        reject(error)
      })
    })
  } catch (error) {
    log?.error(`下载失败：${key}`, error)
    return null
  }
}

// 列出 S3 中的所有图片文件
export async function listImagesFromS3(): Promise<_Object[]> {
  const listCommand = new ListObjectsV2Command({
    Bucket: env.S3_BUCKET_NAME,
    Prefix: env.S3_PREFIX,
    MaxKeys: 1000, // 最多获取 1000 张照片
  })

  const listResponse = await s3Client.send(listCommand)
  const objects = listResponse.Contents || []

  // 过滤出图片文件
  const imageObjects = objects.filter((obj: _Object) => {
    if (!obj.Key) return false
    const ext = path.extname(obj.Key).toLowerCase()
    return SUPPORTED_FORMATS.has(ext)
  })

  return imageObjects
}

// 列出 S3 中的所有文件（包括图片和视频）
export async function listAllFilesFromS3(): Promise<_Object[]> {
  const listCommand = new ListObjectsV2Command({
    Bucket: env.S3_BUCKET_NAME,
    Prefix: env.S3_PREFIX,
    MaxKeys: 1000,
  })

  const listResponse = await s3Client.send(listCommand)
  return listResponse.Contents || []
}

// 检测 live photo 配对
export function detectLivePhotos(allObjects: _Object[]): Map<string, _Object> {
  const livePhotoMap = new Map<string, _Object>() // image key -> video object

  // 按目录和基础文件名分组所有文件
  const fileGroups = new Map<string, _Object[]>()

  for (const obj of allObjects) {
    if (!obj.Key) continue

    const dir = path.dirname(obj.Key)
    const basename = path.basename(obj.Key, path.extname(obj.Key))
    const groupKey = `${dir}/${basename}`

    if (!fileGroups.has(groupKey)) {
      fileGroups.set(groupKey, [])
    }
    fileGroups.get(groupKey)!.push(obj)
  }

  // 在每个分组中寻找图片+视频配对
  for (const files of fileGroups.values()) {
    let imageFile: _Object | null = null
    let videoFile: _Object | null = null

    for (const file of files) {
      if (!file.Key) continue

      const ext = path.extname(file.Key).toLowerCase()

      // 检查是否为支持的图片格式
      if (SUPPORTED_FORMATS.has(ext)) {
        imageFile = file
      }
      // 检查是否为 .mov 视频文件
      else if (ext === '.mov') {
        videoFile = file
      }
    }

    // 如果找到配对，记录为 live photo
    if (imageFile && videoFile && imageFile.Key) {
      livePhotoMap.set(imageFile.Key, videoFile)
    }
  }

  return livePhotoMap
}

// 生成 S3 公共 URL
export function generateS3Url(key: string): string {
  const bucketName = env.S3_BUCKET_NAME

  // 如果设置了自定义域名，直接使用自定义域名
  if (env.S3_CUSTOM_DOMAIN) {
    const customDomain = env.S3_CUSTOM_DOMAIN.replace(/\/$/, '') // 移除末尾的斜杠
    return `${customDomain}/${key}`
  }

  // 如果使用自定义端点，构建相应的 URL
  const endpoint = env.S3_ENDPOINT

  // 检查是否是标准 AWS S3 端点
  if (endpoint.includes('amazonaws.com')) {
    return `https://${bucketName}.s3.${env.S3_REGION}.amazonaws.com/${key}`
  }

  // 对于自定义端点（如 MinIO 等）
  const baseUrl = endpoint.replace(/\/$/, '') // 移除末尾的斜杠
  return `${baseUrl}/${key}`
}
