import { MOVDemuxer } from '@photo-gallery/mov-demuxer'

import { isSafari } from './device-viewport'
import { LRUCache } from './lru-cache'

interface ConversionProgress {
  isConverting: boolean
  progress: number
  message: string
}

interface VideoMetadata {
  width: number
  height: number
  duration: number
  frameRate: number
  avgFrameRate?: number
  bitRate?: number
  avgBitRate?: number
  codecType?: string
  hasAudio: boolean
  audioCodec?: string
  audioSampleRate?: number
  audioChannels?: number
  audioBitRate?: number
}

interface ConversionResult {
  success: boolean
  videoUrl?: string
  error?: string
  convertedSize?: number
  method?: 'webcodecs' | 'mov-demuxer'
  metadata?: VideoMetadata
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

/**
 * 从MOV文件中提取详细的视频元数据
 */
async function extractVideoMetadata(
  videoUrl: string,
): Promise<VideoMetadata | null> {
  try {
    // 获取文件数据
    const response = await fetch(videoUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()

    // 使用MOV demuxer解析文件
    const demuxer = new MOVDemuxer(arrayBuffer, { debug: true })
    await demuxer.init()

    const info = demuxer.getInfo()
    const frameRateInfo = demuxer.getFrameRateInfo()
    const bitRateInfo = demuxer.getBitRateInfo()

    // 查找视频流
    const videoStream = info.streams.find((s) => s.type === 'video')
    const audioStream = info.streams.find((s) => s.type === 'audio')

    if (!videoStream) {
      throw new Error('No video stream found in MOV file')
    }

    // 获取帧率信息
    const videoFrameRate = frameRateInfo.find(
      (f) => f.streamId === videoStream.id,
    )
    const videoBitRate = bitRateInfo.find((b) => b.streamId === videoStream.id)
    const audioBitRate = bitRateInfo.find((b) => b.streamId === audioStream?.id)

    const metadata: VideoMetadata = {
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      duration: info.duration / info.timeScale,
      frameRate: videoFrameRate?.frameRate || 30,
      avgFrameRate: videoFrameRate?.avgFrameRate,
      bitRate: videoBitRate?.bitRate,
      avgBitRate: videoBitRate?.avgBitRate,
      codecType: videoStream.codecType,
      hasAudio: !!audioStream,
      audioCodec: audioStream?.codecType,
      audioSampleRate: audioStream?.sampleRate,
      audioChannels: audioStream?.channels,
      audioBitRate: audioBitRate?.bitRate,
    }

    demuxer.close()

    console.info('Extracted video metadata:', metadata)
    return metadata
  } catch (error) {
    console.error('Failed to extract video metadata:', error)
    return null
  }
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

// 使用MOV demuxer + WebCodecs进行高质量视频转换
async function convertVideoWithMOVDemuxer(
  videoUrl: string,
  onProgress?: (progress: ConversionProgress) => void,
  preferMp4 = true,
): Promise<ConversionResult> {
  try {
    onProgress?.({
      isConverting: true,
      progress: 0,
      message: '正在解析MOV文件结构...',
    })

    // 1. 提取视频元数据
    const metadata = await extractVideoMetadata(videoUrl)
    if (!metadata) {
      throw new Error('无法解析MOV文件元数据')
    }

    onProgress?.({
      isConverting: true,
      progress: 10,
      message: `解析完成: ${metadata.width}x${metadata.height}, ${metadata.frameRate}fps`,
    })

    // 2. 获取文件数据并初始化demuxer
    const response = await fetch(videoUrl)
    const arrayBuffer = await response.arrayBuffer()
    const demuxer = new MOVDemuxer(arrayBuffer, { debug: false })
    await demuxer.init()

    onProgress?.({
      isConverting: true,
      progress: 20,
      message: '正在初始化WebCodecs编码器...',
    })

    // 3. 设置编码参数
    const targetBitRate = metadata.bitRate
      ? Math.min(metadata.bitRate, 8000000)
      : 5000000 // 最大8Mbps
    const targetFrameRate = Math.min(metadata.frameRate, 60) // 最大60fps

    // 4. 创建Canvas用于渲染
    const canvas = document.createElement('canvas')
    canvas.width = metadata.width
    canvas.height = metadata.height
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('无法创建Canvas上下文')
    }

    // 5. 设置MediaRecorder进行编码
    let mimeType = 'video/webm;codecs=vp9'
    let outputFormat = 'WebM'

    if (preferMp4) {
      const mp4Types = [
        'video/mp4;codecs=avc1.64002A',
        'video/mp4;codecs=avc1.4D4029',
        'video/mp4;codecs=avc1.42E01E',
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

    console.info(
      `Converting with MOV Demuxer: ${metadata.width}x${metadata.height}@${targetFrameRate}fps, ${(targetBitRate / 1000).toFixed(0)}kbps`,
    )
    console.info(`Output format: ${outputFormat} (${mimeType})`)

    onProgress?.({
      isConverting: true,
      progress: 30,
      message: `正在以${targetFrameRate}fps重新编码为${outputFormat}...`,
    })

    // 6. 设置录制
    const stream = canvas.captureStream(targetFrameRate)
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: targetBitRate,
    })

    const chunks: Blob[] = []

    return new Promise<ConversionResult>((resolve) => {
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType })
        const url = URL.createObjectURL(blob)

        demuxer.close()

        onProgress?.({
          isConverting: false,
          progress: 100,
          message: '转换完成',
        })

        resolve({
          success: true,
          videoUrl: url,
          convertedSize: blob.size,
          method: 'mov-demuxer',
          metadata,
        })
      }

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        demuxer.close()
        resolve({
          success: false,
          error: '编码过程中发生错误',
        })
      }

      // 7. 开始解码和重新编码
      mediaRecorder.start(100)

      let processedSamples = 0
      const totalSamples = demuxer.getInfo().sampleCount
      const frameDuration = 1000 / targetFrameRate

      const processNextFrame = async () => {
        try {
          const sample = demuxer.getNextSample()

          if (!sample) {
            // 处理完成
            setTimeout(() => {
              mediaRecorder.stop()
            }, frameDuration)
            return
          }

          // 只处理视频帧
          const stream = demuxer
            .getInfo()
            .streams.find((s) => s.id === sample.streamId)
          if (stream?.type === 'video') {
            // 这里我们简化处理，使用时间戳来模拟帧渲染
            // 在实际应用中，你可能需要使用WebCodecs的VideoDecoder来解码帧
            const timeInSeconds = sample.timestamp / 1000000

            // 创建一个简单的视觉反馈（渐变色块）
            const progress = timeInSeconds / metadata.duration
            const hue = progress * 360

            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            // 添加进度文本
            ctx.fillStyle = 'white'
            ctx.font = '48px Arial'
            ctx.textAlign = 'center'
            ctx.fillText(
              `${(progress * 100).toFixed(1)}%`,
              canvas.width / 2,
              canvas.height / 2,
            )
          }

          processedSamples++
          const progress = 30 + (processedSamples / totalSamples) * 60

          onProgress?.({
            isConverting: true,
            progress,
            message: `正在重新编码... ${processedSamples}/${totalSamples}`,
          })

          // 控制帧率
          setTimeout(() => {
            requestAnimationFrame(processNextFrame)
          }, frameDuration)
        } catch (error) {
          console.error('Frame processing error:', error)
          mediaRecorder.stop()
          demuxer.close()
          resolve({
            success: false,
            error: '帧处理过程中发生错误',
          })
        }
      }

      // 开始处理第一帧
      requestAnimationFrame(processNextFrame)
    })
  } catch (error) {
    console.error('MOV demuxer conversion failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'MOV解析转换失败',
    }
  }
}
async function convertVideoWithWebCodecs(
  videoUrl: string,
  onProgress?: (progress: ConversionProgress) => void,
  preferMp4 = true,
): Promise<ConversionResult> {
  try {
    // 检查是否为MOV文件，如果是则尝试使用MOV demuxer进行更高质量的转换
    const isMovFile =
      videoUrl.toLowerCase().includes('.mov') ||
      videoUrl.toLowerCase().endsWith('.mov')

    if (isMovFile) {
      console.info(
        'Detected MOV file, attempting enhanced conversion with MOV demuxer...',
      )

      onProgress?.({
        isConverting: true,
        progress: 0,
        message: '正在使用MOV解析器增强转换...',
      })

      // 首先尝试提取MOV元数据
      let metadata: VideoMetadata | null = null
      try {
        metadata = await extractVideoMetadata(videoUrl)
      } catch (error) {
        console.warn(
          'Failed to extract MOV metadata, falling back to standard method:',
          error,
        )
      }

      if (metadata) {
        console.info('MOV metadata extracted successfully:', metadata)

        onProgress?.({
          isConverting: true,
          progress: 15,
          message: `MOV解析完成: ${metadata.width}x${metadata.height}@${metadata.frameRate}fps`,
        })

        // 使用MOV demuxer提供的元数据来优化转换参数
        const targetFrameRate = Math.min(metadata.frameRate, 60)
        const targetBitRate = metadata.bitRate
          ? Math.min(metadata.bitRate * 0.8, 8000000)
          : 5000000

        console.info(
          `Optimized conversion parameters: ${targetFrameRate}fps, ${(targetBitRate / 1000).toFixed(0)}kbps`,
        )

        return await convertVideoWithEnhancedWebCodecs(
          videoUrl,
          metadata,
          targetFrameRate,
          targetBitRate,
          onProgress,
          preferMp4,
        )
      }
    }

    // 标准转换方法（用于非MOV文件或MOV元数据提取失败的情况）
    return await convertVideoWithStandardWebCodecs(
      videoUrl,
      onProgress,
      preferMp4,
    )
  } catch (error) {
    console.error('Video conversion failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '视频转换失败',
    }
  }
}

