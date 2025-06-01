import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { _Object, S3ClientConfig } from '@aws-sdk/client-s3'
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { encode } from 'blurhash'
import consola from 'consola'
import type { Exif } from 'exif-reader'
import exifReader from 'exif-reader'
import getRecipe from 'fuji-recipes'
import heicConvert from 'heic-convert'
import sharp from 'sharp'
import bmp from 'sharp-bmp'

import { env } from '../env.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 创建系统化的日志器
const logger = {
  // 主进程日志
  main: consola.withTag('MAIN'),
  // S3 操作日志
  s3: consola.withTag('S3'),
  // 图片处理日志
  image: consola.withTag('IMAGE'),
  // 缩略图处理日志
  thumbnail: consola.withTag('THUMBNAIL'),
  // Blurhash 处理日志
  blurhash: consola.withTag('BLURHASH'),
  // EXIF 处理日志
  exif: consola.withTag('EXIF'),
  // 文件系统操作日志
  fs: consola.withTag('FS'),
  // Worker 日志（动态创建）
  worker: (id: number) => consola.withTag(`WORKER-${id}`),
}

// 解析命令行参数
const args = process.argv.slice(2)
const isForceMode = args.includes('--force')
const isForceManifest = args.includes('--force-manifest')
const isForceThumbnails = args.includes('--force-thumbnails')

// 解析 --worker 参数
let concurrencyLimit = 10 // 默认并发数
const workerIndex = args.indexOf('--worker')
if (workerIndex !== -1 && workerIndex + 1 < args.length) {
  const workerValue = Number(args[workerIndex + 1])
  if (!Number.isNaN(workerValue) && workerValue > 0) {
    concurrencyLimit = workerValue
  } else {
    logger.main.warn(
      `无效的 --worker 参数值：${args[workerIndex + 1]}，使用默认值 ${concurrencyLimit}`,
    )
  }
}

// 确定运行模式
let runMode = '增量更新'
if (isForceMode) {
  runMode = '全量更新'
} else if (isForceManifest && isForceThumbnails) {
  runMode = '强制刷新 manifest 和缩略图'
} else if (isForceManifest) {
  runMode = '强制刷新 manifest'
} else if (isForceThumbnails) {
  runMode = '强制刷新缩略图'
}

logger.main.info(`🚀 运行模式：${runMode}`)
logger.main.info(`⚡ 并发数：${concurrencyLimit}`)

// 创建 S3 客户端
const s3ClientConfig: S3ClientConfig = {
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
}

// 如果提供了自定义端点，则使用它
if (env.S3_ENDPOINT) {
  s3ClientConfig.endpoint = env.S3_ENDPOINT
}

const s3Client = new S3Client(s3ClientConfig)

// 支持的图片格式
const SUPPORTED_FORMATS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tiff',
  '.heic',
  '.heif',
  '.hif',
])

// HEIC/HEIF 格式
const HEIC_FORMATS = new Set(['.heic', '.heif', '.hif'])

// BMP 格式
const BMP_FORMATS = new Set(['.bmp'])

// 定义类型
interface PhotoInfo {
  title: string
  dateTaken: string
  views: number
  tags: string[]
  description: string
}

interface ImageMetadata {
  width: number
  height: number
  format: string
}

interface PhotoManifestItem {
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
}

// 读取现有的 manifest
async function loadExistingManifest(): Promise<PhotoManifestItem[]> {
  try {
    const manifestPath = path.join(
      __dirname,
      '../src/data/photos-manifest.json',
    )
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    return JSON.parse(manifestContent) as PhotoManifestItem[]
  } catch {
    logger.main.info('未找到现有 manifest 文件，将创建新的')
    return []
  }
}

// 检查缩略图是否存在
async function thumbnailExists(photoId: string): Promise<boolean> {
  try {
    const thumbnailPath = path.join(
      __dirname,
      '../public/thumbnails',
      `${photoId}.webp`,
    )
    await fs.access(thumbnailPath)
    return true
  } catch {
    return false
  }
}

// 检查照片是否需要更新（基于最后修改时间）
function needsUpdate(
  existingItem: PhotoManifestItem | undefined,
  s3Object: _Object,
): boolean {
  if (!existingItem) return true
  if (!s3Object.LastModified) return true

  const existingModified = new Date(existingItem.lastModified)
  const s3Modified = s3Object.LastModified

  return s3Modified > existingModified
}

