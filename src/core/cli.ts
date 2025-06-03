import { defaultBuilder } from './builder/index.js'
import { logger } from './logger/index.js'

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2)
  const isForceMode = args.includes('--force')
  const isForceManifest = args.includes('--force-manifest')
  const isForceThumbnails = args.includes('--force-thumbnails')

  // 解析 --worker 参数
  let concurrencyLimit: number | undefined
  const workerIndex = args.indexOf('--worker')
  if (workerIndex !== -1 && workerIndex + 1 < args.length) {
    const workerValue = Number(args[workerIndex + 1])
    if (!Number.isNaN(workerValue) && workerValue > 0) {
      concurrencyLimit = workerValue
    } else {
      logger.main.warn(
        `无效的 --worker 参数值：${args[workerIndex + 1]}，将使用配置文件中的默认值`,
      )
    }
  }

  // 显示帮助信息
  if (args.includes('--help') || args.includes('-h')) {
    logger.main.info(`
照片库构建工具 (新版本 - 使用适配器模式)

用法：tsx src/core/cli-new.ts [选项]

选项：
  --force              强制重新处理所有照片
  --force-manifest     强制重新生成 manifest
  --force-thumbnails   强制重新生成缩略图
  --worker <数量>      并发 worker 数量 (覆盖配置文件中的默认值)
  --config             显示当前配置信息
  --help, -h          显示帮助信息

示例：
  tsx src/core/cli-new.ts                           # 增量更新
  tsx src/core/cli-new.ts --force                   # 全量更新
  tsx src/core/cli-new.ts --force-thumbnails        # 强制重新生成缩略图
  tsx src/core/cli-new.ts --worker 5                # 使用 5 个并发 worker
  tsx src/core/cli-new.ts --config                  # 显示配置信息
`)
    return
  }

  // 显示配置信息
  if (args.includes('--config')) {
    const config = defaultBuilder.getConfig()
    logger.main.info('🔧 当前配置：')
    logger.main.info(`   存储提供商：${config.storage.provider}`)
    logger.main.info(`   存储桶：${config.storage.bucket}`)
    logger.main.info(`   区域：${config.storage.region || '未设置'}`)
    logger.main.info(`   端点：${config.storage.endpoint || '默认'}`)
    logger.main.info(
      `   自定义域名：${config.storage.customDomain || '未设置'}`,
    )
    logger.main.info(`   前缀：${config.storage.prefix || '无'}`)
    logger.main.info(`   默认并发数：${config.options.defaultConcurrency}`)
    logger.main.info(`   最大照片数：${config.options.maxPhotos}`)
    logger.main.info(
      `   Live Photo 检测：${config.options.enableLivePhotoDetection ? '启用' : '禁用'}`,
    )
    logger.main.info(
      `   最大 Worker 数：${config.performance.worker.maxWorkers}`,
    )
    logger.main.info(`   Worker 超时：${config.performance.worker.timeout}ms`)
    return
  }

  // 确定运行模式
  let runMode = '增量更新'
  if (isForceMode) {
    runMode = '全量更新'
  } else if (isForceManifest && isForceThumbnails) {
    runMode = '强制刷新 manifest 和缩略图'
  } else if (isForceManifest) {
    runMode = '强制刷新 manifest'
  } else if (isForceThumbnails) {
    runMode = '强制刷新缩略图'
  }

  const config = defaultBuilder.getConfig()
  const finalConcurrency = concurrencyLimit ?? config.options.defaultConcurrency

  logger.main.info(`🚀 运行模式：${runMode}`)
  logger.main.info(`⚡ 并发数：${finalConcurrency}`)
  logger.main.info(`🏗️ 使用构建器：PhotoGalleryBuilder (适配器模式)`)

  // 启动构建过程
  await defaultBuilder.buildManifest({
    isForceMode,
    isForceManifest,
    isForceThumbnails,
    concurrencyLimit,
  })
}

// 运行主函数
main().catch((error) => {
  logger.main.error('构建失败：', error)
  throw error
})