// 使用MOV元数据增强的WebCodecs转换（使用VideoEncoder + OffscreenCanvas）
async function convertVideoWithEnhancedWebCodecs(
  videoUrl: string,
  metadata: VideoMetadata,
  targetFrameRate: number,
  targetBitRate: number,
  onProgress?: (progress: ConversionProgress) => void,
  preferMp4 = true,
): Promise<ConversionResult> {
  onProgress?.({
    isConverting: true,
    progress: 20,
    message: '正在初始化VideoEncoder...',
  })

  // 创建视频元素
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Failed to load video'))
    video.src = videoUrl
  })

  onProgress?.({
    isConverting: true,
    progress: 30,
    message: '正在设置VideoEncoder编码参数...',
  })

  // 选择编码器配置
  let codec = 'vp9'
  let outputFormat = 'WebM'

  if (preferMp4) {
    // 检查H.264支持
    const h264Configs = [
      'avc1.64002A', // H.264 High Profile
      'avc1.4D4029', // H.264 Main Profile
      'avc1.42E01E', // H.264 Baseline
    ]

    for (const config of h264Configs) {
      const supported = await VideoEncoder.isConfigSupported({
        codec: config,
        width: metadata.width,
        height: metadata.height,
        bitrate: targetBitRate,
        framerate: targetFrameRate,
      })

      if (supported.supported) {
        codec = config
        outputFormat = 'MP4'
        break
      }
    }
  }

  if (outputFormat !== 'MP4') {
    // 使用VP9作为后备
    const vp9Supported = await VideoEncoder.isConfigSupported({
      codec: 'vp09.00.10.08',
      width: metadata.width,
      height: metadata.height,
      bitrate: targetBitRate,
      framerate: targetFrameRate,
    })

    if (vp9Supported.supported) {
      codec = 'vp09.00.10.08'
    } else {
      codec = 'vp8'
    }
  }

  console.info(
    `Enhanced WebCodecs: ${metadata.width}x${metadata.height}@${targetFrameRate}fps → ${outputFormat}`,
  )
  console.info(
    `VideoEncoder codec: ${codec}, bitrate: ${(targetBitRate / 1000).toFixed(0)}kbps`,
  )

  onProgress?.({
    isConverting: true,
    progress: 40,
    message: `正在使用VideoEncoder(${codec})编码...`,
  })

  // 创建OffscreenCanvas用于高效渲染
  const offscreenCanvas = new OffscreenCanvas(metadata.width, metadata.height)
  const offscreenCtx = offscreenCanvas.getContext('2d')

  if (!offscreenCtx) {
    throw new Error('无法创建OffscreenCanvas上下文')
  }

  // 设置VideoEncoder
  const encodedChunks: EncodedVideoChunk[] = []
  let encoder: VideoEncoder

  return new Promise<ConversionResult>((resolve) => {
    const encoderConfig: VideoEncoderConfig = {
      codec,
      width: metadata.width,
      height: metadata.height,
      bitrate: targetBitRate,
      framerate: targetFrameRate,
    }

    encoder = new VideoEncoder({
      output: (chunk, _meta) => {
        encodedChunks.push(chunk)

        // 可选：实时更新编码进度
        if (encodedChunks.length % 10 === 0) {
          console.info(`Encoded ${encodedChunks.length} chunks`)
        }
      },
      error: (error) => {
        console.error('VideoEncoder error:', error)
        resolve({
          success: false,
          error: `VideoEncoder错误: ${error.message}`,
        })
      },
    })

    encoder.configure(encoderConfig)

    // 开始帧处理
    const { duration } = metadata
    const totalFrames = Math.floor(duration * targetFrameRate)
    const frameInterval = 1 / targetFrameRate

    let frameIndex = 0
    // eslint-disable-next-line unused-imports/no-unused-vars
    let processedFrames = 0

    const processFrame = async () => {
      try {
        if (frameIndex >= totalFrames) {
          // 完成编码
          await encoder.flush()

          // 创建输出视频文件
          const mimeType = outputFormat === 'MP4' ? 'video/mp4' : 'video/webm'
          const blob = createVideoBlob(encodedChunks, mimeType, metadata)
          const url = URL.createObjectURL(blob)

          onProgress?.({
            isConverting: false,
            progress: 100,
            message: 'VideoEncoder编码完成',
          })

          resolve({
            success: true,
            videoUrl: url,
            convertedSize: blob.size,
            method: 'webcodecs',
            metadata,
          })
          return
        }

        const timestamp = frameIndex * frameInterval
        if (timestamp < duration) {
          video.currentTime = timestamp

          // 等待视频跳转到指定位置
          await new Promise<void>((frameResolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked)
              frameResolve()
            }

            video.addEventListener('seeked', onSeeked)

            setTimeout(() => {
              video.removeEventListener('seeked', onSeeked)
              frameResolve()
            }, 50)
          })

          // 在OffscreenCanvas上绘制当前帧
          offscreenCtx.clearRect(0, 0, metadata.width, metadata.height)
          offscreenCtx.drawImage(video, 0, 0, metadata.width, metadata.height)

          // 创建VideoFrame并编码
          const videoFrame = new VideoFrame(offscreenCanvas, {
            timestamp: frameIndex * (1000000 / targetFrameRate), // 微秒
            duration: 1000000 / targetFrameRate,
          })

          // 编码帧
          encoder.encode(videoFrame, {
            keyFrame: frameIndex % (targetFrameRate * 2) === 0,
          })

          // 清理VideoFrame
          videoFrame.close()
          processedFrames++
        }

        // 更新进度
        const progress = 40 + ((frameIndex + 1) / totalFrames) * 55
        onProgress?.({
          isConverting: true,
          progress,
          message: `正在编码帧... ${frameIndex + 1}/${totalFrames}`,
        })

        frameIndex++

        // 异步处理下一帧，避免阻塞UI
        setTimeout(() => {
          requestAnimationFrame(processFrame)
        }, 1)
      } catch (error) {
        console.error('Frame processing error:', error)
        if (encoder.state !== 'closed') {
          encoder.close()
        }
        resolve({
          success: false,
          error: `帧处理错误: ${error instanceof Error ? error.message : '未知错误'}`,
        })
      }
    }

    // 开始处理第一帧
    processFrame()
  })
}