// 生成 blurhash（基于缩略图数据，保持长宽比）
async function generateBlurhash(
  thumbnailBuffer: Buffer,
  originalWidth: number,
  originalHeight: number,
  workerLogger?: typeof logger.blurhash,
): Promise<string | null> {
  const log = workerLogger || logger.blurhash

  try {
    // 计算原始图像的长宽比
    const aspectRatio = originalWidth / originalHeight

    // 根据长宽比计算合适的 blurhash 尺寸
    // 目标是在保持长宽比的同时，获得合适的细节级别
    let targetWidth: number
    let targetHeight: number

    // 基础尺寸，可以根据需要调整
    const baseSize = 64

    if (aspectRatio >= 1) {
      // 横向图片
      targetWidth = baseSize
      targetHeight = Math.round(baseSize / aspectRatio)
    } else {
      // 纵向图片
      targetHeight = baseSize
      targetWidth = Math.round(baseSize * aspectRatio)
    }

    // 确保最小尺寸，避免过小的尺寸
    targetWidth = Math.max(targetWidth, 16)
    targetHeight = Math.max(targetHeight, 16)

    // 计算 blurhash 的组件数量
    // 根据图像尺寸动态调整，但限制在合理范围内
    const xComponents = Math.min(Math.max(Math.round(targetWidth / 16), 3), 9)
    const yComponents = Math.min(Math.max(Math.round(targetHeight / 16), 3), 9)

    log.debug(
      `生成参数：原始 ${originalWidth}x${originalHeight}, 目标 ${targetWidth}x${targetHeight}, 组件 ${xComponents}x${yComponents}`,
    )

    // 复用缩略图的 Sharp 实例来生成 blurhash
    const { data, info } = await sharp(thumbnailBuffer)
      .rotate() // 自动根据 EXIF 旋转
      .resize(targetWidth, targetHeight, {
        fit: 'fill', // 填充整个目标尺寸，保持长宽比
        background: { r: 255, g: 255, b: 255, alpha: 0 }, // 透明背景
      })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true })

    // 生成 blurhash
    const blurhash = encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      xComponents,
      yComponents,
    )

    log.success(`生成成功：${blurhash}`)
    return blurhash
  } catch (error) {
    log.error('生成失败：', error)
    return null
  }
}

// 生成缩略图和 blurhash（复用 Sharp 实例）
async function generateThumbnailAndBlurhash(
  imageBuffer: Buffer,
  photoId: string,
  originalWidth: number,
  originalHeight: number,
  forceRegenerate = false,
  workerLogger?: {
    thumbnail: typeof logger.thumbnail
    blurhash: typeof logger.blurhash
  },
): Promise<{
  thumbnailUrl: string | null
  thumbnailBuffer: Buffer | null
  blurhash: string | null
}> {
  const thumbnailLog = workerLogger?.thumbnail || logger.thumbnail
  const blurhashLog = workerLogger?.blurhash || logger.blurhash

  try {
    const thumbnailDir = path.join(__dirname, '../public/thumbnails')
    await fs.mkdir(thumbnailDir, { recursive: true })

    const thumbnailPath = path.join(thumbnailDir, `${photoId}.webp`)
    const thumbnailUrl = `/thumbnails/${photoId}.webp`

    // 如果不是强制模式且缩略图已存在，读取现有文件
    if (!forceRegenerate && (await thumbnailExists(photoId))) {
      thumbnailLog.info(`复用现有缩略图：${photoId}`)
      try {
        const existingBuffer = await fs.readFile(thumbnailPath)

        // 基于现有缩略图生成 blurhash
        const blurhash = await generateBlurhash(
          existingBuffer,
          originalWidth,
          originalHeight,
          blurhashLog,
        )

        return {
          thumbnailUrl,
          thumbnailBuffer: existingBuffer,
          blurhash,
        }
      } catch (error) {
        thumbnailLog.warn(`读取现有缩略图失败，重新生成：${photoId}`, error)
        // 继续执行生成逻辑
      }
    }

    thumbnailLog.info(`生成缩略图：${photoId}`)
    const startTime = Date.now()

    // 创建 Sharp 实例，复用于缩略图和 blurhash 生成
    const sharpInstance = sharp(imageBuffer).rotate() // 自动根据 EXIF 旋转

    // 生成缩略图
    const thumbnailBuffer = await sharpInstance
      .clone() // 克隆实例用于缩略图生成
      .resize(600, 600, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: 100,
      })
      .toBuffer()

    // 保存到文件
    await fs.writeFile(thumbnailPath, thumbnailBuffer)

    const duration = Date.now() - startTime
    const sizeKB = Math.round(thumbnailBuffer.length / 1024)
    thumbnailLog.success(`生成完成：${photoId} (${sizeKB}KB, ${duration}ms)`)

    // 基于生成的缩略图生成 blurhash
    const blurhash = await generateBlurhash(
      thumbnailBuffer,
      originalWidth,
      originalHeight,
      blurhashLog,
    )

    return {
      thumbnailUrl,
      thumbnailBuffer,
      blurhash,
    }
  } catch (error) {
    thumbnailLog.error(`生成失败：${photoId}`, error)
    return {
      thumbnailUrl: null,
      thumbnailBuffer: null,
      blurhash: null,
    }
  }
}

