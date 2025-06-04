import { encode } from 'blurhash'
import sharp from 'sharp'

import type { Logger } from '../logger/index.js'

// 生成 blurhash（基于缩略图数据，保持长宽比）
export async function generateBlurhash(
  thumbnailBuffer: Buffer,
  originalWidth: number,
  originalHeight: number,
  blurhashLogger?: Logger['blurhash'],
): Promise<string | null> {
  const log = blurhashLogger

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

    log?.debug(
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

    log?.success(`生成成功：${blurhash}`)
    return blurhash
  } catch (error) {
    log?.error('生成失败：', error)
    return null
  }
}