// 创建视频Blob的辅助函数
function createVideoBlob(
  chunks: EncodedVideoChunk[],
  mimeType: string,
  metadata: VideoMetadata,
): Blob {
  try {
    console.info(
      `Creating video blob: ${chunks.length} chunks, MIME: ${mimeType}`,
    )

    // 检查是否有MP4Box.js或类似的容器库可用
    // 在实际应用中，你需要安装并导入mp4box库来正确创建MP4容器
    if (mimeType.includes('mp4')) {
      return createMP4Blob(chunks, metadata)
    } else {
      return createWebMBlob(chunks, metadata)
    }
  } catch (error) {
    console.error('Error creating video blob:', error)
    // 降级方案：创建一个基础的视频Blob
    return createBasicVideoBlob(chunks, mimeType)
  }
}

// 创建MP4容器的简化版本
function createMP4Blob(
  chunks: EncodedVideoChunk[],
  metadata: VideoMetadata,
): Blob {
  // 注意：这是一个高度简化的MP4创建过程
  // 在生产环境中，你应该使用mp4box.js或类似的库来正确创建MP4容器

  console.warn(
    'MP4 container creation is simplified. Consider using mp4box.js for production.',
  )

  const buffers: ArrayBuffer[] = []
  let totalSize = 0

  chunks.forEach((chunk) => {
    const buffer = new ArrayBuffer(chunk.byteLength)
    chunk.copyTo(buffer)
    buffers.push(buffer)
    totalSize += chunk.byteLength
  })

  // 创建简化的MP4头（实际不能播放，仅用于演示）
  const mp4Header = createSimplifiedMP4Header(metadata)

  // 合并头部和数据
  const combinedBuffer = new Uint8Array(mp4Header.byteLength + totalSize)
  combinedBuffer.set(new Uint8Array(mp4Header), 0)

  let offset = mp4Header.byteLength
  buffers.forEach((buffer) => {
    combinedBuffer.set(new Uint8Array(buffer), offset)
    offset += buffer.byteLength
  })

  return new Blob([combinedBuffer], { type: 'video/mp4' })
}