// 获取图片元数据（复用 Sharp 实例）
async function getImageMetadataWithSharp(
  sharpInstance: sharp.Sharp,
  workerLogger?: typeof logger.image,
): Promise<ImageMetadata | null> {
  const log = workerLogger || logger.image

  try {
    const metadata = await sharpInstance.metadata()

    if (!metadata.width || !metadata.height || !metadata.format) {
      log.error('图片元数据不完整')
      return null
    }

    let { width } = metadata
    let { height } = metadata

    // 根据 EXIF Orientation 信息调整宽高
    const { orientation } = metadata
    if (
      orientation === 5 ||
      orientation === 6 ||
      orientation === 7 ||
      orientation === 8
    ) {
      // 对于需要旋转 90°的图片，需要交换宽高
      ;[width, height] = [height, width]
      log.info(
        `检测到需要旋转 90°的图片 (orientation: ${orientation})，交换宽高：${width}x${height}`,
      )
    }

    return {
      width,
      height,
      format: metadata.format,
    }
  } catch (error) {
    log.error('获取图片元数据失败：', error)
    return null
  }
}

// 转换 HEIC/HEIF 格式到 JPEG
async function convertHeicToJpeg(
  heicBuffer: Buffer,
  workerLogger?: typeof logger.image,
): Promise<Buffer> {
  const log = workerLogger || logger.image

  try {
    log.info(
      `开始 HEIC/HEIF → JPEG 转换 (${Math.round(heicBuffer.length / 1024)}KB)`,
    )
    const startTime = Date.now()

    const jpegBuffer = await heicConvert({
      buffer: heicBuffer,
      format: 'JPEG',
      quality: 0.95, // 高质量转换
    })

    const duration = Date.now() - startTime
    const outputSizeKB = Math.round(jpegBuffer.byteLength / 1024)
    log.success(`HEIC/HEIF 转换完成 (${outputSizeKB}KB, ${duration}ms)`)

    return Buffer.from(jpegBuffer)
  } catch (error) {
    log.error('HEIC/HEIF 转换失败：', error)
    throw error
  }
}

// 预处理图片 Buffer（处理 HEIC/HEIF 格式）
async function preprocessImageBuffer(
  buffer: Buffer,
  key: string,
  workerLogger?: typeof logger.image,
): Promise<Buffer> {
  const log = workerLogger || logger.image
  const ext = path.extname(key).toLowerCase()

  // 如果是 HEIC/HEIF 格式，先转换为 JPEG
  if (HEIC_FORMATS.has(ext)) {
    log.info(`检测到 HEIC/HEIF 格式：${key}`)
    return await convertHeicToJpeg(buffer, log)
  }

  // 如果是 BMP 格式，使用 sharp-bmp 处理
  if (BMP_FORMATS.has(ext)) {
    console.info(`检测到 BMP 格式，正在转换: ${key}`)
    const bmpBuffer = bmp.decode(buffer).data
    if (!bmpBuffer) {
      console.error(`BMP 转换失败: ${key}`)
      throw new Error(`无法处理 BMP 格式: ${key}`)
    }
    const meta = await sharp(bmpBuffer).metadata()
    console.info('meta:', meta)
    return bmpBuffer
  }

  // 其他格式直接返回原始 buffer
  return buffer
}

