import { heicTo, isHeic } from 'heic-to'

import { isSafari } from './device-viewport'
import { LRUCache } from './lru-cache'

export interface HeicConversionOptions {
  quality?: number
  format?: 'image/jpeg' | 'image/png'
}

export interface ConversionResult {
  blob: Blob
  url: string
  originalSize: number
  convertedSize: number
  format: string
}

// HEIC conversion cache using generic LRU cache
const heicCache: LRUCache<string, ConversionResult> = new LRUCache<
  string,
  ConversionResult
>(
  5, // Smaller cache size for images as they might be larger
  (value, key, reason) => {
    try {
      URL.revokeObjectURL(value.url)
      console.info(`HEIC cache: Revoked blob URL - ${reason}`)
    } catch (error) {
      console.warn(`Failed to revoke HEIC blob URL (${reason}):`, error)
    }
  },
)

/**
 * 生成文件的缓存键
 */
function generateCacheKey(
  file: File | Blob,
  options: HeicConversionOptions,
): string {
  const { size } = file
  const { type } = file
  const quality = options.quality || 1
  const format = options.format || 'image/jpeg'
  // 使用文件大小、类型和转换选项生成唯一键
  return `${type}-${size}-${quality}-${format}`
}

/**
 * 检测文件是否为 HEIC/HEIF 格式
 */
export async function detectHeicFormat(file: File | Blob): Promise<boolean> {
  try {
    return await isHeic(file as File)
  } catch (error) {
    console.warn('Failed to detect HEIC format:', error)
    return false
  }
}

export const isBrowserSupportHeic = () => {
  const safariVersionMatch = navigator.userAgent.match(/version\/(\d+)/i)
  const versionString = safariVersionMatch?.[1]
  const version = versionString ? Number.parseInt(versionString, 10) : 0

  return isSafari && version >= 17
}

/**
 * 将 HEIC/HEIF 图片转换为 JPEG 或 PNG（支持缓存）
 */
export async function convertHeicImage(
  file: File | Blob,
  options: HeicConversionOptions = {},
): Promise<ConversionResult> {
  const { quality = 1, format = 'image/jpeg' } = options

  // 生成缓存键
  const cacheKey = generateCacheKey(file, options)

  // 检查缓存
  const cachedResult = heicCache.get(cacheKey)
  if (cachedResult) {
    console.info('Using cached HEIC conversion result')
    return cachedResult
  }

  try {
    // 检查是否为 HEIC 格式
    const isHeicFormat = await detectHeicFormat(file)
    if (!isHeicFormat) {
      throw new Error('File is not in HEIC/HEIF format')
    }

    // 转换图片
    const convertedBlob = await heicTo({
      blob: file,
      type: format,
      quality,
    })

    // 创建 URL
    const url = URL.createObjectURL(convertedBlob)

    const result: ConversionResult = {
      blob: convertedBlob,
      url,
      originalSize: file.size,
      convertedSize: convertedBlob.size,
      format,
    }

    // 缓存结果
    heicCache.set(cacheKey, result)
    console.info(
      `HEIC conversion completed and cached: ${(file.size / 1024).toFixed(1)}KB → ${(convertedBlob.size / 1024).toFixed(1)}KB`,
    )

    return result
  } catch (error) {
    console.error('HEIC conversion failed:', error)
    throw new Error(
      `Failed to convert HEIC image: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * 清理转换后的 URL
 */
export function revokeConvertedUrl(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn('Failed to revoke URL:', error)
  }
}

// HEIC 缓存管理函数
export function getHeicCacheSize(): number {
  return heicCache.size()
}

export function clearHeicCache(): void {
  heicCache.clear()
}

export function removeHeicCache(cacheKey: string): boolean {
  return heicCache.delete(cacheKey)
}

export function getHeicCacheStats(): {
  size: number
  maxSize: number
  keys: string[]
} {
  return heicCache.getStats()
}

/**
 * 根据文件和选项移除特定的 HEIC 缓存项
 */
export function removeHeicCacheByFile(
  file: File | Blob,
  options: HeicConversionOptions = {},
): boolean {
  const cacheKey = generateCacheKey(file, options)
  return heicCache.delete(cacheKey)
}
