import os from 'node:os'

import { env } from './env.js'
import type { StorageConfig } from './src/core/storage/interfaces.js'

export interface BuilderConfig {
  // 存储配置
  storage: StorageConfig

  // 构建器选项
  options: {
    // 默认并发限制
    defaultConcurrency: number

    // 最大照片数量限制
    maxPhotos: number

    // 支持的图片格式（可以覆盖默认的 SUPPORTED_FORMATS）
    supportedFormats?: Set<string>

    // Live Photo 检测是否启用
    enableLivePhotoDetection: boolean

    // 是否启用进度显示
    showProgress: boolean

    // 是否在构建完成后显示详细统计
    showDetailedStats: boolean
  }

  // 日志配置
  logging: {
    // 是否启用详细日志
    verbose: boolean

    // 日志级别：'info' | 'warn' | 'error' | 'debug'
    level: 'info' | 'warn' | 'error' | 'debug'

    // 是否将日志输出到文件
    outputToFile: boolean

    // 日志文件路径（如果 outputToFile 为 true）
    logFilePath?: string
  }

  // 性能优化配置
  performance: {
    // Worker 池配置
    worker: {
      // 最大 Worker 数量
      maxWorkers: number

      // Worker 超时时间（毫秒）
      timeout: number
    }

    // 内存使用限制（MB）
    memoryLimit: number

    // 是否启用缓存
    enableCache: boolean
  }
}

export const defaultBuilderConfig: BuilderConfig = {
  storage: {
    provider: 's3',
    bucket: env.S3_BUCKET_NAME,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    prefix: env.S3_PREFIX,
    customDomain: env.S3_CUSTOM_DOMAIN,
  },

  options: {
    defaultConcurrency: 10,
    maxPhotos: 10000,
    enableLivePhotoDetection: true,
    showProgress: true,
    showDetailedStats: true,
  },

  logging: {
    verbose: false,
    level: 'info',
    outputToFile: false,
  },

  performance: {
    worker: {
      maxWorkers: Math.max(1, Math.floor(os.cpus().length / 2)),
      timeout: 30000, // 30 seconds
    },
    memoryLimit: 512, // 512MB
    enableCache: true,
  },
}

// 用户可以在这里自定义配置
export const builderConfig: BuilderConfig = {
  ...defaultBuilderConfig,
  // 用户自定义配置可以在这里覆盖默认配置
  // 例如：
  // options: {
  //   ...defaultBuilderConfig.options,
  //   defaultConcurrency: 8,
  //   maxPhotos: 5000,
  // },
  // logging: {
  //   ...defaultBuilderConfig.logging,
  //   verbose: true,
  //   level: 'debug',
  // },

  // 如果要使用 GitHub 存储，取消注释下面的配置：
  // storage: {
  //   provider: 'github',
  //   github: {
  //     owner: 'your-username',
  //     repo: 'your-photo-repo',
  //     branch: 'main',
  //     token: process.env.GITHUB_TOKEN,
  //     path: 'photos',
  //     useRawUrl: true,
  //   },
  // },
}