// 从 S3 获取图片
async function getImageFromS3(
  key: string,
  workerLogger?: typeof logger.s3,
): Promise<Buffer | null> {
  const log = workerLogger || logger.s3

  try {
    log.info(`下载图片：${key}`)
    const startTime = Date.now()

    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    })

    const response = await s3Client.send(command)

    if (!response.Body) {
      log.error(`S3 响应中没有 Body: ${key}`)
      return null
    }

    // 处理不同类型的 Body
    if (response.Body instanceof Buffer) {
      const duration = Date.now() - startTime
      const sizeKB = Math.round(response.Body.length / 1024)
      log.success(`下载完成：${key} (${sizeKB}KB, ${duration}ms)`)
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
        log.success(`下载完成：${key} (${sizeKB}KB, ${duration}ms)`)
        resolve(buffer)
      })

      stream.on('error', (error) => {
        log.error(`下载失败：${key}`, error)
        reject(error)
      })
    })
  } catch (error) {
    log.error(`下载失败：${key}`, error)
    return null
  }
}

// 清理 EXIF 数据中的空字符和无用信息
function cleanExifData(exifData: any): any {
  if (!exifData || typeof exifData !== 'object') {
    return exifData
  }

  if (Array.isArray(exifData)) {
    return exifData.map((item) => cleanExifData(item))
  }

  // 如果是 Date 对象，直接返回
  if (exifData instanceof Date) {
    return exifData
  }

  const cleaned: any = {}

  // 重要的日期字段，不应该被过度清理
  const importantDateFields = new Set([
    'DateTimeOriginal',
    'DateTime',
    'DateTimeDigitized',
    'CreateDate',
    'ModifyDate',
  ])

  for (const [key, value] of Object.entries(exifData)) {
    if (value === null || value === undefined) {
      continue
    }

    if (typeof value === 'string') {
      // 对于重要的日期字段，只移除空字符，不进行过度清理
      if (importantDateFields.has(key)) {
        const cleanedString = value.replaceAll('\0', '')
        if (cleanedString.length > 0) {
          cleaned[key] = cleanedString
        }
      } else {
        // 对于其他字符串字段，移除空字符并清理空白字符
        const cleanedString = value.replaceAll('\0', '').trim()
        if (cleanedString.length > 0) {
          cleaned[key] = cleanedString
        }
      }
    } else if (value instanceof Date) {
      // Date 对象直接保留
      cleaned[key] = value
    } else if (typeof value === 'object') {
      // 递归清理嵌套对象
      const cleanedNested = cleanExifData(value)
      if (cleanedNested && Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested
      }
    } else {
      // 其他类型直接保留
      cleaned[key] = value
    }
  }

  return cleaned
}

// 提取 EXIF 数据
async function extractExifData(
  imageBuffer: Buffer,
  originalBuffer?: Buffer,
  workerLogger?: typeof logger.exif,
): Promise<Exif | null> {
  const log = workerLogger || logger.exif

  try {
    log.info('开始提取 EXIF 数据')

    // 首先尝试从处理后的图片中提取 EXIF
    let metadata = await sharp(imageBuffer).metadata()

    // 如果处理后的图片没有 EXIF 数据，且提供了原始 buffer，尝试从原始图片提取
    if (!metadata.exif && originalBuffer) {
      log.info('处理后的图片缺少 EXIF 数据，尝试从原始图片提取')
      try {
        metadata = await sharp(originalBuffer).metadata()
      } catch (error) {
        log.warn('从原始图片提取 EXIF 失败，可能是不支持的格式：', error)
      }
    }

    if (!metadata.exif) {
      log.warn('未找到 EXIF 数据')
      return null
    }

    let startIndex = 0
    for (let i = 0; i < metadata.exif.length; i++) {
      if (
        metadata.exif.toString('ascii', i, i + 2) === 'II' ||
        metadata.exif.toString('ascii', i, i + 2) === 'MM'
      ) {
        startIndex = i
        break
      }
      if (metadata.exif.toString('ascii', i, i + 4) === 'Exif') {
        startIndex = i
        break
      }
    }
    const exifBuffer = metadata.exif.subarray(startIndex)

    // 使用 exif-reader 解析 EXIF 数据
    const exifData = exifReader(exifBuffer)

    if (exifData.Photo?.MakerNote) {
      const recipe = getRecipe(exifData.Photo.MakerNote)
      ;(exifData as any).FujiRecipe = recipe
      log.info('检测到富士胶片配方信息')
    }

    delete exifData.Photo?.MakerNote
    delete exifData.Photo?.UserComment
    delete exifData.Photo?.PrintImageMatching
    delete exifData.Image?.PrintImageMatching

    if (!exifData) {
      log.warn('EXIF 数据解析失败')
      return null
    }

    // 清理 EXIF 数据中的空字符和无用数据
    const cleanedExifData = cleanExifData(exifData)

    log.success('EXIF 数据提取完成')
    return cleanedExifData
  } catch (error) {
    log.error('提取 EXIF 数据失败:', error)
    return null
  }
}

