import consola from 'consola'

// 创建系统化的日志器
export const logger = {
  // 主进程日志
  main: consola.withTag('MAIN'),
  // S3 操作日志
  s3: consola.withTag('S3'),
  // 图片处理日志
  image: consola.withTag('IMAGE'),
  // 缩略图处理日志
  thumbnail: consola.withTag('THUMBNAIL'),
  // Blurhash 处理日志
  blurhash: consola.withTag('BLURHASH'),
  // EXIF 处理日志
  exif: consola.withTag('EXIF'),
  // 文件系统操作日志
  fs: consola.withTag('FS'),
  // Worker 日志（动态创建）
  worker: (id: number) => consola.withTag(`WORKER-${id}`),
}

export type Logger = typeof logger
export type WorkerLogger = ReturnType<typeof logger.worker>
