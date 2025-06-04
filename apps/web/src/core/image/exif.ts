import type { Exif } from 'exif-reader'
import exifReader from 'exif-reader'
import getRecipe from 'fuji-recipes'
import sharp from 'sharp'

import type { Logger } from '../logger/index.js'

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
export async function extractExifData(
  imageBuffer: Buffer,
  originalBuffer?: Buffer,
  exifLogger?: Logger['exif'],
): Promise<Exif | null> {
  const log = exifLogger

  try {
    log?.info('开始提取 EXIF 数据')

    // 首先尝试从处理后的图片中提取 EXIF
    let metadata = await sharp(imageBuffer).metadata()

    // 如果处理后的图片没有 EXIF 数据，且提供了原始 buffer，尝试从原始图片提取
    if (!metadata.exif && originalBuffer) {
      log?.info('处理后的图片缺少 EXIF 数据，尝试从原始图片提取')
      try {
        metadata = await sharp(originalBuffer).metadata()
      } catch (error) {
        log?.warn('从原始图片提取 EXIF 失败，可能是不支持的格式：', error)
      }
    }

    if (!metadata.exif) {
      log?.warn('未找到 EXIF 数据')
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
      log?.info('检测到富士胶片配方信息')
    }

    delete exifData.Photo?.MakerNote
    delete exifData.Photo?.UserComment
    delete exifData.Photo?.PrintImageMatching
    delete exifData.Image?.PrintImageMatching

    if (!exifData) {
      log?.warn('EXIF 数据解析失败')
      return null
    }

    // 清理 EXIF 数据中的空字符和无用数据
    const cleanedExifData = cleanExifData(exifData)

    log?.success('EXIF 数据提取完成')
    return cleanedExifData
  } catch (error) {
    log?.error('提取 EXIF 数据失败:', error)
    return null
  }
}
