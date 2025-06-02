# Blob URL 内存泄漏防护指南

## 问题概述

`URL.createObjectURL()` 创建的 blob URL 需要手动释放，否则会造成内存泄漏。本指南提供了在本项目中正确管理 blob URL 的最佳实践。

## 现有问题和修复

### ✅ 已修复的问题

1. **webgl-preview.tsx**: 使用新的 `useBlobUrl` hook 自动管理 blob URL
2. **image-loader-manager.ts**: 添加了对普通图片 blob URL 的追踪和清理
3. **video-converter.ts**: 
   - 使用通用 LRU 缓存类管理视频转换结果
   - 在 LRU 缓存中正确清理过期的视频 URL
   - 增强了缓存替换时的清理逻辑
   - 添加了更详细的调试日志和错误处理
4. **heic-converter.ts**: 
   - 新增 LRU 缓存支持，避免重复转换相同文件
   - 自动管理转换结果的 blob URL
   - 提供了专门的缓存管理 API
5. **lru-cache.ts**: 新增通用 LRU 缓存类，支持自定义清理函数

### 📝 最佳实践

#### 1. 使用提供的工具函数

```typescript
// ✅ 推荐：使用 useBlobUrl hook
import { useBlobUrl } from '~/lib/blob-url-manager'

function MyComponent() {
  const [file, setFile] = useState<File | null>(null)
  const blobUrl = useBlobUrl(file) // 自动管理生命周期
  
  return <img src={blobUrl} />
}

// ✅ 推荐：使用通用 LRU 缓存
import { LRUCache } from '~/lib/lru-cache'

const myCache = new LRUCache<string, { url: string }>(
  10,
  (value, key, reason) => {
    URL.revokeObjectURL(value.url)
    console.info(`Cleaned up ${key}: ${reason}`)
  }
)
```

#### 2. 缓存管理

**视频转换缓存:**
```typescript
import { 
  clearVideoCache, 
  removeCachedVideo, 
  getVideoCacheStats 
} from '~/lib/video-converter'

// 清理特定视频缓存
removeCachedVideo('video-url')

// 清理所有视频缓存
clearVideoCache()

// 获取缓存统计信息
const stats = getVideoCacheStats()
console.log(`缓存大小: ${stats.size}/${stats.maxSize}`)
```

**HEIC 转换缓存:**
```typescript
import { 
  clearHeicCache, 
  removeHeicCacheByFile,
  getHeicCacheStats 
} from '~/lib/heic-converter'

// 清理特定文件的缓存
removeHeicCacheByFile(file, { quality: 0.8, format: 'image/jpeg' })

// 清理所有 HEIC 缓存
clearHeicCache()

// 获取缓存统计
const stats = getHeicCacheStats()
```

#### 3. 手动管理的注意事项

如果必须手动管理，请确保：

```typescript
// ✅ 正确的手动管理
useEffect(() => {
  if (!blob) return
  
  const url = URL.createObjectURL(blob)
  setImageUrl(url)
  
  return () => {
    URL.revokeObjectURL(url) // 清理函数中释放
  }
}, [blob])

// ✅ 组件卸载时的清理
useEffect(() => {
  return () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
    }
  }
}, [])
```

#### 4. 常见错误模式

```typescript
// ❌ 错误：没有清理
const blobUrl = useMemo(() => {
  return file ? URL.createObjectURL(file) : null
}, [file])

// ❌ 错误：在错误的时机清理
useEffect(() => {
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl) // 立即清理，URL 无法使用
  }
}, [blobUrl])

// ❌ 错误：缺少依赖项追踪
useEffect(() => {
  const url = URL.createObjectURL(file)
  return () => URL.revokeObjectURL(url)
}, []) // 缺少 file 依赖
```

## 内存管理细节

### 通用 LRU 缓存 (Generic LRU Cache)

新的通用 LRU 缓存类提供了以下特性：

- **泛型支持**: 可以缓存任何类型的数据
- **自定义清理**: 支持自定义清理函数，在项目被移除时执行
- **自动管理**: LRU 算法自动管理缓存容量
- **React Hook**: 提供 `useLRUCache` hook 用于组件级别的缓存管理

### 视频转换缓存

- **缓存容量**: 默认最多缓存 10 个转换结果
- **自动清理**: 当缓存达到上限时，自动清理最久未使用的视频 URL
- **替换清理**: 当相同 key 的视频被替换时，自动清理旧的 URL
- **手动清理**: 提供 API 手动清理特定或所有缓存项

### HEIC 转换缓存

- **智能缓存键**: 基于文件大小、类型和转换选项生成唯一键
- **缓存容量**: 默认最多缓存 5 个转换结果（图片文件通常较大）
- **避免重复转换**: 相同文件和选项的转换会直接返回缓存结果
- **自动清理**: 缓存满时自动清理最久未使用的转换结果

### 错误处理

- 所有 `URL.revokeObjectURL` 调用都包装在 try-catch 中
- 提供详细的错误日志和清理原因追踪
- 即使清理失败也不会影响正常业务流程

## 检查清单

在添加新的 `URL.createObjectURL` 使用时，请确认：

- [ ] 是否在合适的时机调用了 `URL.revokeObjectURL`
- [ ] 是否在组件卸载时清理了所有创建的 URL
- [ ] 是否在 blob/file 变更时清理了旧的 URL
- [ ] 是否考虑使用提供的工具函数来简化管理
- [ ] 对于缓存场景，是否使用了通用 LRU 缓存类
- [ ] 是否实现了适当的缓存清理机制
- [ ] 是否添加了适当的错误处理

## 相关文件

- `src/lib/lru-cache.ts` - 通用 LRU 缓存类（新增）
- `src/lib/blob-url-manager.ts` - 工具函数和 hooks
- `src/lib/image-loader-manager.ts` - 图片加载管理
- `src/lib/video-converter.ts` - 视频转换缓存（使用通用 LRU）
- `src/lib/heic-converter.ts` - HEIC 图片转换（新增缓存支持）

## 调试技巧

### 浏览器内存监控

1. 打开 Chrome DevTools
2. 前往 Memory 标签
3. 查看 "Detached HTMLImageElement" 或类似的泄漏对象
4. 使用 Performance 标签监控内存增长趋势

### 缓存调试

**视频缓存监控:**
```typescript
import { getVideoCacheStats } from '~/lib/video-converter'

console.log('Video cache stats:', getVideoCacheStats())
```

**HEIC 缓存监控:**
```typescript
import { getHeicCacheStats } from '~/lib/heic-converter'

console.log('HEIC cache stats:', getHeicCacheStats())
```

**通用缓存监控:**
```typescript
import { LRUCache } from '~/lib/lru-cache'

const cache = new LRUCache(10, (value, key, reason) => {
  console.log(`Cache cleanup: ${key} - ${reason}`)
})

// 监控缓存状态
setInterval(() => {
  const stats = cache.getStats()
  if (stats.size > 0) {
    console.log(`Cache: ${stats.size}/${stats.maxSize} items`)
  }
}, 5000)
``` 