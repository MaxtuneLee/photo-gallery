import cluster from 'node:cluster'
import process from 'node:process'

import { defaultBuilder } from './builder/index.js'
import { logger } from './logger/index.js'
import type { PhotoManifestItem } from './types/photo.js'
import type {
  BatchTaskMessage,
  BatchTaskResult,
  TaskMessage,
  TaskResult,
} from './worker/cluster-pool.js'

// Worker 进程处理逻辑
async function runAsWorker() {
  process.title = 'photo-gallery-builder-worker'
  const workerId = Number.parseInt(process.env.WORKER_ID || '0')

  // 立即注册消息监听器，避免被异步初始化阻塞
  let isInitialized = false
  let storageManager: any
  let imageObjects: any[]
  let existingManifestMap: Map<string, PhotoManifestItem>
  let livePhotoMap: Map<string, any>

  // 初始化函数，只在第一次收到任务时执行
  const initializeWorker = async () => {
    if (isInitialized) return

    // 动态导入所需模块
    const [{ StorageManager }, { builderConfig }, { loadExistingManifest }] =
      await Promise.all([
        import('./storage/index.js'),
        import('@builder'),
        import('./manifest/manager.js'),
      ])

    // 在 worker 中初始化存储管理器和数据
    storageManager = new StorageManager(builderConfig.storage)

    // 获取图片列表（worker 需要知道要处理什么）
    imageObjects = await storageManager.listImages()

    // 获取现有 manifest 和 live photo 信息
    const existingManifest = await loadExistingManifest()
    existingManifestMap = new Map(
      existingManifest.map((item: PhotoManifestItem) => [item.s3Key, item]),
    )

    // 检测 Live Photos
    const allObjects = await storageManager.listAllFiles()
    livePhotoMap = builderConfig.options.enableLivePhotoDetection
      ? await storageManager.detectLivePhotos(allObjects)
      : new Map()

    isInitialized = true
  }

  const handleTask = async (message: TaskMessage): Promise<void> => {
    try {
      // 确保 worker 已初始化
      await initializeWorker()

      // 动态导入 processPhoto（放在这里以避免阻塞消息监听）
      const { processPhoto } = await import('./photo/processor.js')
      const { logger: workerLogger } = await import('./logger/index.js')

      const { taskIndex } = message

      // 根据 taskIndex 获取对应的图片对象
      const obj = imageObjects[taskIndex]
      if (!obj) {
        throw new Error(`Invalid taskIndex: ${taskIndex}`)
      }

      // 转换 StorageObject 到旧的 _Object 格式以兼容现有的 processPhoto 函数
      const legacyObj = {
        Key: obj.key,
        Size: obj.size,
        LastModified: obj.lastModified,
        ETag: obj.etag,
      }

      // 转换 Live Photo Map
      const legacyLivePhotoMap = new Map()
      for (const [key, value] of livePhotoMap) {
        legacyLivePhotoMap.set(key, {
          Key: value.key,
          Size: value.size,
          LastModified: value.lastModified,
          ETag: value.etag,
        })
      }

      // 处理器选项（这些可以作为环境变量传递或使用默认值）
      const processorOptions = {
        isForceMode: process.env.FORCE_MODE === 'true',
        isForceManifest: process.env.FORCE_MANIFEST === 'true',
        isForceThumbnails: process.env.FORCE_THUMBNAILS === 'true',
      }

      // 处理照片
      const result = await processPhoto(
        legacyObj,
        taskIndex,
        workerId,
        imageObjects.length,
        existingManifestMap,
        legacyLivePhotoMap,
        processorOptions,
        workerLogger,
      )

      // 发送结果回主进程
      const response: TaskResult = {
        type: 'result',
        taskId: message.taskId,
        result,
      }

      if (process.send) {
        process.send(response)
      }
    } catch (error) {
      // 发送错误回主进程
      const response: TaskResult = {
        type: 'error',
        taskId: message.taskId,
        error: error instanceof Error ? error.message : String(error),
      }

      if (process.send) {
        process.send(response)
      }
    }
  }

  // 批量任务处理函数
  const handleBatchTask = async (message: BatchTaskMessage): Promise<void> => {
    try {
      // 确保已初始化
      await initializeWorker()

      const results: TaskResult[] = []
      const taskPromises: Promise<void>[] = []

      // 创建所有任务的并发执行 Promise
      for (const task of message.tasks) {
        const taskPromise = (async () => {
          try {
            const obj = imageObjects[task.taskIndex]

            // 转换 StorageObject 到旧的 _Object 格式以兼容现有的 processPhoto 函数
            const legacyObj = {
              Key: obj.key,
              Size: obj.size,
              LastModified: obj.lastModified,
              ETag: obj.etag,
            }

            // 转换 Live Photo Map
            const legacyLivePhotoMap = new Map()
            for (const [key, value] of livePhotoMap) {
              legacyLivePhotoMap.set(key, {
                Key: value.key,
                Size: value.size,
                LastModified: value.lastModified,
                ETag: value.etag,
              })
            }

            // 处理照片
            const { processPhoto } = await import('./photo/processor.js')
            const result = await processPhoto(
              legacyObj,
              task.taskIndex,
              workerId,
              imageObjects.length,
              existingManifestMap,
              legacyLivePhotoMap,
              {
                isForceMode: process.env.FORCE_MODE === 'true',
                isForceManifest: process.env.FORCE_MANIFEST === 'true',
                isForceThumbnails: process.env.FORCE_THUMBNAILS === 'true',
              },
              logger,
            )

            // 添加成功结果
            results.push({
              type: 'result',
              taskId: task.taskId,
              result,
            })
          } catch (error) {
            // 添加错误结果
            results.push({
              type: 'error',
              taskId: task.taskId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })()

        taskPromises.push(taskPromise)
      }

      // 等待所有任务完成
      await Promise.all(taskPromises)

      // 发送批量结果回主进程
      const response: BatchTaskResult = {
        type: 'batch-result',
        results,
      }

      if (process.send) {
        process.send(response)
      }
    } catch (error) {
      // 如果批量处理失败，为每个任务发送错误结果
      const results: TaskResult[] = message.tasks.map((task) => ({
        type: 'error',
        taskId: task.taskId,
        error: error instanceof Error ? error.message : String(error),
      }))

      const response: BatchTaskResult = {
        type: 'batch-result',
        results,
      }

      if (process.send) {
        process.send(response)
      }
    }
  }

  // 立即注册消息监听器
  process.on(
    'message',
    async (
      message:
        | TaskMessage
        | BatchTaskMessage
        | { type: 'shutdown' }
        | { type: 'ping' },
    ) => {
      if (message.type === 'shutdown') {
        process.removeAllListeners('message')
        return
      }

      if (message.type === 'ping') {
        // 响应主进程的 ping，表示 worker 已准备好
        if (process.send) {
          process.send({ type: 'pong', workerId })
        }
        return
      }

      if (message.type === 'batch-task') {
        await handleBatchTask(message)
      } else if (message.type === 'task') {
        await handleTask(message)
      }
    },
  )

  // 错误处理
  process.on('uncaughtException', (error) => {
    console.error('Worker uncaught exception:', error)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    console.error('Worker unhandled rejection:', reason)
    process.exit(1)
  })

  process.on('SIGINT', () => {
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    process.exit(0)
  })

  // 告知主进程 worker 已准备好
  if (process.send) {
    process.send({ type: 'ready', workerId })
  }
}

async function main() {
  // 检查是否作为 cluster worker 运行
  if (
    process.env.CLUSTER_WORKER === 'true' ||
    process.argv.includes('--cluster-worker') ||
    cluster.isWorker
  ) {
    await runAsWorker()
    return
  }

  process.title = 'photo-gallery-builder-main'

  // 解析命令行参数
  const args = new Set(process.argv.slice(2))
  const isForceMode = args.has('--force')
  const isForceManifest = args.has('--force-manifest')
  const isForceThumbnails = args.has('--force-thumbnails')

  // 显示帮助信息
  if (args.has('--help') || args.has('-h')) {
    logger.main.info(`
照片库构建工具 (新版本 - 使用适配器模式)

用法：tsx src/core/cli.ts [选项]

选项：
  --force              强制重新处理所有照片
  --force-manifest     强制重新生成 manifest
  --force-thumbnails   强制重新生成缩略图
  --config             显示当前配置信息
  --help, -h          显示帮助信息

示例：
  tsx src/core/cli.ts                           # 增量更新
  tsx src/core/cli.ts --force                   # 全量更新
  tsx src/core/cli.ts --force-thumbnails        # 强制重新生成缩略图
  tsx src/core/cli.ts --config                  # 显示配置信息

配置：
  在 builder.config.ts 中设置 performance.worker.useClusterMode = true 
  可启用多进程集群模式，发挥多核心优势。
`)
    return
  }

  // 显示配置信息
  if (args.has('--config')) {
    const config = defaultBuilder.getConfig()
    logger.main.info('🔧 当前配置：')
    logger.main.info(`   存储提供商：${config.storage.provider}`)

    switch (config.storage.provider) {
      case 's3': {
        logger.main.info(`   存储桶：${config.storage.bucket}`)
        logger.main.info(`   区域：${config.storage.region || '未设置'}`)
        logger.main.info(`   端点：${config.storage.endpoint || '默认'}`)
        logger.main.info(
          `   自定义域名：${config.storage.customDomain || '未设置'}`,
        )
        logger.main.info(`   前缀：${config.storage.prefix || '无'}`)
        break
      }
      case 'github': {
        logger.main.info(`   仓库所有者：${config.storage.owner}`)
        logger.main.info(`   仓库名称：${config.storage.repo}`)
        logger.main.info(`   分支：${config.storage.branch || 'main'}`)
        logger.main.info(`   路径：${config.storage.path || '无'}`)
        logger.main.info(`   使用原始 URL：${config.storage.useRawUrl || '否'}`)
        break
      }
    }
    logger.main.info(`   默认并发数：${config.options.defaultConcurrency}`)
    logger.main.info(`   最大照片数：${config.options.maxPhotos}`)
    logger.main.info(
      `   Live Photo 检测：${config.options.enableLivePhotoDetection ? '启用' : '禁用'}`,
    )
    logger.main.info(`   Worker 数：${config.performance.worker.workerCount}`)
    logger.main.info(`   Worker 超时：${config.performance.worker.timeout}ms`)
    logger.main.info(
      `   集群模式：${config.performance.worker.useClusterMode ? '启用' : '禁用'}`,
    )
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
  const concurrencyLimit = config.performance.worker.workerCount
  const finalConcurrency = concurrencyLimit ?? config.options.defaultConcurrency
  const processingMode = config.performance.worker.useClusterMode
    ? '多进程集群'
    : '并发线程池'

  logger.main.info(`🚀 运行模式：${runMode}`)
  logger.main.info(`⚡ 最大并发数：${finalConcurrency}`)
  logger.main.info(`🔧 处理模式：${processingMode}`)
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
