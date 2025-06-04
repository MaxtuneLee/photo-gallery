import type { WebGLImageViewerRef } from '@photo-gallery/webgl-viewer'
import { WebGLImageViewer } from '@photo-gallery/webgl-viewer'
import { m, useAnimationControls } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  MenuItemSeparator,
  MenuItemText,
  useShowContextMenu,
} from '~/atoms/context-menu'
import { clsxm } from '~/lib/cn'
import { canUseWebGL } from '~/lib/feature'
import { ImageLoaderManager } from '~/lib/image-loader-manager'
import { Spring } from '~/lib/spring'

import { LivePhoto } from './LivePhoto'
import type { LoadingIndicatorRef } from './LoadingIndicator'
import { LoadingIndicator } from './LoadingIndicator'

interface ProgressiveImageProps {
  src: string
  thumbnailSrc?: string

  alt: string
  width?: number
  height?: number
  className?: string
  onError?: () => void
  onProgress?: (progress: number) => void
  onZoomChange?: (isZoomed: boolean) => void
  onBlobSrcChange?: (blobSrc: string | null) => void

  enableZoom?: boolean
  enablePan?: boolean
  maxZoom?: number
  minZoom?: number

  isCurrentImage?: boolean

  // Live Photo 相关 props
  isLivePhoto?: boolean
  livePhotoVideoUrl?: string
}

