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

        // 对于 Live Photo，通常持续时间很短，使用较低的帧率
        const frameRate = duration <= 3 ? 15 : 30
        const totalFrames = Math.ceil(duration * frameRate)

        onProgress?.({
          isConverting: true,
          progress: 20,
          message: '正在检测编码器支持...',
        })

        // 简化编码器配置，优先使用更兼容的选项
        const codecConfigs: Array<{
          name: string
          config: VideoEncoderConfig
        }> = [
          {
            name: 'H.264 Baseline',
            config: {
              codec: 'avc1.42E01E', // H.264 Baseline Profile
              width: videoWidth,
              height: videoHeight,
              bitrate: Math.min(videoWidth * videoHeight * 0.2, 2000000),
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
              bitrate: Math.min(videoWidth * videoHeight * 0.15, 1500000),
              framerate: frameRate,
            },
          },
        ]

        let selectedConfig: VideoEncoderConfig | null = null
        let selectedCodecName = ''

        // 测试编码器支持
        for (const { name, config } of codecConfigs) {
          try {
            const support = await VideoEncoder.isConfigSupported(config)
            if (support.supported) {
              selectedConfig = config
              selectedCodecName = name
              console.info(`WebCodecs: Using ${name} encoder`)
              break
            }
          } catch (error) {
            console.warn(`WebCodecs: Failed to check ${name} support:`, error)
          }
        }

        if (!selectedConfig) {
          throw new Error('没有找到支持的视频编码器')
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

        // 使用 canvas stream 和 MediaRecorder
        const stream = canvas.captureStream(frameRate)
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: selectedConfig.codec.startsWith('vp')
            ? 'video/webm; codecs="vp8"'
            : 'video/mp4; codecs="avc1.42E01E"',
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

          // 等待视频定位到正确时间
          await new Promise<void>((frameResolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked)
              frameResolve()
            }
            video.addEventListener('seeked', onSeeked)

            // 添加超时保护
            setTimeout(() => {
              video.removeEventListener('seeked', onSeeked)
              frameResolve()
            }, 100)
          })

          // 绘制当前帧到 canvas
          ctx.drawImage(video, 0, 0, videoWidth, videoHeight)
          frameCount++

          // 更新进度
          const progress = 40 + (frameCount / totalFrames) * 45
          onProgress?.({
            isConverting: true,
            progress: Math.min(progress, 85),
            message: `正在转换视频帧... ${frameCount}/${totalFrames}`,
          })

          // 处理下一帧 (稍微延迟以确保帧被捕获)
          setTimeout(() => processFrame(frameIndex + 1), 1000 / frameRate)
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

  // 检测 User Agent 来识别 Safari
  const isSafari =
    /(?:^|[^a-z])safari(?:[^a-z]|$)/i.test(navigator.userAgent) &&
    !/chrome|android/i.test(navigator.userAgent)

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
): Promise<ConversionResult> {
  // 优先尝试 WebCodecs
  if (isWebCodecsSupported()) {
    console.info('Using WebCodecs for video conversion...')
    onProgress?.({
      isConverting: true,
      progress: 0,
      message: '使用 WebCodecs 转换器...',
    })

    const result = await convertVideoWithWebCodecs(videoUrl, onProgress)

    if (result.success) {
      console.info('WebCodecs conversion completed successfully')
      return result
    } else {
      console.warn(
        'WebCodecs conversion failed, falling back to FFmpeg:',
        result.error,
      )
    }
  }

  return {
    success: false,
    error: '浏览器不支持 webcodecs，Live Photo 转换失败',
  }
}