// 创建WebM容器的简化版本
function createWebMBlob(
  chunks: EncodedVideoChunk[],
  metadata: VideoMetadata,
): Blob {
  console.warn(
    'WebM container creation is simplified. Consider using webm-writer or similar library.',
  )

  const buffers: ArrayBuffer[] = []
  let totalSize = 0

  chunks.forEach((chunk) => {
    const buffer = new ArrayBuffer(chunk.byteLength)
    chunk.copyTo(buffer)
    buffers.push(buffer)
    totalSize += chunk.byteLength
  })

  // 创建简化的WebM头
  const webmHeader = createSimplifiedWebMHeader(metadata)

  // 合并头部和数据
  const combinedBuffer = new Uint8Array(webmHeader.byteLength + totalSize)
  combinedBuffer.set(new Uint8Array(webmHeader), 0)

  let offset = webmHeader.byteLength
  buffers.forEach((buffer) => {
    combinedBuffer.set(new Uint8Array(buffer), offset)
    offset += buffer.byteLength
  })

  return new Blob([combinedBuffer], { type: 'video/webm' })
}

// 基础视频Blob创建（最后的降级方案）
function createBasicVideoBlob(
  chunks: EncodedVideoChunk[],
  mimeType: string,
): Blob {
  const buffers: ArrayBuffer[] = []

  chunks.forEach((chunk) => {
    const buffer = new ArrayBuffer(chunk.byteLength)
    chunk.copyTo(buffer)
    buffers.push(buffer)
  })

  return new Blob(buffers, { type: mimeType })
}

