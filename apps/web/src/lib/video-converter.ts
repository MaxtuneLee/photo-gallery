import { isSafari } from './device-viewport'
import { LRUCache } from './lru-cache'

interface ConversionProgress {
  isConverting: boolean
  progress: number
  message: string
}

interface ConversionResult {
  success: boolean
  videoUrl?: string
  error?: string
  convertedSize?: number
  method?: 'webcodecs'
}

// Global video cache instance using the generic LRU cache with custom cleanup
const videoCache: LRUCache<string, ConversionResult> = new LRUCache<
  string,
  ConversionResult
>(10, (value, key, reason) => {
  if (value.videoUrl) {
    try {
      URL.revokeObjectURL(value.videoUrl)
      console.info(`Video cache: Revoked blob URL - ${reason}`)
    } catch (error) {
      console.warn(`Failed to revoke video blob URL (${reason}):`, error)
    }
  }
})

// Export cache management functions
export function getVideoCacheSize(): number {
  return videoCache.size()
}

export function clearVideoCache(): void {
  videoCache.clear()
}

export function getCachedVideo(url: string): ConversionResult | undefined {
  return videoCache.get(url)
}

/**
 * Remove a specific video from cache and clean up its blob URL
 */
export function removeCachedVideo(url: string): boolean {
  return videoCache.delete(url)
}

/**
 * Get detailed cache statistics for debugging
 */
export function getVideoCacheStats(): {
  size: number
  maxSize: number
  keys: string[]
} {
  return videoCache.getStats()
}

// 检查 WebCodecs 支持
export function isWebCodecsSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoDecoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof EncodedVideoChunk !== 'undefined'
  )
}

// 检查浏览器是否支持视频转换（WebCodecs 或 FFmpeg）
export function isVideoConversionSupported(): boolean {
  return (
    isWebCodecsSupported() ||
    (typeof WebAssembly !== 'undefined' &&
      typeof Worker !== 'undefined' &&
      typeof SharedArrayBuffer !== 'undefined')
  )
}

