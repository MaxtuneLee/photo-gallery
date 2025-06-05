/**
 * MOV Sample Table parser
 * Inspired by FFmpeg's mov_build_index and related functions
 */

import { BoxParser } from './box-parser.js'
import { ByteReader } from './byte-reader.js'
import type { MOVBox, MOVSample, MOVSampleTable } from './types.js'

export class SampleTableParser {
  private debug: boolean

  constructor(debug = false) {
    this.debug = debug
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.info(`[SampleTableParser] ${message}`, ...args)
    }
  }

  /**
   * Parse sample table from stbl box
   * Similar to FFmpeg's mov_read_stbl
   */
  parseSampleTable(stblBox: MOVBox): MOVSampleTable | null {
    if (!stblBox.children) {
      return null
    }

    const sampleTable: MOVSampleTable = {
      sampleSizes: [],
      chunkOffsets: [],
      samplesPerChunk: [],
      timeToSample: [],
      syncSamples: undefined,
    }

    // Parse sample sizes (stsz)
    const stszBox = BoxParser.findBox(stblBox.children, 'stsz')
    if (stszBox) {
      sampleTable.sampleSizes = this.parseSTSZ(stszBox)
    }

    // Parse chunk offsets (stco/co64)
    const stcoBox =
      BoxParser.findBox(stblBox.children, 'stco') ||
      BoxParser.findBox(stblBox.children, 'co64')
    if (stcoBox) {
      sampleTable.chunkOffsets = this.parseSTCO(stcoBox)
    }

    // Parse samples per chunk (stsc)
    const stscBox = BoxParser.findBox(stblBox.children, 'stsc')
    if (stscBox) {
      sampleTable.samplesPerChunk = this.parseSTSC(stscBox)
    }

    // Parse time to sample (stts)
    const sttsBox = BoxParser.findBox(stblBox.children, 'stts')
    if (sttsBox) {
      sampleTable.timeToSample = this.parseSTTS(sttsBox)
    }

    // Parse sync samples (stss) - optional for keyframes
    const stssBox = BoxParser.findBox(stblBox.children, 'stss')
    if (stssBox) {
      sampleTable.syncSamples = this.parseSTSS(stssBox)
    }

    this.log('Sample table parsed:', {
      sampleCount: sampleTable.sampleSizes.length,
      chunkCount: sampleTable.chunkOffsets.length,
      timeEntries: sampleTable.timeToSample.length,
      keyframes: sampleTable.syncSamples?.length || 'all',
    })

    return sampleTable
  }

  /**
   * Parse Sample Size Box (stsz)
   * Similar to FFmpeg's mov_read_stsz
   */
  private parseSTSZ(stszBox: MOVBox): number[] {
    if (!stszBox.data) return []

    const reader = new ByteReader(stszBox.data)

    const version = reader.readUint8()
    const flags = reader.readUint24()
    const uniformSize = reader.readUint32()
    const sampleCount = reader.readUint32()

    this.log(
      `STSZ: version=${version}, flags=${flags}, uniformSize=${uniformSize}, samples=${sampleCount}`,
    )

    const sizes: number[] = []

    if (uniformSize === 0) {
      // Variable sample sizes
      for (let i = 0; i < sampleCount; i++) {
        sizes.push(reader.readUint32())
      }
    } else {
      // Uniform sample size
      for (let i = 0; i < sampleCount; i++) {
        sizes.push(uniformSize)
      }
    }

    return sizes
  }

  /**
   * Parse Chunk Offset Box (stco/co64)
   * Similar to FFmpeg's mov_read_stco
   */
  private parseSTCO(stcoBox: MOVBox): number[] {
    if (!stcoBox.data) return []

    const reader = new ByteReader(stcoBox.data)
    const is64Bit = stcoBox.type === 'co64'

    const version = reader.readUint8()
    const flags = reader.readUint24()
    const entryCount = reader.readUint32()

    this.log(
      `${stcoBox.type}: version=${version}, flags=${flags}, entries=${entryCount}`,
    )

    const offsets: number[] = []

    for (let i = 0; i < entryCount; i++) {
      if (is64Bit) {
        const offset = reader.readUint64()
        offsets.push(Number(offset))
      } else {
        offsets.push(reader.readUint32())
      }
    }

    return offsets
  }

  /**
   * Parse Sample to Chunk Box (stsc)
   * Similar to FFmpeg's mov_read_stsc
   */
  private parseSTSC(
    stscBox: MOVBox,
  ): Array<{
    firstChunk: number
    samplesPerChunk: number
    descriptionIndex: number
  }> {
    if (!stscBox.data) return []

    const reader = new ByteReader(stscBox.data)

    const version = reader.readUint8()
    const flags = reader.readUint24()
    const entryCount = reader.readUint32()

    this.log(`STSC: version=${version}, flags=${flags}, entries=${entryCount}`)

    const entries: Array<{
      firstChunk: number
      samplesPerChunk: number
      descriptionIndex: number
    }> = []

    for (let i = 0; i < entryCount; i++) {
      entries.push({
        firstChunk: reader.readUint32(),
        samplesPerChunk: reader.readUint32(),
        descriptionIndex: reader.readUint32(),
      })
    }

    return entries
  }

  /**
   * Parse Time to Sample Box (stts)
   * Similar to FFmpeg's mov_read_stts
   */
  private parseSTTS(sttsBox: MOVBox): Array<{ count: number; delta: number }> {
    if (!sttsBox.data) return []

    const reader = new ByteReader(sttsBox.data)

    const version = reader.readUint8()
    const flags = reader.readUint24()
    const entryCount = reader.readUint32()

    this.log(`STTS: version=${version}, flags=${flags}, entries=${entryCount}`)

    const entries: Array<{ count: number; delta: number }> = []

    for (let i = 0; i < entryCount; i++) {
      entries.push({
        count: reader.readUint32(),
        delta: reader.readUint32(),
      })
    }

    return entries
  }

  /**
   * Parse Sync Sample Box (stss)
   * Similar to FFmpeg's mov_read_stss
   */
  private parseSTSS(stssBox: MOVBox): number[] {
    if (!stssBox.data) return []

    const reader = new ByteReader(stssBox.data)

    const version = reader.readUint8()
    const flags = reader.readUint24()
    const entryCount = reader.readUint32()

    this.log(
      `STSS: version=${version}, flags=${flags}, keyframes=${entryCount}`,
    )

    const syncSamples: number[] = []

    for (let i = 0; i < entryCount; i++) {
      syncSamples.push(reader.readUint32())
    }

    return syncSamples
  }

  /**
   * Build sample index from sample table
   * Similar to FFmpeg's mov_build_index
   */
  buildSampleIndex(
    sampleTable: MOVSampleTable,
    streamId: number,
    timeScale: number,
  ): MOVSample[] {
    const samples: MOVSample[] = []
    const sampleCount = sampleTable.sampleSizes.length

    if (sampleCount === 0) {
      return samples
    }

    // Build chunk to sample mapping
    const chunkToSamples = this.buildChunkToSampleMapping(
      sampleTable,
      sampleCount,
    )

    // Calculate timestamps
    let currentTime = 0
    let timeEntryIndex = 0
    let timeEntryRemaining = sampleTable.timeToSample[0]?.count || 0
    let currentDelta = sampleTable.timeToSample[0]?.delta || 0

    // Create keyframe lookup
    const keyframes = new Set(sampleTable.syncSamples || [])
    const allKeyframes = !sampleTable.syncSamples // If no stss, all samples are keyframes

    let sampleIndex = 0

    for (
      let chunkIndex = 0;
      chunkIndex < sampleTable.chunkOffsets.length;
      chunkIndex++
    ) {
      const chunkOffset = sampleTable.chunkOffsets[chunkIndex]
      const samplesInChunk = chunkToSamples[chunkIndex] || 0

      let sampleOffsetInChunk = 0

      for (
        let sampleInChunk = 0;
        sampleInChunk < samplesInChunk;
        sampleInChunk++
      ) {
        if (sampleIndex >= sampleCount) {
          break
        }

        const sampleSize = sampleTable.sampleSizes[sampleIndex]
        const sampleOffset = chunkOffset + sampleOffsetInChunk

        // Check if this is a keyframe
        const isKeyframe = allKeyframes || keyframes.has(sampleIndex + 1) // stss uses 1-based indexing

        samples.push({
          offset: sampleOffset,
          size: sampleSize,
          timestamp: (currentTime / timeScale) * 1000000, // Convert to microseconds
          duration: (currentDelta / timeScale) * 1000000,
          isKeyframe,
          streamId,
        })

        sampleOffsetInChunk += sampleSize
        sampleIndex++

        // Update timestamp
        currentTime += currentDelta
        timeEntryRemaining--

        if (
          timeEntryRemaining === 0 &&
          timeEntryIndex + 1 < sampleTable.timeToSample.length
        ) {
          timeEntryIndex++
          timeEntryRemaining = sampleTable.timeToSample[timeEntryIndex].count
          currentDelta = sampleTable.timeToSample[timeEntryIndex].delta
        }
      }
    }

    this.log(`Built ${samples.length} samples for stream ${streamId}`)
    return samples
  }

  /**
   * Build mapping from chunk index to number of samples
   */
  private buildChunkToSampleMapping(
    sampleTable: MOVSampleTable,
    _sampleCount: number,
  ): number[] {
    const chunkCount = sampleTable.chunkOffsets.length
    const chunkToSamples = Array.from({ length: chunkCount }).fill(
      0,
    ) as number[]

    if (sampleTable.samplesPerChunk.length === 0) {
      return chunkToSamples
    }

    let currentEntry = 0
    let nextFirstChunk =
      sampleTable.samplesPerChunk[currentEntry + 1]?.firstChunk ||
      chunkCount + 1

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      const chunkNumber = chunkIndex + 1 // Chunks are 1-based

      // Check if we need to move to next entry
      if (
        chunkNumber >= nextFirstChunk &&
        currentEntry + 1 < sampleTable.samplesPerChunk.length
      ) {
        currentEntry++
        nextFirstChunk =
          sampleTable.samplesPerChunk[currentEntry + 1]?.firstChunk ||
          chunkCount + 1
      }

      chunkToSamples[chunkIndex] =
        sampleTable.samplesPerChunk[currentEntry].samplesPerChunk
    }

    return chunkToSamples
  }
}