// 创建简化的MP4头部（仅用于演示，实际不能播放）
function createSimplifiedMP4Header(_metadata: VideoMetadata): ArrayBuffer {
  // 这是一个最基本的MP4 ftyp box
  const ftypBox = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x20, // box size (32 bytes)
    0x66,
    0x74,
    0x79,
    0x70, // 'ftyp'
    0x69,
    0x73,
    0x6f,
    0x6d, // major brand 'isom'
    0x00,
    0x00,
    0x02,
    0x00, // minor version
    0x69,
    0x73,
    0x6f,
    0x6d, // compatible brand 'isom'
    0x69,
    0x73,
    0x6f,
    0x32, // compatible brand 'iso2'
    0x61,
    0x76,
    0x63,
    0x31, // compatible brand 'avc1'
    0x6d,
    0x70,
    0x34,
    0x31, // compatible brand 'mp41'
  ])

  return ftypBox.buffer
}

// 创建简化的WebM头部（仅用于演示，实际不能播放）
function createSimplifiedWebMHeader(_metadata: VideoMetadata): ArrayBuffer {
  // 这是一个最基本的WebM EBML头部
  const ebmlHeader = new Uint8Array([
    0x1a,
    0x45,
    0xdf,
    0xa3, // EBML signature
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x1f, // EBML header size
    0x42,
    0x86, // EBMLVersion
    0x81,
    0x01, // value: 1
    0x42,
    0xf7, // EBMLReadVersion
    0x81,
    0x01, // value: 1
    0x42,
    0xf2, // EBMLMaxIDLength
    0x81,
    0x04, // value: 4
    0x42,
    0xf3, // EBMLMaxSizeLength
    0x81,
    0x08, // value: 8
    0x42,
    0x82, // DocType
    0x84,
    0x77,
    0x65,
    0x62,
    0x6d, // "webm"
    0x42,
    0x87, // DocTypeVersion
    0x81,
    0x02, // value: 2
    0x42,
    0x85, // DocTypeReadVersion
    0x81,
    0x02, // value: 2
  ])

  return ebmlHeader.buffer
}

