import { m, useAnimationControls } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  MenuItemSeparator,
  MenuItemText,
  useShowContextMenu,
} from '~/atoms/context-menu'
import { clsxm } from '~/lib/cn'
import { isMobileDevice } from '~/lib/device-viewport'
import { canUseWebGL } from '~/lib/feature'
import { ImageLoaderManager } from '~/lib/image-loader-manager'
import { Spring } from '~/lib/spring'
import { isWebCodecsSupported } from '~/lib/video-converter'

import type { WebGLImageViewerRef } from '../WebGLImageViewer'
import { WebGLImageViewer } from '../WebGLImageViewer'
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

  // Live Photo 相关状态
  const [isPlayingLivePhoto, setIsPlayingLivePhoto] = useState(false)
  const [livePhotoVideoLoaded, setLivePhotoVideoLoaded] = useState(false)

  const [isConvertingVideo, setIsConvertingVideo] = useState(false)
  const [conversionMethod, setConversionMethod] = useState<string>('')

  const thumbnailRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const transformRef = useRef<WebGLImageViewerRef>(null)
  const thumbnailAnimateController = useAnimationControls()
  const videoAnimateController = useAnimationControls()
  const loadingIndicatorRef = useRef<LoadingIndicatorRef>(null)
  const imageLoaderManagerRef = useRef<ImageLoaderManager | null>(null)

  // Live Photo hover 相关
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [isLongPressing, setIsLongPressing] = useState(false)

  useEffect(() => {
    if (highResLoaded || error || !isCurrentImage) return

    // Create new image loader manager
    const imageLoaderManager = new ImageLoaderManager()
    imageLoaderManagerRef.current = imageLoaderManager

    function cleanup() {
      setHighResLoaded(false)
      setBlobSrc(null)
      setError(false)
      setIsPlayingLivePhoto(false)
      setLivePhotoVideoLoaded(false)

      setIsConvertingVideo(false)
      setConversionMethod('')
      setIsLongPressing(false)

      // Reset loading indicator
      loadingIndicatorRef.current?.resetLoadingState()

      // Clean up timers
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }

      // Reset transform when image changes
      if (transformRef.current) {
        transformRef.current.resetView()
      }

      // Reset video animation
      videoAnimateController.set({ opacity: 0 })
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
        setHighResLoaded(true)

        // 处理 Live Photo 视频（在图片加载完成后）
        if (
          isLivePhoto &&
          livePhotoVideoUrl &&
          !livePhotoVideoLoaded &&
          !isConvertingVideo &&
          videoRef.current
        ) {
          setIsConvertingVideo(true)

          try {
            const videoResult = await imageLoaderManager.processLivePhotoVideo(
              livePhotoVideoUrl,
              videoRef.current,
              {
                onLoadingStateUpdate: (state) => {
                  loadingIndicatorRef.current?.updateLoadingState(state)
                },
              },
            )

            if (videoResult.conversionMethod) {
              setConversionMethod(videoResult.conversionMethod)
            }

            setLivePhotoVideoLoaded(true)
          } catch (videoError) {
            console.error('Failed to process Live Photo video:', videoError)
          } finally {
            setIsConvertingVideo(false)
          }
        }
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
    isLivePhoto,
    livePhotoVideoUrl,
    livePhotoVideoLoaded,
    isConvertingVideo,
  ])

  // Live Photo hover 处理
  const handleBadgeMouseEnter = useCallback(() => {
    if (
      !isLivePhoto ||
      !livePhotoVideoLoaded ||
      isPlayingLivePhoto ||
      isConvertingVideo
    )
      return

    hoverTimerRef.current = setTimeout(async () => {
      setIsPlayingLivePhoto(true)

      // 开始淡入动画
      await videoAnimateController.start({
        opacity: 1,
        transition: { duration: 0.15, ease: 'easeOut' },
      })

      const video = videoRef.current
      if (video) {
        video.currentTime = 0
        video.play()
      }
    }, 200) // 200ms hover 延迟
  }, [
    isLivePhoto,
    livePhotoVideoLoaded,
    isPlayingLivePhoto,
    isConvertingVideo,
    videoAnimateController,
  ])

  const handleBadgeMouseLeave = useCallback(async () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }

    if (isPlayingLivePhoto) {
      const video = videoRef.current
      if (video) {
        video.pause()
        video.currentTime = 0
      }

      // 开始淡出动画
      await videoAnimateController.start({
        opacity: 0,
        transition: { duration: 0.2, ease: 'easeIn' },
      })

      setIsPlayingLivePhoto(false)
    }
  }, [isPlayingLivePhoto, videoAnimateController])

  // 视频播放结束处理
  const handleVideoEnded = useCallback(async () => {
    // 播放结束时淡出
    await videoAnimateController.start({
      opacity: 0,
      transition: { duration: 0.2, ease: 'easeIn' },
    })

    setIsPlayingLivePhoto(false)
  }, [videoAnimateController])

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

  // Live Photo 长按处理（移动端）
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (
        !isLivePhoto ||
        !livePhotoVideoLoaded ||
        isPlayingLivePhoto ||
        isConvertingVideo ||
        e.touches.length > 1 // 多指触摸不触发长按
      )
        return

      longPressTimerRef.current = setTimeout(async () => {
        setIsLongPressing(true)
        setIsPlayingLivePhoto(true)

        // 开始淡入动画
        await videoAnimateController.start({
          opacity: 1,
          transition: { duration: 0.15, ease: 'easeOut' },
        })

        const video = videoRef.current
        if (video) {
          video.currentTime = 0
          video.play()
        }
      }, 500) // 500ms 长按延迟
    },
    [
      isLivePhoto,
      livePhotoVideoLoaded,
      isPlayingLivePhoto,
      isConvertingVideo,
      videoAnimateController,
    ],
  )

  const handleTouchEnd = useCallback(async () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (isLongPressing && isPlayingLivePhoto) {
      setIsLongPressing(false)

      const video = videoRef.current
      if (video) {
        video.pause()
        video.currentTime = 0
      }

      // 开始淡出动画
      await videoAnimateController.start({
        opacity: 0,
        transition: { duration: 0.2, ease: 'easeIn' },
      })

      setIsPlayingLivePhoto(false)
    }
  }, [isLongPressing, isPlayingLivePhoto, videoAnimateController])

  const handleTouchMove = useCallback(() => {
    // 触摸移动时取消长按
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

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
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
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

      {/* Live Photo 视频 */}
      {isLivePhoto && livePhotoVideoUrl && (
        <m.video
          ref={videoRef}
          className="absolute inset-0 z-10 h-full w-full object-contain"
          muted
          playsInline
          onEnded={handleVideoEnded}
          initial={{ opacity: 0 }}
          animate={videoAnimateController}
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

      {/* Live Photo 标识 */}
      {isLivePhoto && (
        <div
          className={clsxm(
            'absolute z-50 flex items-center space-x-1 rounded-xl bg-black/50 px-1 py-1 text-xs text-white cursor-pointer transition-all duration-200 hover:bg-black/70',
            import.meta.env.DEV ? 'top-16 right-4' : 'top-12 lg:top-4 left-4',
          )}
          onMouseEnter={handleBadgeMouseEnter}
          onMouseLeave={handleBadgeMouseLeave}
          title={isMobileDevice ? '长按播放实况照片' : '悬浮播放实况照片'}
        >
          {isConvertingVideo ? (
            <div className="flex items-center gap-1 px-1">
              <i className="i-mingcute-loading-line animate-spin" />
              <span>实况视频转换中</span>
            </div>
          ) : (
            <>
              <img
                className="size-4 invert-100"
                src="data:image/webp;base64,UklGRjICAABXRUJQVlA4WAoAAAAQAAAAHwAAHwAAQUxQSOUBAAABkCPZtmo369zzZPtz1XPEzBAyM4ozMzNbNIoPUmhmdsQ4BDF9iKUBUHwMn6wRRMQEMMEF5D84Ja+68jgFfK9iKqCuDALrL5DZsHOQK2tASvI4OKv6CStDkeU827OgEi1B4O1Virz1DKQo5e5RYHrD197er7enAWfu4BUhcGoTJG3sc2vrl3GLw+bDIAUclS8gmrbjAiAnbSAKb/fj8inzbiCZoQhOQR2x4YxweQaax7FuP6QsTAAWLYIAYUtBzQbcP8rlJ0y34wSoypilKwlw3Kbz+Bz6T97GUZQqs85Os0qcjDZQUPAHlvPjA0razsMFS6N8+saqnI8AeFvD9CdgsbUjQoctglQfofUeeb1NIfpSRbTbYkj2E9mZR/AHl/PtE0razsF5S6N8+sbyfh+hYMOoOKrNOjvNqnEy1kBh5dITptsJAlSlzdJVBDhp03h+Df3Hse4ApCxCABYvhgAxS8DuNbh/UObcQLJDYVRBlfDwADQsRMnrOPgSYlk7Rt7jlonCk4O4fAic2IJrs5GPyeTHEWt1bDkHQmGPBxeAGS2/Bvp/Nk8HDt1BKVbgYQNFXnoPQvFK5aKdz1kWCa7gUf20/XiUKrD6Oj171mQ5swGE0p0CfoX6gDrK6pS86ii/gDDBAQBWUDggJgAAANACAJ0BKiAAIAA+kUSdSqWjoqGoCACwEglpAAA9o6AA/vjPGsAA"
              />
              <span className="mr-1">实况</span>
              {conversionMethod && (
                <span className="rounded bg-white/20 px-1 text-xs">
                  {conversionMethod === 'webcodecs' ? 'WebCodecs' : 'FFmpeg'}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* 操作提示 */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 duration-200 group-hover:opacity-50">
        {isLivePhoto
          ? isConvertingVideo
            ? `正在使用 ${isWebCodecsSupported() ? 'WebCodecs' : 'FFmpeg'} 转换视频格式...`
            : isMobileDevice
              ? '长按播放实况照片 / 双击缩放'
              : '悬浮实况标识播放 / 双击缩放'
          : '双击或双指缩放'}
      </div>
    </div>
  )
}
