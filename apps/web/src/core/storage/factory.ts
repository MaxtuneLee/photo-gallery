import { env } from '@env'

import type { StorageConfig, StorageProvider } from './interfaces'
import { GitHubStorageProvider } from './providers/github-provider.js'
import { S3StorageProvider } from './providers/s3-provider.js'

export class StorageFactory {
  /**
   * 根据配置创建存储提供商实例
   * @param config 存储配置
   * @returns 存储提供商实例
   */
  static createProvider(config: StorageConfig): StorageProvider {
    switch (config.provider) {
      case 's3': {
        return new S3StorageProvider(config)
      }
      case 'github': {
        return new GitHubStorageProvider(config)
      }
    }
  }

  /**
   * 基于环境变量创建默认的存储提供商
   * @returns 默认存储提供商实例
   */
  static createDefaultProvider(): StorageProvider {
    const config: StorageConfig = {
      provider: 's3',
      bucket: env.S3_BUCKET_NAME,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      prefix: env.S3_PREFIX,
      customDomain: env.S3_CUSTOM_DOMAIN,
    }

    return this.createProvider(config)
  }
}