// 使用简化的 MediaRecorder 方式转换视频
function convertVideoWithWebCodecs(
  videoUrl: string,
  onProgress?: (progress: ConversionProgress) => void,
  preferMp4 = true, // 新增参数：是否优先选择MP4格式
): Promise<ConversionResult> {
  return new Promise((resolve) => {
    const composeVideo = async () => {
      try {
        onProgress?.({
          isConverting: true,
          progress: 0,
          message: '正在初始化视频转换器...',
        })

        // 创建视频元素来读取源视频
        const video = document.createElement('video')
        video.crossOrigin = 'anonymous'
        video.muted = true
        video.playsInline = true

        onProgress?.({
          isConverting: true,
          progress: 10,
          message: '正在加载视频文件...',
        })

        // 等待视频加载
        await new Promise<void>((videoResolve, videoReject) => {
          video.onloadedmetadata = () => videoResolve()
          video.onerror = () => videoReject(new Error('Failed to load video'))
          video.src = videoUrl
        })

        const { videoWidth, videoHeight, duration } = video
        const selectedFrameRate = 30 // 固定使用30fps

        console.info(
          `Original video: ${videoWidth}x${videoHeight}, duration: ${duration}s`,
        )

        onProgress?.({
          isConverting: true,
          progress: 20,
          message: '正在提取视频帧...',
        })

        // 创建Canvas用于录制
        const canvas = document.createElement('canvas')
        canvas.width = videoWidth
        canvas.height = videoHeight
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          throw new Error('无法创建Canvas上下文')
        }

        // 提取帧 - 按固定帧率提取视频的每一帧
        const totalFrames = Math.floor(duration * selectedFrameRate)
        const frameInterval = 1 / selectedFrameRate // 每帧的时间间隔（秒）

        interface Frame {
          timestamp: number
          canvas: HTMLCanvasElement
        }

        const frames: Frame[] = []

        for (let i = 0; i < totalFrames; i++) {
          const timestamp = i * frameInterval

          // 确保不超过视频总时长
          if (timestamp >= duration) break

          video.currentTime = timestamp

          // 等待视频跳转到指定时间
          await new Promise<void>((frameResolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked)
              frameResolve()
            }

            const onTimeUpdate = () => {
              if (Math.abs(video.currentTime - timestamp) < 0.1) {
                video.removeEventListener('timeupdate', onTimeUpdate)
                frameResolve()
              }
            }

            video.addEventListener('seeked', onSeeked)
            video.addEventListener('timeupdate', onTimeUpdate)

            // 超时保护
            setTimeout(() => {
              video.removeEventListener('seeked', onSeeked)
              video.removeEventListener('timeupdate', onTimeUpdate)
              frameResolve()
            }, 1000)
          })

          // 绘制当前帧到Canvas
          ctx.drawImage(video, 0, 0, videoWidth, videoHeight)

          // 创建帧的Canvas副本
          const frameCanvas = document.createElement('canvas')
          frameCanvas.width = videoWidth
          frameCanvas.height = videoHeight
          const frameCtx = frameCanvas.getContext('2d')

          if (frameCtx) {
            frameCtx.drawImage(canvas, 0, 0)

            frames.push({
              timestamp: timestamp * 1000000, // 转换为微秒
              canvas: frameCanvas,
            })
          }

          // 更新提取进度
          const extractProgress = 20 + ((i + 1) / totalFrames) * 30
          onProgress?.({
            isConverting: true,
            progress: extractProgress,
            message: `正在提取视频帧... ${i + 1}/${totalFrames}`,
          })
        }

        if (frames.length === 0) {
          throw new Error('没有可用的帧来合成视频')
        }

        onProgress?.({
          isConverting: true,
          progress: 50,
          message: '正在检测编码器支持...',
        })

        // 检查浏览器支持的MIME类型，优先选择用户偏好
        let mimeType = 'video/webm;codecs=vp9'
        let outputFormat = 'WebM'

        if (preferMp4) {
          // 尝试MP4格式
          const mp4Types = [
            'video/mp4;codecs=avc1.64002A', // H.264 High Profile
            'video/mp4;codecs=avc1.4D4029', // H.264 Main Profile
            'video/mp4;codecs=avc1.42E01E', // H.264 Baseline
            'video/mp4',
          ]

          for (const type of mp4Types) {
            if (MediaRecorder.isTypeSupported(type)) {
              mimeType = type
              outputFormat = 'MP4'
              break
            }
          }
        }

        // 如果MP4不支持或不偏好MP4，使用WebM
        if (outputFormat !== 'MP4') {
          const webmTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
          ]

          for (const type of webmTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
              mimeType = type
              outputFormat = 'WebM'
              break
            }
          }
        }

        console.info(`Using MediaRecorder with mimeType: ${mimeType}`)
        console.info(`Output format: ${outputFormat}`)

        onProgress?.({
          isConverting: true,
          progress: 60,
          message: `正在使用 ${outputFormat} 编码器合成视频...`,
        })

        // 设置MediaRecorder
        const stream = canvas.captureStream(selectedFrameRate)
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 5000000, // 5Mbps for good quality
        })

        const chunks: Blob[] = []

        return new Promise<void>((composeResolve, composeReject) => {
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data)
            }
          }

          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType })
            const url = URL.createObjectURL(blob)

            onProgress?.({
              isConverting: false,
              progress: 100,
              message: '转换完成',
            })

            resolve({
              success: true,
              videoUrl: url,
              convertedSize: blob.size,
              method: 'webcodecs',
            })
            composeResolve()
          }

          mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event)
            resolve({
              success: false,
              error: '录制过程中发生错误',
            })
            composeReject(new Error('录制过程中发生错误'))
          }

          // 开始录制
          mediaRecorder.start(100) // 每100ms收集一次数据

          let frameIndex = 0
          const frameDuration = 1000 / selectedFrameRate // 毫秒

          const renderFrame = () => {
            if (frameIndex >= frames.length) {
              // 录制完成
              mediaRecorder.stop()
              return
            }

            const frame = frames[frameIndex]

            // 绘制帧到Canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(frame.canvas, 0, 0)

            // 更新进度
            const progress = 60 + ((frameIndex + 1) / frames.length) * 30
            onProgress?.({
              isConverting: true,
              progress,
              message: `正在合成视频... ${frameIndex + 1}/${frames.length}`,
            })

            frameIndex++

            // 使用requestAnimationFrame和setTimeout来控制帧率
            if (frameIndex < frames.length) {
              setTimeout(() => {
                requestAnimationFrame(renderFrame)
              }, frameDuration)
            } else {
              // 最后一帧，停止录制
              setTimeout(() => {
                mediaRecorder.stop()
              }, frameDuration)
            }
          }

          // 开始渲染第一帧
          requestAnimationFrame(renderFrame)
        })
      } catch (error) {
        console.error('Video conversion failed:', error)
        resolve({
          success: false,
          error: error instanceof Error ? error.message : '视频转换失败',
        })
      }
    }

    composeVideo()
  })
}