// 从文件名提取照片信息
function extractPhotoInfo(
  key: string,
  exifData?: Exif | null,
  workerLogger?: typeof logger.image,
): PhotoInfo {
  const log = workerLogger || logger.image

  log.debug(`提取照片信息: ${key}`)

  const fileName = path.basename(key, path.extname(key))

  // 尝试从文件名解析信息，格式示例: "2024-01-15_城市夜景_1250views"
  let title = fileName
  let dateTaken = new Date().toISOString()
  let views = 0
  let tags: string[] = []

  // 从目录路径中提取 tags
  const dirPath = path.dirname(key)
  if (dirPath && dirPath !== '.' && dirPath !== '/') {
    // 移除前缀（如果有的话）
    let relativePath = dirPath
    if (env.S3_PREFIX && dirPath.startsWith(env.S3_PREFIX)) {
      relativePath = dirPath.slice(env.S3_PREFIX.length)
    }

    // 清理路径分隔符
    relativePath = relativePath.replaceAll(/^\/+|\/+$/g, '')

    if (relativePath) {
      // 分割路径并过滤空字符串
      const pathParts = relativePath
        .split('/')
        .filter((part) => part.trim() !== '')
      tags = pathParts.map((part) => part.trim())

      log.debug(`从路径提取标签：[${tags.join(', ')}]`)
    }
  }

  // 优先使用 EXIF 中的 DateTimeOriginal
  if (exifData?.Photo?.DateTimeOriginal) {
    try {
      const dateTimeOriginal = exifData.Photo.DateTimeOriginal as any

      // 如果是 Date 对象，直接使用
      if (dateTimeOriginal instanceof Date) {
        dateTaken = dateTimeOriginal.toISOString()
        log.debug('使用 EXIF Date 对象作为拍摄时间')
      } else if (typeof dateTimeOriginal === 'string') {
        // 如果是字符串，按原来的方式处理
        // EXIF 日期格式通常是 "YYYY:MM:DD HH:MM:SS"
        const formattedDateStr = dateTimeOriginal.replace(
          /^(\d{4}):(\d{2}):(\d{2})/,
          '$1-$2-$3',
        )
        dateTaken = new Date(formattedDateStr).toISOString()
        log.debug(`使用 EXIF 字符串作为拍摄时间：${dateTimeOriginal}`)
      } else {
        log.warn(
          `未知的 DateTimeOriginal 类型：${typeof dateTimeOriginal}`,
          dateTimeOriginal,
        )
      }
    } catch (error) {
      log.warn(
        `解析 EXIF DateTimeOriginal 失败：${exifData.Photo.DateTimeOriginal}`,
        error,
      )
    }
  } else {
    // 如果 EXIF 中没有日期，尝试从文件名解析
    const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/)
    if (dateMatch) {
      dateTaken = new Date(dateMatch[1]).toISOString()
      log.debug(`从文件名提取拍摄时间：${dateMatch[1]}`)
    }
  }

  // 如果文件名包含浏览次数
  const viewsMatch = fileName.match(/(\d+)views?/i)
  if (viewsMatch) {
    views = Number.parseInt(viewsMatch[1])
    log.debug(`从文件名提取浏览次数：${views}`)
  }

  // 从文件名中提取标题（移除日期和浏览次数）
  title = fileName
    .replaceAll(/\d{4}-\d{2}-\d{2}[_-]?/g, '')
    .replaceAll(/[_-]?\d+views?/gi, '')
    .replaceAll(/[_-]+/g, ' ')
    .trim()

  // 如果标题为空，使用文件名
  if (!title) {
    title = path.basename(key, path.extname(key))
  }

  log.debug(`照片信息提取完成："${title}"`)

  return {
    title,
    dateTaken,
    views,
    tags,
    description: '', // 可以从 EXIF 或其他元数据中获取
  }
}

