/**
 * Test frame rate detection functionality
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function testFrameRate() {
  console.info('🎬 Testing MOV demuxer frame rate detection...')

  try {
    // Import demuxer
    const { MOVDemuxer } = await import('../dist/index.js')

    // Read test file
    const movPath = join(__dirname, 'IMG_9117.mov')
    const buffer = readFileSync(movPath)
    console.info(`📁 Loaded file: ${movPath} (${buffer.length} bytes)`)

    // Create and initialize demuxer
    const demuxer = new MOVDemuxer(buffer.buffer, { debug: true })
    console.info('\n🔄 Initializing demuxer...')
    await demuxer.init()

    // Get file info
    const info = demuxer.getInfo()
    console.info('\n📋 File Information:')
    console.info(
      `⏱️  Duration: ${(info.duration / info.timeScale).toFixed(2)} seconds`,
    )
    console.info(`🎞️  Time scale: ${info.timeScale}`)
    console.info(`🎯 Streams: ${info.streams.length}`)

    // Display stream information including frame rates
    info.streams.forEach((stream, index) => {
      console.info(`\n📺 Stream ${index} (ID: ${stream.id}):`)
      console.info(`   Type: ${stream.type}`)
      console.info(`   Codec: ${stream.codecType}`)
      console.info(`   Time scale: ${stream.timeScale}`)
      console.info(
        `   Duration: ${stream.duration} (${(stream.duration / stream.timeScale).toFixed(2)}s)`,
      )

      if (stream.type === 'video') {
        console.info(`   Resolution: ${stream.width}x${stream.height}`)
        if (stream.frameRate !== undefined) {
          console.info(`   Frame Rate: ${stream.frameRate} fps`)
        }
        if (stream.avgFrameRate !== undefined) {
          console.info(`   Avg Frame Rate: ${stream.avgFrameRate} fps`)
        }
        if (stream.bitRate !== undefined) {
          console.info(
            `   Bit Rate: ${(stream.bitRate / 1000).toFixed(1)} kbps`,
          )
        }
      } else if (stream.type === 'audio') {
        console.info(`   Sample rate: ${stream.sampleRate}Hz`)
        console.info(`   Channels: ${stream.channels}`)
        if (stream.bitRate !== undefined) {
          console.info(
            `   Bit Rate: ${(stream.bitRate / 1000).toFixed(1)} kbps`,
          )
        }
      }
    })

    // Get frame rate info specifically
    const frameRateInfo = demuxer.getFrameRateInfo()
    if (frameRateInfo.length > 0) {
      console.info('\n🎞️ Frame Rate Analysis:')
      frameRateInfo.forEach((info) => {
        console.info(`   Stream ${info.streamId}:`)
        if (info.frameRate !== undefined) {
          console.info(`     - Frame Rate: ${info.frameRate} fps`)
        }
        if (info.avgFrameRate !== undefined) {
          console.info(`     - Average Frame Rate: ${info.avgFrameRate} fps`)
        }
        console.info(
          `     - Constant Frame Rate: ${info.isConstant ? 'Yes' : 'No'}`,
        )
      })
    }

    // Get bit rate info
    const bitRateInfo = demuxer.getBitRateInfo()
    if (bitRateInfo.length > 0) {
      console.info('\n📊 Bit Rate Analysis:')
      bitRateInfo.forEach((info) => {
        console.info(`   Stream ${info.streamId} (${info.type}):`)
        if (info.bitRateKbps !== undefined) {
          console.info(`     - Bit Rate: ${info.bitRateKbps} kbps`)
        }
        if (info.avgBitRateKbps !== undefined) {
          console.info(`     - Average Bit Rate: ${info.avgBitRateKbps} kbps`)
        }
      })
    }

    // Test a few samples to see timing
    console.info('\n🎯 Sample Timing Analysis:')
    let sampleCount = 0
    const maxSamples = 10

    while (sampleCount < maxSamples) {
      const sample = demuxer.getNextSample()
      if (!sample) break

      const stream = info.streams.find((s) => s.id === sample.streamId)
      const timeInSeconds = sample.timestamp / 1000000 // Convert microseconds to seconds

      console.info(
        `Sample ${sampleCount}: ${stream?.type}, timestamp: ${timeInSeconds.toFixed(4)}s, duration: ${sample.duration}μs`,
      )
      sampleCount++
    }

    demuxer.close()
    console.info('\n✅ Frame rate test completed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error(error.stack)
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }
}

testFrameRate()
