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

// 使用 WebCodecs 转换视频
function convertVideoWithWebCodecs(
  videoUrl: string,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<ConversionResult> {
  return new Promise((resolve) => {
    const processVideo = async () => {
      try {
        onProgress?.({
          isConverting: true,
          progress: 0,
          message: '正在初始化 WebCodecs 转换器...',
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

        // 保持高帧率以确保流畅度和质量
        const frameRate = 30
        const totalFrames = Math.ceil(duration * frameRate)

        onProgress?.({
          isConverting: true,
          progress: 20,
          message: '正在检测编码器支持...',
        })

        // 高质量编码器配置，按兼容性优先排序
        const codecConfigs: Array<{
          name: string
          config: VideoEncoderConfig
        }> = [
          {
            name: 'H.264 Baseline',
            config: {
              codec: 'avc1.42E01E', // H.264 Baseline Profile - 最兼容
              width: videoWidth,
              height: videoHeight,
              bitrate: Math.min(videoWidth * videoHeight * 1.5, 15000000), // 提高到 1.5 倍率，最大 15Mbps
              framerate: frameRate,
              avc: { format: 'avc' as const },
            },
          },
          {
            name: 'H.264 Main Profile',
            config: {
              codec: 'avc1.4D4029', // H.264 Main Profile Level 4.1
              width: videoWidth,
              height: videoHeight,
              bitrate: Math.min(videoWidth * videoHeight * 1.8, 18000000), // 1.8 倍率，最大 18Mbps
              framerate: frameRate,
              avc: { format: 'avc' as const },
            },
          },
          {
            name: 'H.264 High Profile',
            config: {
              codec: 'avc1.64002A', // H.264 High Profile Level 4.2
              width: videoWidth,
              height: videoHeight,
              bitrate: Math.min(videoWidth * videoHeight * 2, 20000000), // 大幅提高到 2.0 倍率，最大 20Mbps
              framerate: frameRate,
              avc: { format: 'avc' as const },
            },
          },
          {
            name: 'VP8',
            config: {
              codec: 'vp8',
              width: videoWidth,
              height: videoHeight,
              bitrate: Math.min(videoWidth * videoHeight * 1, 20000000), // 提高到 1.0 倍率，最大 10Mbps
              framerate: frameRate,
            },
          },
          {
            name: 'VP9',
            config: {
              codec: 'vp09.00.10.08', // VP9 Profile 0
              width: videoWidth,
              height: videoHeight,
              bitrate: Math.min(videoWidth * videoHeight * 1.2, 12000000), // VP9 效率更高，1.2 倍率，最大 12Mbps
              framerate: frameRate,
            },
          },
        ]

        let selectedConfig: VideoEncoderConfig | null = null
        let selectedCodecName = ''

        // 测试编码器支持，同时检查 VideoEncoder 和 MediaRecorder 支持
        for (const { name, config } of codecConfigs) {
          try {
            // 首先检查 VideoEncoder 支持
            const support = await VideoEncoder.isConfigSupported(config)
            if (!support.supported) {
              console.warn(`WebCodecs: ${name} VideoEncoder not supported`)
              continue
            }

            // 然后检查对应的 MediaRecorder 支持
            let mimeType: string
            if (config.codec.startsWith('vp09')) {
              mimeType = 'video/webm; codecs="vp09.00.10.08"'
            } else if (config.codec.startsWith('vp8')) {
              mimeType = 'video/webm; codecs="vp8"'
            } else if (config.codec.includes('64002A')) {
              mimeType = 'video/mp4; codecs="avc1.64002A"' // High Profile
            } else if (config.codec.includes('4D4029')) {
              mimeType = 'video/mp4; codecs="avc1.4D4029"' // Main Profile
            } else {
              mimeType = 'video/mp4; codecs="avc1.42E01E"' // Baseline
            }

            // 检查 MediaRecorder 是否支持这个 MIME 类型
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              console.warn(
                `WebCodecs: ${name} MediaRecorder not supported (${mimeType})`,
              )
              continue
            }

            // 两者都支持，选择此编码器
            selectedConfig = config
            selectedCodecName = name
            console.info(`WebCodecs: Using ${name} encoder (${mimeType})`)
            break
          } catch (error) {
            console.warn(`WebCodecs: Failed to check ${name} support:`, error)
          }
        }

        if (!selectedConfig) {
          // 如果没有找到支持的编码器，列出所有尝试过的编码器
          const attemptedCodecs = codecConfigs.map(({ name, config }) => ({
            name,
            codec: config.codec,
          }))
          console.error(
            'No supported video encoder found. Attempted codecs:',
            attemptedCodecs,
          )

          // 尝试最基本的配置作为最后的回退
          try {
            const fallbackMimeType = 'video/webm'
            if (MediaRecorder.isTypeSupported(fallbackMimeType)) {
              console.info('Attempting fallback with basic webm format')
              selectedConfig = {
                codec: 'vp8', // 基础配置
                width: videoWidth,
                height: videoHeight,
                bitrate: Math.min(videoWidth * videoHeight * 0.8, 8000000),
                framerate: frameRate,
              }
              selectedCodecName = 'VP8 Fallback'
            }
          } catch (fallbackError) {
            console.error('Fallback codec also failed:', fallbackError)
          }

          if (!selectedConfig) {
            throw new Error(
              '没有找到任何支持的视频编码器，浏览器可能不支持视频转换',
            )
          }
        }

        onProgress?.({
          isConverting: true,
          progress: 30,
          message: `正在使用 ${selectedCodecName} 编码器...`,
        })

        // 使用 MediaRecorder 作为容器生成器
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        canvas.width = videoWidth
        canvas.height = videoHeight

        // 设置高质量绘制参数
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        // 添加比特率信息日志
        console.info('Selected encoder:', selectedCodecName)
        console.info('Bitrate:', selectedConfig.bitrate, 'bps')
        console.info(
          'Bitrate (Mbps):',
          ((selectedConfig.bitrate || 0) / 1000000).toFixed(2),
        )

        // 使用 canvas stream 和 MediaRecorder，高质量录制
        const stream = canvas.captureStream(frameRate)

        // 根据选择的编码器设置对应的 MIME 类型（已在上面验证过支持）
        let mimeType: string
        if (selectedConfig.codec.startsWith('vp09')) {
          mimeType = 'video/webm; codecs="vp09.00.10.08"'
        } else if (selectedConfig.codec.startsWith('vp8')) {
          mimeType =
            selectedCodecName === 'VP8 Fallback'
              ? 'video/webm'
              : 'video/webm; codecs="vp8"'
        } else if (selectedConfig.codec.includes('64002A')) {
          mimeType = 'video/mp4; codecs="avc1.64002A"' // High Profile
        } else if (selectedConfig.codec.includes('4D4029')) {
          mimeType = 'video/mp4; codecs="avc1.4D4029"' // Main Profile
        } else {
          mimeType = 'video/mp4; codecs="avc1.42E01E"' // Baseline
        }

        console.info('Using MediaRecorder with mimeType:', mimeType)

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: selectedConfig.bitrate, // 使用与编码器相同的比特率
        })

        const recordedChunks: Blob[] = []
        let frameCount = 0
        let isRecording = false

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunks.push(event.data)
          }
        }

        mediaRecorder.onstop = () => {
          onProgress?.({
            isConverting: true,
            progress: 90,
            message: '正在生成视频文件...',
          })

          const blob = new Blob(recordedChunks, {
            type: mediaRecorder.mimeType,
          })
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
        }

        mediaRecorder.onerror = (error) => {
          console.error('MediaRecorder error:', error)
          resolve({
            success: false,
            error: `录制器错误：${error}`,
          })
        }

        onProgress?.({
          isConverting: true,
          progress: 40,
          message: '正在转换视频帧...',
        })

        // 开始录制
        mediaRecorder.start()
        isRecording = true

        // 逐帧处理视频
        const processFrame = async (frameIndex: number) => {
          if (frameIndex >= totalFrames) {
            // 处理完成
            if (isRecording) {
              mediaRecorder.stop()
              isRecording = false
            }
            return
          }

          const timestamp = frameIndex / frameRate

          if (timestamp >= duration) {
            if (isRecording) {
              mediaRecorder.stop()
              isRecording = false
            }
            return
          }

          video.currentTime = timestamp

          // 等待视频定位到正确时间，增加精度
          await new Promise<void>((frameResolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked)
              frameResolve()
            }
            video.addEventListener('seeked', onSeeked)

            // 添加超时保护，缩短等待时间以提高精度
            setTimeout(() => {
              video.removeEventListener('seeked', onSeeked)
              frameResolve()
            }, 50) // 减少等待时间从 100ms 到 50ms
          })

          // 确保视频已准备好再绘制
          await new Promise((resolve) => requestAnimationFrame(resolve))

          // 绘制当前帧到 canvas，使用高质量设置
          ctx.drawImage(video, 0, 0, videoWidth, videoHeight)
          frameCount++

          // 更新进度
          const progress = 40 + (frameCount / totalFrames) * 45
          onProgress?.({
            isConverting: true,
            progress: Math.min(progress, 85),
            message: `正在转换视频帧... ${frameCount}/${totalFrames}`,
          })

          // 处理下一帧，减少延迟以确保精确时间控制
          setTimeout(
            () => processFrame(frameIndex + 1),
            Math.max(1000 / frameRate / 2, 16),
          ) // 最小 16ms 间隔
        }

        // 开始处理第一帧
        await processFrame(0)
      } catch (error) {
        console.error('WebCodecs conversion failed:', error)
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'WebCodecs 转换失败',
        })
      }
    }

    processVideo()
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
    onProgress?.({
      isConverting: true,
      progress: 0,
      message: '使用高质量 WebCodecs 转换器...',
    })

    const result = await convertVideoWithWebCodecs(videoUrl, onProgress)

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