// 生成 S3 公共 URL
function generateS3Url(key: string): string {
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
    return `https://${bucketName}.s3.${env.S3_REGION}.amazonaws.com/${bucketName}/${key}`
  }

  // 对于自定义端点（如 MinIO 等）
  const baseUrl = endpoint.replace(/\/$/, '') // 移除末尾的斜杠
  return `${baseUrl}/${key}`
}

// 主函数
async function buildManifest(): Promise<void> {
  const startTime = Date.now()

  try {
    logger.main.info('🚀 开始从 S3 获取照片列表...')
    logger.main.info(`🔗 使用端点：${env.S3_ENDPOINT || '默认 AWS S3'}`)
    logger.main.info(`🌐 自定义域名：${env.S3_CUSTOM_DOMAIN || '未设置'}`)
    logger.main.info(`🪣 存储桶：${env.S3_BUCKET_NAME}`)
    logger.main.info(`📂 前缀：${env.S3_PREFIX || '无前缀'}`)

    // 读取现有的 manifest（如果存在）
    const existingManifest =
      isForceMode || isForceManifest ? [] : await loadExistingManifest()
    const existingManifestMap = new Map(
      existingManifest.map((item) => [item.s3Key, item]),
    )

    logger.main.info(`现有 manifest 包含 ${existingManifest.length} 张照片`)

    // 列出 S3 中的所有图片文件
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

    logger.main.info(`S3 中找到 ${imageObjects.length} 张照片`)

    // 创建 S3 中存在的图片 key 集合，用于检测已删除的图片
    const s3ImageKeys = new Set(
      imageObjects.map((obj) => obj.Key).filter(Boolean),
    )

    const manifest: PhotoManifestItem[] = []
    let processedCount = 0
    let skippedCount = 0
    let newCount = 0
    let deletedCount = 0

    // 并发处理函数
    async function processPhoto(
      obj: _Object,
      index: number,
      workerId: number,
    ): Promise<{
      item: PhotoManifestItem | null
      type: 'processed' | 'skipped' | 'new' | 'failed'
    }> {
      const key = obj.Key
      if (!key) {
        logger.image.warn(`跳过没有 Key 的对象`)
        return { item: null, type: 'failed' }
      }

      const photoId = path.basename(key, path.extname(key))
      const existingItem = existingManifestMap.get(key)

      // 创建 worker 专用的 logger
      const workerLogger = {
        image: logger.worker(workerId).withTag('IMAGE'),
        s3: logger.worker(workerId).withTag('S3'),
        thumbnail: logger.worker(workerId).withTag('THUMBNAIL'),
        blurhash: logger.worker(workerId).withTag('BLURHASH'),
        exif: logger.worker(workerId).withTag('EXIF'),
      }

      workerLogger.image.info(`📸 [${index + 1}/${imageObjects.length}] ${key}`)

      // 检查是否需要更新
      if (
        !isForceMode &&
        !isForceManifest &&
        existingItem &&
        !needsUpdate(existingItem, obj)
      ) {
        // 检查缩略图是否存在，如果不存在或强制刷新缩略图则需要重新处理
        const hasThumbnail = await thumbnailExists(photoId)
        if (hasThumbnail && !isForceThumbnails) {
          workerLogger.image.info(`⏭️ 跳过处理 (未更新且缩略图存在): ${key}`)
          return { item: existingItem, type: 'skipped' }
        } else {
          if (isForceThumbnails) {
            workerLogger.image.info(`🔄 强制重新生成缩略图：${key}`)
          } else {
            workerLogger.image.info(
              `🔄 重新生成缩略图 (文件未更新但缩略图缺失): ${key}`,
            )
          }
        }
      }

      // 需要处理的照片（新照片、更新的照片或缺失缩略图的照片）
      const isNewPhoto = !existingItem
      if (isNewPhoto) {
        workerLogger.image.info(`🆕 新照片：${key}`)
      } else {
        workerLogger.image.info(`🔄 更新照片：${key}`)
      }

      try {
        // 获取图片数据
        const rawImageBuffer = await getImageFromS3(key, workerLogger.s3)
        if (!rawImageBuffer) return { item: null, type: 'failed' }

        // 预处理图片（处理 HEIC/HEIF 格式）
        let imageBuffer: Buffer
        try {
          imageBuffer = await preprocessImageBuffer(
            rawImageBuffer,
            key,
            workerLogger.image,
          )
        } catch (error) {
          workerLogger.image.error(`预处理图片失败：${key}`, error)
          return { item: null, type: 'failed' }
        }

        // 创建 Sharp 实例，复用于多个操作
        const sharpInstance = sharp(imageBuffer)

        // 获取图片元数据（复用 Sharp 实例）
        const metadata = await getImageMetadataWithSharp(
          sharpInstance,
          workerLogger.image,
        )
        if (!metadata) return { item: null, type: 'failed' }

        // 如果是增量更新且已有 blurhash，可以复用
        let thumbnailUrl: string | null = null
        let thumbnailBuffer: Buffer | null = null
        let blurhash: string | null = null

        if (
          !isForceMode &&
          !isForceThumbnails &&
          existingItem?.blurhash &&
          (await thumbnailExists(photoId))
        ) {
          // 复用现有的缩略图和 blurhash
          blurhash = existingItem.blurhash
          workerLogger.blurhash.info(`复用现有 blurhash: ${photoId}`)

          try {
            const thumbnailPath = path.join(
              __dirname,
              '../public/thumbnails',
              `${photoId}.webp`,
            )
            thumbnailBuffer = await fs.readFile(thumbnailPath)
            thumbnailUrl = `/thumbnails/${photoId}.webp`
            workerLogger.thumbnail.info(`复用现有缩略图：${photoId}`)
          } catch (error) {
            workerLogger.thumbnail.warn(
              `读取现有缩略图失败，重新生成：${photoId}`,
              error,
            )
            // 继续执行生成逻辑
          }
        }

        // 如果没有复用成功，则生成缩略图和 blurhash
        if (!thumbnailUrl || !thumbnailBuffer || !blurhash) {
          const result = await generateThumbnailAndBlurhash(
            imageBuffer,
            photoId,
            metadata.width,
            metadata.height,
            isForceMode || isForceThumbnails,
            {
              thumbnail: workerLogger.thumbnail,
              blurhash: workerLogger.blurhash,
            },
          )

          thumbnailUrl = result.thumbnailUrl
          thumbnailBuffer = result.thumbnailBuffer
          blurhash = result.blurhash
        }

        // 如果是增量更新且已有 EXIF 数据，可以复用
        let exifData: Exif | null = null
        if (!isForceMode && !isForceManifest && existingItem?.exif) {
          exifData = existingItem.exif
          workerLogger.exif.info(`复用现有 EXIF 数据：${photoId}`)
        } else {
          // 传入原始 buffer 以便在转换后的图片缺少 EXIF 时回退
          const ext = path.extname(key).toLowerCase()
          const originalBuffer = HEIC_FORMATS.has(ext)
            ? rawImageBuffer
            : undefined
          exifData = await extractExifData(
            imageBuffer,
            originalBuffer,
            workerLogger.exif,
          )
        }

        // 提取照片信息（在获取 EXIF 数据之后，以便使用 DateTimeOriginal）
        const photoInfo = extractPhotoInfo(key, exifData, workerLogger.image)

        const aspectRatio = metadata.width / metadata.height

        const photoItem: PhotoManifestItem = {
          id: photoId,
          title: photoInfo.title,
          description: photoInfo.description,
          dateTaken: photoInfo.dateTaken,
          views: photoInfo.views,
          tags: photoInfo.tags,
          originalUrl: generateS3Url(key),
          thumbnailUrl,
          blurhash,
          width: metadata.width,
          height: metadata.height,
          aspectRatio,
          s3Key: key,
          lastModified:
            obj.LastModified?.toISOString() || new Date().toISOString(),
          size: obj.Size || 0,
          exif: exifData,
        }

        workerLogger.image.success(`✅ 处理完成：${key}`)
        return { item: photoItem, type: isNewPhoto ? 'new' : 'processed' }
      } catch (error) {
        workerLogger.image.error(`❌ 处理失败：${key}`, error)
        return { item: null, type: 'failed' }
      }
    }

    const results: {
      item: PhotoManifestItem | null
      type: 'processed' | 'skipped' | 'new' | 'failed'
    }[] = Array.from({ length: imageObjects.length })

    logger.main.info(
      `开始并发处理照片，工作池模式，并发数：${concurrencyLimit}`,
    )

    // 创建任务队列
    let taskIndex = 0
    const totalTasks = imageObjects.length

    // Worker 函数
    async function worker(workerId: number): Promise<void> {
      const workerLogger = logger.worker(workerId)
      workerLogger.start(`Worker ${workerId} 启动`)

      let processedByWorker = 0

      while (taskIndex < totalTasks) {
        const currentIndex = taskIndex++
        if (currentIndex >= totalTasks) break

        const obj = imageObjects[currentIndex]
        workerLogger.info(
          `开始处理照片 ${currentIndex + 1}/${totalTasks}: ${obj.Key}`,
        )

        const startTime = Date.now()
        const result = await processPhoto(obj, currentIndex, workerId)
        const duration = Date.now() - startTime

        results[currentIndex] = result
        processedByWorker++

        const statusIcon =
          {
            processed: '✅',
            skipped: '⏭️',
            new: '🆕',
            failed: '❌',
          }[result.type] || '❓'

        workerLogger.info(
          `${statusIcon} 完成照片 ${currentIndex + 1}/${totalTasks}: ${obj.Key} (${result.type}) - ${duration}ms`,
        )
      }

      workerLogger.success(
        `Worker ${workerId} 完成，处理了 ${processedByWorker} 张照片`,
      )
    }

    // 启动工作池
    const workers = Array.from({ length: concurrencyLimit }, (_, i) =>
      worker(i + 1),
    )
    await Promise.all(workers)

    // 统计结果并添加到 manifest
    for (const result of results) {
      if (result.item) {
        manifest.push(result.item)

        switch (result.type) {
          case 'new': {
            newCount++
            processedCount++
            break
          }
          case 'processed': {
            processedCount++
            break
          }
          case 'skipped': {
            skippedCount++
            break
          }
        }
      }
    }

    // 检测并处理已删除的图片
    if (!isForceMode && !isForceManifest && existingManifest.length > 0) {
      logger.main.info('🔍 检查已删除的图片...')

      for (const existingItem of existingManifest) {
        // 如果现有 manifest 中的图片在 S3 中不存在了
        if (!s3ImageKeys.has(existingItem.s3Key)) {
          logger.main.info(`🗑️ 检测到已删除的图片：${existingItem.s3Key}`)
          deletedCount++

          // 删除对应的缩略图文件
          try {
            const thumbnailPath = path.join(
              __dirname,
              '../public/thumbnails',
              `${existingItem.id}.webp`,
            )
            await fs.unlink(thumbnailPath)
            logger.fs.info(`🗑️ 已删除缩略图：${existingItem.id}.webp`)
          } catch (error) {
            // 缩略图可能已经不存在，忽略错误
            logger.fs.warn(`删除缩略图失败：${existingItem.id}.webp`, error)
          }
        }
      }
    }

    // 按日期排序（最新的在前）
    manifest.sort(
      (a, b) =>
        new Date(b.dateTaken).getTime() - new Date(a.dateTaken).getTime(),
    )

    // 保存 manifest
    const manifestPath = path.join(
      __dirname,
      '../src/data/photos-manifest.json',
    )
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))

    // 计算总处理时间
    const totalDuration = Date.now() - startTime
    const durationSeconds = Math.round(totalDuration / 1000)
    const durationMinutes = Math.floor(durationSeconds / 60)
    const remainingSeconds = durationSeconds % 60

    logger.main.success(`🎉 Manifest 构建完成!`)
    logger.main.info(`📊 处理统计:`)
    logger.main.info(`   📸 总照片数：${manifest.length}`)
    logger.main.info(`   🆕 新增照片：${newCount}`)
    logger.main.info(`   🔄 处理照片：${processedCount}`)
    logger.main.info(`   ⏭️ 跳过照片：${skippedCount}`)
    logger.main.info(`   🗑️ 删除照片：${deletedCount}`)
    logger.main.info(
      `   ⏱️ 总耗时：${durationMinutes > 0 ? `${durationMinutes}分${remainingSeconds}秒` : `${durationSeconds}秒`}`,
    )
    logger.fs.info(`📁 Manifest 保存至：${manifestPath}`)
  } catch (error) {
    logger.main.error('❌ 构建 manifest 失败：', error)
    throw error
  }
}

buildManifest()