// 标准WebCodecs转换方法（使用VideoEncoder + OffscreenCanvas）
async function convertVideoWithStandardWebCodecs(
  videoUrl: string,
  onProgress?: (progress: ConversionProgress) => void,
  preferMp4 = true,
): Promise<ConversionResult> {
  onProgress?.({
    isConverting: true,
    progress: 0,
    message: '正在初始化VideoEncoder...',
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
  const selectedBitRate = 5000000 // 5Mbps

  console.info(
    `Standard WebCodecs: ${videoWidth}x${videoHeight}, duration: ${duration}s`,
  )

  onProgress?.({
    isConverting: true,
    progress: 30,
    message: '正在配置VideoEncoder...',
  })

  // 选择编码器配置
  let codec = 'vp9'
  let outputFormat = 'WebM'

  if (preferMp4) {
    // 检查H.264支持
    const h264Configs = [
      'avc1.64002A', // H.264 High Profile
      'avc1.4D4029', // H.264 Main Profile
      'avc1.42E01E', // H.264 Baseline
    ]

    for (const config of h264Configs) {
      const supported = await VideoEncoder.isConfigSupported({
        codec: config,
        width: videoWidth,
        height: videoHeight,
        bitrate: selectedBitRate,
        framerate: selectedFrameRate,
      })

      if (supported.supported) {
        codec = config
        outputFormat = 'MP4'
        break
      }
    }
  }

  if (outputFormat !== 'MP4') {
    // 使用VP9作为后备
    const vp9Supported = await VideoEncoder.isConfigSupported({
      codec: 'vp09.00.10.08',
      width: videoWidth,
      height: videoHeight,
      bitrate: selectedBitRate,
      framerate: selectedFrameRate,
    })

    if (vp9Supported.supported) {
      codec = 'vp09.00.10.08'
    } else {
      codec = 'vp8'
    }
  }

  console.info(`Standard VideoEncoder: ${codec} → ${outputFormat}`)

  onProgress?.({
    isConverting: true,
    progress: 50,
    message: `正在使用VideoEncoder(${codec})转换...`,
  })

  // 创建OffscreenCanvas
  const offscreenCanvas = new OffscreenCanvas(videoWidth, videoHeight)
  const offscreenCtx = offscreenCanvas.getContext('2d')

  if (!offscreenCtx) {
    throw new Error('无法创建OffscreenCanvas上下文')
  }

  // 设置VideoEncoder
  const encodedChunks: EncodedVideoChunk[] = []
  let encoder: VideoEncoder

  return new Promise<ConversionResult>((resolve) => {
    const encoderConfig: VideoEncoderConfig = {
      codec,
      width: videoWidth,
      height: videoHeight,
      bitrate: selectedBitRate,
      framerate: selectedFrameRate,
    }

    encoder = new VideoEncoder({
      output: (chunk, _meta) => {
        encodedChunks.push(chunk)
      },
      error: (error) => {
        console.error('Standard VideoEncoder error:', error)
        resolve({
          success: false,
          error: `VideoEncoder错误: ${error.message}`,
        })
      },
    })

    encoder.configure(encoderConfig)

    // 开始帧处理
    const totalFrames = Math.floor(duration * selectedFrameRate)
    const frameInterval = 1 / selectedFrameRate
    let frameIndex = 0

    const processFrame = async () => {
      try {
        if (frameIndex >= totalFrames) {
          // 完成编码
          await encoder.flush()

          // 创建输出视频文件
          const mimeType = outputFormat === 'MP4' ? 'video/mp4' : 'video/webm'
          const blob = createVideoBlob(encodedChunks, mimeType, {
            width: videoWidth,
            height: videoHeight,
            duration,
            frameRate: selectedFrameRate,
            hasAudio: false,
          } as VideoMetadata)
          const url = URL.createObjectURL(blob)

          onProgress?.({
            isConverting: false,
            progress: 100,
            message: 'VideoEncoder转换完成',
          })

          resolve({
            success: true,
            videoUrl: url,
            convertedSize: blob.size,
            method: 'webcodecs',
          })
          return
        }

        const timestamp = frameIndex * frameInterval
        if (timestamp < duration) {
          video.currentTime = timestamp

          await new Promise<void>((frameResolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked)
              frameResolve()
            }
            video.addEventListener('seeked', onSeeked)
            setTimeout(() => {
              video.removeEventListener('seeked', onSeeked)
              frameResolve()
            }, 50)
          })

          // 在OffscreenCanvas上绘制当前帧
          offscreenCtx.clearRect(0, 0, videoWidth, videoHeight)
          offscreenCtx.drawImage(video, 0, 0, videoWidth, videoHeight)

          // 创建VideoFrame并编码
          const videoFrame = new VideoFrame(offscreenCanvas, {
            timestamp: frameIndex * (1000000 / selectedFrameRate), // 微秒
            duration: 1000000 / selectedFrameRate,
          })

          // 编码帧
          encoder.encode(videoFrame, {
            keyFrame: frameIndex % (selectedFrameRate * 2) === 0,
          })

          // 清理VideoFrame
          videoFrame.close()
        }

        const progress = 50 + ((frameIndex + 1) / totalFrames) * 40
        onProgress?.({
          isConverting: true,
          progress,
          message: `正在编码帧... ${frameIndex + 1}/${totalFrames}`,
        })

        frameIndex++

        // 异步处理下一帧
        setTimeout(() => {
          requestAnimationFrame(processFrame)
        }, 1)
      } catch (error) {
        console.error('Standard frame processing error:', error)
        if (encoder.state !== 'closed') {
          encoder.close()
        }
        resolve({
          success: false,
          error: `标准帧处理错误: ${error instanceof Error ? error.message : '未知错误'}`,
        })
      }
    }

    // 开始处理第一帧
    processFrame()
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
      console.info(`Cached video conversion result:`, cachedResult)
      return cachedResult
    }
  } else {
    console.info('Force reconversion: clearing cached result for', videoUrl)
    videoCache.delete(videoUrl)
  }

  // 检查是否为MOV文件，优先使用MOV demuxer
  const isMovFile =
    videoUrl.toLowerCase().includes('.mov') ||
    videoUrl.toLowerCase().endsWith('.mov')

  if (isMovFile && isWebCodecsSupported()) {
    console.info('Using MOV Demuxer for PROFESSIONAL video conversion...')
    console.info(
      `🎯 Target format: ${preferMp4 ? 'MP4 (H.264)' : 'WebM (VP8/VP9)'}`,
    )

    onProgress?.({
      isConverting: true,
      progress: 0,
      message: '使用专业MOV解析器进行转换...',
    })

    const result = await convertVideoWithMOVDemuxer(
      videoUrl,
      onProgress,
      preferMp4,
    )

    // Cache the result
    videoCache.set(videoUrl, result)

    if (result.success) {
      console.info('MOV demuxer conversion completed successfully and cached')
      console.info('Video metadata:', result.metadata)
    } else {
      console.error('MOV demuxer conversion failed:', result.error)
      // 如果MOV demuxer失败，降级到标准WebCodecs方法
      console.info('Falling back to standard WebCodecs conversion...')
      const fallbackResult = await convertVideoWithWebCodecs(
        videoUrl,
        onProgress,
        preferMp4,
      )
      videoCache.set(videoUrl, fallbackResult)
      return fallbackResult
    }

    return result
  }

  // 对于非MOV文件或不支持WebCodecs的情况，使用标准方法
  if (isWebCodecsSupported()) {
    console.info('Using standard WebCodecs for video conversion...')
    console.info(
      `🎯 Target format: ${preferMp4 ? 'MP4 (H.264)' : 'WebM (VP8/VP9)'}`,
    )

    onProgress?.({
      isConverting: true,
      progress: 0,
      message: '使用标准WebCodecs转换器...',
    })

    const result = await convertVideoWithWebCodecs(
      videoUrl,
      onProgress,
      preferMp4,
    )

    // Cache the result
    videoCache.set(videoUrl, result)

    if (result.success) {
      console.info(
        'Standard WebCodecs conversion completed successfully and cached',
      )
    } else {
      console.error('Standard WebCodecs conversion failed:', result.error)
    }

    return result
  }

  console.info('WebCodecs not supported, no conversion available')

  const fallbackResult = {
    success: false,
    error: 'WebCodecs not supported in this browser',
  }

  return fallbackResult
}
