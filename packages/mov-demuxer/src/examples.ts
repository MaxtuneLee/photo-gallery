/**
 * Example usage of MOV demuxer
 */

import { MOVDemuxer } from './index.js'

// Example 1: Basic file parsing
export async function parseMovFile(buffer: ArrayBuffer) {
  const demuxer = new MOVDemuxer(buffer, {
    enableVideo: true,
    enableAudio: true,
    debug: true,
  })

  await demuxer.init()

  const info = demuxer.getInfo()
  console.info('File info:', {
    duration: info.duration / info.timeScale,
    streams: info.streams.map((s) => ({
      type: s.type,
      codec: s.codecType,
      ...(s.type === 'video' ? { resolution: `${s.width}x${s.height}` } : {}),
      ...(s.type === 'audio'
        ? { sampleRate: s.sampleRate, channels: s.channels }
        : {}),
    })),
  })

  return demuxer
}

// Example 2: WebCodecs integration
export async function playWithWebCodecs(
  buffer: ArrayBuffer,
  canvas: HTMLCanvasElement,
) {
  const demuxer = new MOVDemuxer(buffer)
  await demuxer.init()

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context')

  // Initialize WebCodecs
  await demuxer.initWebCodecs(
    // Video frame handler
    (videoFrame: VideoFrame) => {
      canvas.width = videoFrame.displayWidth
      canvas.height = videoFrame.displayHeight
      ctx.drawImage(videoFrame, 0, 0)
      videoFrame.close()
    },
    // Audio frame handler
    (audioData: AudioData) => {
      // In a real app, you'd send this to Web Audio API
      console.info('Audio frame received:', audioData.numberOfFrames)
      audioData.close()
    },
    // Error handler
    (error: Error) => {
      console.error('Decode error:', error)
    },
  )

  // Decode all frames
  let frameCount = 0
  while (true) {
    const frame = await demuxer.readFrame()
    if (!frame) break

    frameCount++
    if (frameCount % 30 === 0) {
      console.info(`Decoded ${frameCount} frames`)
    }
  }

  demuxer.close()
}

// Example 3: Extract keyframes only
export async function extractKeyframes(
  buffer: ArrayBuffer,
): Promise<Uint8Array[]> {
  const demuxer = new MOVDemuxer(buffer, { enableAudio: false })
  await demuxer.init()

  const keyframes: Uint8Array[] = []

  while (true) {
    const sample = demuxer.getNextSample()
    if (!sample) break

    if (sample.isKeyframe) {
      const data = demuxer.getSampleData(sample)
      keyframes.push(new Uint8Array(data))
    }
  }

  demuxer.close()
  return keyframes
}

// Example 4: Seeking and frame extraction
export async function extractFrameAtTime(
  buffer: ArrayBuffer,
  timeSeconds: number,
): Promise<Uint8Array | null> {
  const demuxer = new MOVDemuxer(buffer, { enableAudio: false })
  await demuxer.init()

  // Seek to the desired time
  demuxer.seek(timeSeconds * 1000000) // Convert to microseconds

  // Get the next frame after seeking
  const sample = demuxer.getNextSample()
  if (!sample) {
    demuxer.close()
    return null
  }

  const data = demuxer.getSampleData(sample)
  demuxer.close()

  return new Uint8Array(data)
}

// Example 5: Frame-by-frame processing
export async function processAllFrames(
  buffer: ArrayBuffer,
  onVideoFrame: (
    frame: Uint8Array,
    timestamp: number,
    isKeyframe: boolean,
  ) => void,
  onAudioFrame: (frame: Uint8Array, timestamp: number) => void,
) {
  const demuxer = new MOVDemuxer(buffer)
  await demuxer.init()

  while (true) {
    const sample = demuxer.getNextSample()
    if (!sample) break

    const data = demuxer.getSampleData(sample)
    const stream = demuxer
      .getInfo()
      .streams.find((s) => s.id === sample.streamId)

    if (stream?.type === 'video') {
      onVideoFrame(data, sample.timestamp, sample.isKeyframe)
    } else if (stream?.type === 'audio') {
      onAudioFrame(data, sample.timestamp)
    }
  }

  demuxer.close()
}

// Example 6: Web Worker integration
export class MOVDemuxerWorker {
  private worker: Worker
  private callbacks = new Map<number, (result: unknown) => void>()
  private nextId = 0

  constructor(workerScript: string) {
    this.worker = new Worker(workerScript)
    this.worker.onmessage = (event) => {
      const { id, result, error } = event.data
      const callback = this.callbacks.get(id)
      if (callback) {
        this.callbacks.delete(id)
        if (error) {
          throw new Error(error)
        } else {
          callback(result)
        }
      }
    }
  }

  async parseFile(buffer: ArrayBuffer): Promise<unknown> {
    return new Promise((resolve, _reject) => {
      const id = this.nextId++
      this.callbacks.set(id, resolve)
      this.worker.postMessage(
        {
          id,
          action: 'parse',
          buffer,
        },
        [buffer],
      )
    })
  }

  terminate() {
    this.worker.terminate()
  }
}
