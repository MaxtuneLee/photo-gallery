// 重新导出适配器中的函数以保持 API 兼容性
// 推荐使用新的 StorageManager API，这些函数将在未来版本中被弃用

export {
  detectLivePhotos,
  generateS3Url,
  getImageFromS3,
  listAllFilesFromS3,
  listImagesFromS3,
} from '../storage/adapters.js'
