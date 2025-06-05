/**
 * Performance monitoring for MOV demuxer
 */

export interface PerformanceMetrics {
  parseTime: number
  initTime: number
  decodeTime: number
  seekTime: number
  totalSamples: number
  decodedFrames: number
  errorCount: number
  averageFrameTime: number
  memoryUsage?: {
    used: number
    total: number
  }
}

export class PerformanceMonitor {
  private metrics: Partial<PerformanceMetrics> = {}
  private timers = new Map<string, number>()
  private enabled: boolean

  constructor(enabled = false) {
    this.enabled = enabled
  }

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }

  startTimer(name: string): void {
    if (!this.enabled) return
    this.timers.set(name, performance.now())
  }

  endTimer(name: string): number {
    if (!this.enabled) return 0

    const startTime = this.timers.get(name)
    if (startTime === undefined) return 0

    const duration = performance.now() - startTime
    this.timers.delete(name)
    return duration
  }

  recordParseTime(duration: number): void {
    if (!this.enabled) return
    this.metrics.parseTime = duration
  }

  recordInitTime(duration: number): void {
    if (!this.enabled) return
    this.metrics.initTime = duration
  }

  recordDecodeTime(duration: number): void {
    if (!this.enabled) return
    this.metrics.decodeTime = (this.metrics.decodeTime || 0) + duration
  }

  recordSeekTime(duration: number): void {
    if (!this.enabled) return
    this.metrics.seekTime = (this.metrics.seekTime || 0) + duration
  }

  recordSampleCount(count: number): void {
    if (!this.enabled) return
    this.metrics.totalSamples = count
  }

  incrementDecodedFrames(): void {
    if (!this.enabled) return
    this.metrics.decodedFrames = (this.metrics.decodedFrames || 0) + 1
  }

  incrementErrorCount(): void {
    if (!this.enabled) return
    this.metrics.errorCount = (this.metrics.errorCount || 0) + 1
  }

  recordMemoryUsage(): void {
    if (!this.enabled) return

    try {
      // Try to get memory info if available (Chrome)
      if ('memory' in performance) {
        const { memory } = performance as {
          memory: { usedJSHeapSize: number; totalJSHeapSize: number }
        }
        this.metrics.memoryUsage = {
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
        }
      }
    } catch {
      // Memory API not available
    }
  }

  calculateAverageFrameTime(): void {
    if (!this.enabled) return

    const totalTime = this.metrics.decodeTime || 0
    const frameCount = this.metrics.decodedFrames || 0

    if (frameCount > 0) {
      this.metrics.averageFrameTime = totalTime / frameCount
    }
  }

  getMetrics(): PerformanceMetrics {
    this.calculateAverageFrameTime()
    this.recordMemoryUsage()

    return {
      parseTime: this.metrics.parseTime || 0,
      initTime: this.metrics.initTime || 0,
      decodeTime: this.metrics.decodeTime || 0,
      seekTime: this.metrics.seekTime || 0,
      totalSamples: this.metrics.totalSamples || 0,
      decodedFrames: this.metrics.decodedFrames || 0,
      errorCount: this.metrics.errorCount || 0,
      averageFrameTime: this.metrics.averageFrameTime || 0,
      memoryUsage: this.metrics.memoryUsage,
    }
  }

  reset(): void {
    this.metrics = {}
    this.timers.clear()
  }

  formatMetrics(): string {
    const metrics = this.getMetrics()

    const lines = [
      '=== MOV Demuxer Performance Metrics ===',
      `Parse Time: ${metrics.parseTime.toFixed(2)}ms`,
      `Init Time: ${metrics.initTime.toFixed(2)}ms`,
      `Total Decode Time: ${metrics.decodeTime.toFixed(2)}ms`,
      `Total Seek Time: ${metrics.seekTime.toFixed(2)}ms`,
      `Total Samples: ${metrics.totalSamples}`,
      `Decoded Frames: ${metrics.decodedFrames}`,
      `Error Count: ${metrics.errorCount}`,
      `Average Frame Time: ${metrics.averageFrameTime.toFixed(2)}ms`,
    ]

    if (metrics.memoryUsage) {
      lines.push(
        `Memory Used: ${(metrics.memoryUsage.used / 1024 / 1024).toFixed(2)}MB`,
        `Memory Total: ${(metrics.memoryUsage.total / 1024 / 1024).toFixed(2)}MB`,
      )
    }

    // Calculate FPS if we have frame data
    if (metrics.averageFrameTime > 0) {
      const fps = 1000 / metrics.averageFrameTime
      lines.push(`Average FPS: ${fps.toFixed(2)}`)
    }

    return lines.join('\n')
  }

  log(): void {
    if (!this.enabled) return
    console.info(this.formatMetrics())
  }
}

/**
 * Decorator for measuring function execution time
 */
export function measureTime(monitor: PerformanceMonitor, timerName: string) {
  return function (
    target: unknown,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const method = descriptor.value

    descriptor.value = async function (...args: unknown[]) {
      monitor.startTimer(timerName)
      try {
        const result = await method.apply(this, args)
        const duration = monitor.endTimer(timerName)

        // Record the duration based on timer name
        switch (timerName) {
          case 'parse': {
            monitor.recordParseTime(duration)
            break
          }
          case 'init': {
            monitor.recordInitTime(duration)
            break
          }
          case 'decode': {
            monitor.recordDecodeTime(duration)
            break
          }
          case 'seek': {
            monitor.recordSeekTime(duration)
            break
          }
        }

        return result
      } catch (error) {
        monitor.endTimer(timerName)
        monitor.incrementErrorCount()
        throw error
      }
    }

    return descriptor
  }
}

/**
 * Simple FPS counter for real-time monitoring
 */
export class FPSCounter {
  private frameCount = 0
  private lastTime = 0
  private fps = 0
  private updateInterval = 1000 // Update FPS every second

  update(): number {
    this.frameCount++
    const currentTime = performance.now()

    if (currentTime - this.lastTime >= this.updateInterval) {
      this.fps = (this.frameCount * 1000) / (currentTime - this.lastTime)
      this.frameCount = 0
      this.lastTime = currentTime
    }

    return this.fps
  }

  getFPS(): number {
    return this.fps
  }

  reset(): void {
    this.frameCount = 0
    this.lastTime = performance.now()
    this.fps = 0
  }
}