export const ProgressiveImage = ({
  src,
  thumbnailSrc,

  alt,
  className,

  onError,
  onProgress,
  onZoomChange,
  onBlobSrcChange,

  maxZoom = 20,
  minZoom = 1,
  isCurrentImage = false,

  // Live Photo props
  isLivePhoto = false,
  livePhotoVideoUrl,
}: ProgressiveImageProps) => {
  const [blobSrc, setBlobSrc] = useState<string | null>(null)
  const [highResLoaded, setHighResLoaded] = useState(false)
  const [error, setError] = useState(false)

  const thumbnailRef = useRef<HTMLImageElement>(null)
  const transformRef = useRef<WebGLImageViewerRef>(null)
  const thumbnailAnimateController = useAnimationControls()
  const loadingIndicatorRef = useRef<LoadingIndicatorRef>(null)
  const imageLoaderManagerRef = useRef<ImageLoaderManager | null>(null)

  useEffect(() => {
    if (highResLoaded || error || !isCurrentImage) return

    // Create new image loader manager
    const imageLoaderManager = new ImageLoaderManager()
    imageLoaderManagerRef.current = imageLoaderManager

    function cleanup() {
      setHighResLoaded(false)
      setBlobSrc(null)
      setError(false)
      onBlobSrcChange?.(null)

      // Reset loading indicator
      loadingIndicatorRef.current?.resetLoadingState()

      // Reset transform when image changes
      if (transformRef.current) {
        transformRef.current.resetView()
      }
    }

    const loadImage = async () => {
      try {
        const result = await imageLoaderManager.loadImage(src, {
          onProgress,
          onError,
          onLoadingStateUpdate: (state) => {
            loadingIndicatorRef.current?.updateLoadingState(state)
          },
        })

        setBlobSrc(result.blobSrc)
        onBlobSrcChange?.(result.blobSrc)
        setHighResLoaded(true)
      } catch (loadError) {
        console.error('Failed to load image:', loadError)
        setError(true)
      }
    }

    cleanup()
    loadImage()

    return () => {
      imageLoaderManager.cleanup()
    }
  }, [
    highResLoaded,
    error,
    onProgress,
    src,
    onError,
    isCurrentImage,
    onBlobSrcChange,
  ])

  const onTransformed = useCallback(
    (originalScale: number, relativeScale: number) => {
      const isZoomed = Math.abs(relativeScale - 1) > 0.01

      onZoomChange?.(isZoomed)
    },
    [onZoomChange],
  )

  const handleThumbnailLoad = useCallback(() => {
    thumbnailAnimateController.start({
      opacity: 1,
    })
  }, [thumbnailAnimateController])

  const showContextMenu = useShowContextMenu()

  if (error) {
    return (
      <div
        className={clsxm(
          'flex items-center justify-center bg-material-opaque',
          className,
        )}
      >
        <div className="text-text-secondary text-center">
          <i className="i-mingcute-image-line mb-2 text-4xl" />
          <p className="text-sm">图片加载失败</p>
        </div>
      </div>
    )
  }

  return (
    <div className={clsxm('relative overflow-hidden', className)}>
      {/* 缩略图 */}
      {thumbnailSrc && (
        <m.img
          ref={thumbnailRef}
          initial={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          src={thumbnailSrc}
          key={thumbnailSrc}
          alt={alt}
          transition={Spring.presets.smooth}
          className="absolute inset-0 h-full w-full object-contain"
          animate={thumbnailAnimateController}
          onLoad={handleThumbnailLoad}
        />
      )}

      {highResLoaded && blobSrc && (
        <WebGLImageViewer
          ref={transformRef}
          src={blobSrc}
          className="absolute inset-0 h-full w-full"
          initialScale={1}
          minScale={minZoom}
          maxScale={maxZoom}
          limitToBounds={true}
          centerOnInit={true}
          smooth={true}
          onZoomChange={onTransformed}
          debug={import.meta.env.DEV}
          onContextMenu={(e) =>
            showContextMenu(
              [
                new MenuItemText({
                  label: '复制图片',
                  click: async () => {
                    const loadingToast = toast.loading('正在复制图片...')

                    try {
                      // Create a canvas to convert the image to PNG
                      const img = new Image()
                      img.crossOrigin = 'anonymous'

                      await new Promise((resolve, reject) => {
                        img.onload = resolve
                        img.onerror = reject
                        img.src = blobSrc
                      })

                      const canvas = document.createElement('canvas')
                      const ctx = canvas.getContext('2d')
                      canvas.width = img.naturalWidth
                      canvas.height = img.naturalHeight

                      ctx?.drawImage(img, 0, 0)

                      // Convert to PNG blob
                      await new Promise<void>((resolve, reject) => {
                        canvas.toBlob(async (pngBlob) => {
                          try {
                            if (pngBlob) {
                              await navigator.clipboard.write([
                                new ClipboardItem({
                                  'image/png': pngBlob,
                                }),
                              ])
                              resolve()
                            } else {
                              reject(
                                new Error('Failed to convert image to PNG'),
                              )
                            }
                          } catch (error) {
                            reject(error)
                          }
                        }, 'image/png')
                      })

                      toast.dismiss(loadingToast)
                      toast.success('图片已复制到剪贴板')
                    } catch (error) {
                      console.error('Failed to copy image:', error)

                      // Fallback: try to copy the original blob
                      try {
                        const blob = await fetch(blobSrc).then((res) =>
                          res.blob(),
                        )
                        await navigator.clipboard.write([
                          new ClipboardItem({
                            [blob.type]: blob,
                          }),
                        ])
                        toast.dismiss(loadingToast)
                        toast.success('图片已复制到剪贴板')
                      } catch (fallbackError) {
                        console.error(
                          'Fallback copy also failed:',
                          fallbackError,
                        )
                        toast.dismiss(loadingToast)
                        toast.error('复制图片失败，请稍后重试')
                      }
                    }
                  },
                }),
                MenuItemSeparator.default,
                new MenuItemText({
                  label: '下载图片',
                  click: () => {
                    const a = document.createElement('a')
                    a.href = blobSrc
                    a.download = alt
                    a.click()
                  },
                }),
              ],
              e,
            )
          }
        />
      )}

      {/* Live Photo 组件 */}
      {isLivePhoto && livePhotoVideoUrl && imageLoaderManagerRef.current && (
        <LivePhoto
          videoUrl={livePhotoVideoUrl}
          imageLoaderManager={imageLoaderManagerRef.current}
          loadingIndicatorRef={loadingIndicatorRef}
          isCurrentImage={isCurrentImage}
        />
      )}

      {/* 备用图片（当 WebGL 不可用时） */}
      {!canUseWebGL && highResLoaded && blobSrc && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/20">
          <i className="i-mingcute-warning-line mb-2 text-4xl" />
          <span className="text-center text-sm text-white">
            WebGL 不可用，无法渲染图片
          </span>
        </div>
      )}

      {/* 加载指示器 */}
      <LoadingIndicator ref={loadingIndicatorRef} />

      {/* 操作提示 */}
      {!isLivePhoto && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 duration-200 group-hover:opacity-50">
          双击或双指缩放
        </div>
      )}
    </div>
  )
}