// 检测浏览器是否原生支持 MOV 格式
function isBrowserSupportMov(): boolean {
  // 创建一个临时的 video 元素来测试格式支持
  const video = document.createElement('video')

  // 检测是否支持 MOV 容器格式
  const canPlayMov = video.canPlayType('video/quicktime')

  // Safari 通常原生支持 MOV
  if (isSafari) {
    return true
  }

  // 对于其他浏览器，只有当 canPlayType 明确返回支持时才认为支持
  // 'probably' 或 'maybe' 表示支持，空字符串表示不支持
  return canPlayMov === 'probably' || canPlayMov === 'maybe'
}

// 检测是否需要转换 mov 文件
export function needsVideoConversion(url: string): boolean {
  const lowerUrl = url.toLowerCase()
  const isMovFile = lowerUrl.includes('.mov') || lowerUrl.endsWith('.mov')

  // 如果不是 MOV 文件，不需要转换
  if (!isMovFile) {
    return false
  }

  // 如果浏览器原生支持 MOV，不需要转换
  if (isBrowserSupportMov()) {
    console.info('Browser natively supports MOV format, skipping conversion')
    return false
  }

  // 浏览器不支持 MOV，需要转换
  console.info('Browser does not support MOV format, conversion needed')
  return true
}

export async function convertMovToMp4(
  videoUrl: string,
  onProgress?: (progress: ConversionProgress) => void,
  forceReconvert = false, // 添加强制重新转换参数
  preferMp4 = true, // 新增参数：是否优先选择MP4格式
): Promise<ConversionResult> {
  // Check cache first, unless forced to reconvert
  if (!forceReconvert) {
    const cachedResult = videoCache.get(videoUrl)
    if (cachedResult) {
      console.info('Using cached video conversion result')
      onProgress?.({
        isConverting: false,
        progress: 100,
        message: '使用缓存结果',
      })
      return cachedResult
    }
  } else {
    console.info('Force reconversion: clearing cached result for', videoUrl)
    videoCache.delete(videoUrl)
  }

  // 优先尝试 WebCodecs
  if (isWebCodecsSupported()) {
    console.info('Using WebCodecs for HIGH QUALITY video conversion...')
    console.info(
      `🎯 Target format: ${preferMp4 ? 'MP4 (H.264)' : 'WebM (VP8/VP9)'}`,
    )
    onProgress?.({
      isConverting: true,
      progress: 0,
      message: '使用高质量 WebCodecs 转换器...',
    })

    const result = await convertVideoWithWebCodecs(
      videoUrl,
      onProgress,
      preferMp4,
    )

    // Cache the result if successful
    if (result.success) {
      videoCache.set(videoUrl, result)
      console.info('WebCodecs conversion completed successfully and cached')
    } else {
      console.warn(
        'WebCodecs conversion failed, falling back to FFmpeg:',
        result.error,
      )
    }

    return result
  }

  const fallbackResult = {
    success: false,
    error: '浏览器不支持 webcodecs，Live Photo 转换失败',
  }

  // Cache failed result to avoid repeated attempts
  videoCache.set(videoUrl, fallbackResult)

  return fallbackResult
}
