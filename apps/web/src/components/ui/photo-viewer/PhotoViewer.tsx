import './PhotoViewer.css'
// Import Swiper styles
import 'swiper/css'
import 'swiper/css/navigation'

import { AnimatePresence, m } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Blurhash } from 'react-blurhash'
import type { Swiper as SwiperType } from 'swiper'
import { Keyboard, Navigation, Virtual } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'

import { PassiveFragment } from '~/components/common/PassiveFragmenet'
import { useMobile } from '~/hooks/useMobile'
import { Spring } from '~/lib/spring'
import type { PhotoManifest } from '~/types/photo'

import { ExifPanel } from './ExifPanel'
import { GalleryThumbnail } from './GalleryThumbnail'
import { ProgressiveImage } from './ProgressiveImage'
import { SharePanel } from './SharePanel'

interface PhotoViewerProps {
  photos: PhotoManifest[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onIndexChange: (index: number) => void
}

export const PhotoViewer = ({
  photos,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange,
}: PhotoViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const swiperRef = useRef<SwiperType | null>(null)
  const [isImageZoomed, setIsImageZoomed] = useState(false)
  const [showExifPanel, setShowExifPanel] = useState(false)
  const [currentBlobSrc, setCurrentBlobSrc] = useState<string | null>(null)
  const isMobile = useMobile()

  const currentPhoto = photos[currentIndex]

  // 当 PhotoViewer 关闭时重置缩放状态和面板状态
  useEffect(() => {
    if (!isOpen) {
      setIsImageZoomed(false)
      setShowExifPanel(false)
      setCurrentBlobSrc(null)
    }
  }, [isOpen])

  // 计算图片的适配尺寸
  const getImageDisplaySize = () => {
    if (!currentPhoto) return { width: 0, height: 0 }

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // 在移动设备上调整最大尺寸
    const maxWidth = isMobile ? viewportWidth * 0.95 : viewportWidth * 0.9
    const maxHeight = isMobile ? viewportHeight * 0.8 : viewportHeight * 0.9

    const imageAspectRatio = currentPhoto.width / currentPhoto.height
    const maxAspectRatio = maxWidth / maxHeight

    let displayWidth: number
    let displayHeight: number

    if (imageAspectRatio > maxAspectRatio) {
      // 图片更宽，以宽度为准
      displayWidth = Math.min(maxWidth, currentPhoto.width)
      displayHeight = displayWidth / imageAspectRatio
    } else {
      // 图片更高，以高度为准
      displayHeight = Math.min(maxHeight, currentPhoto.height)
      displayWidth = displayHeight * imageAspectRatio
    }

    return { width: displayWidth, height: displayHeight }
  }

  // 预加载相邻图片
  useEffect(() => {
    if (!isOpen) return

    const preloadImage = (src: string) => {
      const img = new Image()
      img.src = src
    }

    // 预加载前一张和后一张
    if (currentIndex > 0) {
      preloadImage(photos[currentIndex - 1].originalUrl)
    }
    if (currentIndex < photos.length - 1) {
      preloadImage(photos[currentIndex + 1].originalUrl)
    }
  }, [isOpen, currentIndex, photos])

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1)
    }
  }, [currentIndex, onIndexChange])

  const handleNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      onIndexChange(currentIndex + 1)
    }
  }, [currentIndex, photos.length, onIndexChange])

  // 同步 Swiper 的索引
  useEffect(() => {
    if (swiperRef.current && swiperRef.current.activeIndex !== currentIndex) {
      swiperRef.current.slideTo(currentIndex, 300)
    }
    // 切换图片时重置缩放状态
    setIsImageZoomed(false)
  }, [currentIndex])

  // 当图片缩放状态改变时，控制 Swiper 的触摸行为
  useEffect(() => {
    if (swiperRef.current) {
      if (isImageZoomed) {
        // 图片被缩放时，禁用 Swiper 的触摸滑动
        swiperRef.current.allowTouchMove = false
      } else {
        // 图片未缩放时，启用 Swiper 的触摸滑动
        swiperRef.current.allowTouchMove = true
      }
    }
  }, [isImageZoomed])

  // 处理图片缩放状态变化
  const handleZoomChange = useCallback((isZoomed: boolean) => {
    setIsImageZoomed(isZoomed)
  }, [])

  // 处理 blobSrc 变化
  const handleBlobSrcChange = useCallback((blobSrc: string | null) => {
    setCurrentBlobSrc(blobSrc)
  }, [])

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowLeft': {
          event.preventDefault()
          handlePrevious()
          break
        }
        case 'ArrowRight': {
          event.preventDefault()
          handleNext()
          break
        }
        case 'Escape': {
          event.preventDefault()
          onClose()
          break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handlePrevious, handleNext, onClose, showExifPanel])

  const imageSize = getImageDisplaySize()

  if (!currentPhoto) return null

  return (
    <>
      {/* 固定背景层防止透出 */}
      {/* 交叉溶解的 Blurhash 背景 */}
      <AnimatePresence mode="popLayout">
        {isOpen && (
          <PassiveFragment>
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={Spring.presets.smooth}
              className="bg-material-opaque fixed inset-0"
            />
            <m.div
              key={currentPhoto.blurhash}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={Spring.presets.smooth}
              className="fixed inset-0"
            >
              <Blurhash
                hash={currentPhoto.blurhash}
                width="100%"
                height="100%"
                resolutionX={32}
                resolutionY={32}
                punch={1}
                className="size-fill"
              />
            </m.div>
          </PassiveFragment>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isOpen && (
          <div
            ref={containerRef}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ touchAction: isMobile ? 'manipulation' : 'none' }}
          >
            <div
              className={`flex size-full ${isMobile ? 'flex-col' : 'flex-row'}`}
            >
              <div className="z-[1] flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="group relative flex min-h-0 min-w-0 flex-1">
                  {/* 顶部工具栏 */}
                  <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`pointer-events-none absolute ${isMobile ? 'top-2 right-2 left-2' : 'top-4 right-4 left-4'} z-30 flex items-center justify-between`}
                  >
                    {/* 左侧工具按钮 */}
                    <div className="flex items-center gap-2">
                      {/* 信息按钮 - 在移动设备上显示 */}
                      {isMobile && (
                        <button
                          type="button"
                          className={`bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40 ${showExifPanel ? 'bg-accent' : ''}`}
                          onClick={() => setShowExifPanel(!showExifPanel)}
                        >
                          <i className="i-mingcute-information-line" />
                        </button>
                      )}
                    </div>

                    {/* 右侧按钮组 */}
                    <div className="flex items-center gap-2">
                      {/* 分享按钮 */}
                      <SharePanel
                        photo={currentPhoto}
                        blobSrc={currentBlobSrc || undefined}
                        trigger={
                          <button
                            type="button"
                            className="bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40"
                            title="分享照片"
                          >
                            <i className="i-mingcute-share-2-line" />
                          </button>
                        }
                      />

                      {/* 关闭按钮 */}
                      <button
                        type="button"
                        className="bg-material-ultra-thick pointer-events-auto flex size-8 items-center justify-center rounded-full text-white backdrop-blur-2xl duration-200 hover:bg-black/40"
                        onClick={onClose}
                      >
                        <i className="i-mingcute-close-line" />
                      </button>
                    </div>
                  </m.div>

                  {/* Swiper 容器 */}
                  <Swiper
                    modules={[Navigation, Keyboard, Virtual]}
                    spaceBetween={0}
                    slidesPerView={1}
                    initialSlide={currentIndex}
                    virtual
                    keyboard={{
                      enabled: true,
                      onlyInViewport: true,
                    }}
                    navigation={{
                      prevEl: '.swiper-button-prev-custom',
                      nextEl: '.swiper-button-next-custom',
                    }}
                    onSwiper={(swiper) => {
                      swiperRef.current = swiper
                      // 初始化时确保触摸滑动是启用的
                      swiper.allowTouchMove = !isImageZoomed
                    }}
                    onSlideChange={(swiper) => {
                      onIndexChange(swiper.activeIndex)
                    }}
                    className="h-full w-full"
                    style={{ touchAction: isMobile ? 'pan-x' : 'pan-y' }}
                  >
                    {photos.map((photo, index) => {
                      const isCurrentImage = index === currentIndex
                      return (
                        <SwiperSlide
                          key={photo.id}
                          className="flex items-center justify-center"
                          virtualIndex={index}
                        >
                          <m.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            className="relative flex h-full w-full items-center justify-center"
                          >
                            <ProgressiveImage
                              isCurrentImage={isCurrentImage}
                              src={photo.originalUrl}
                              thumbnailSrc={photo.thumbnailUrl}
                              alt={photo.title}
                              width={
                                isCurrentImage ? imageSize.width : undefined
                              }
                              height={
                                isCurrentImage ? imageSize.height : undefined
                              }
                              className="h-full w-full object-contain"
                              enablePan={
                                isCurrentImage
                                  ? !isMobile || isImageZoomed
                                  : true
                              }
                              enableZoom={true}
                              onZoomChange={
                                isCurrentImage ? handleZoomChange : undefined
                              }
                              onBlobSrcChange={
                                isCurrentImage ? handleBlobSrcChange : undefined
                              }
                              // Live Photo props
                              isLivePhoto={photo.isLivePhoto}
                              livePhotoVideoUrl={photo.livePhotoVideoUrl}
                            />
                          </m.div>
                        </SwiperSlide>
                      )
                    })}
                  </Swiper>

                  {/* 自定义导航按钮 */}
                  {currentIndex > 0 && (
                    <button
                      type="button"
                      className={`swiper-button-prev-custom absolute ${isMobile ? 'left-2' : 'left-4'} top-1/2 z-20 flex -translate-y-1/2 items-center justify-center ${isMobile ? 'size-8' : 'size-10'} bg-material-medium rounded-full text-white opacity-0 backdrop-blur-sm duration-200 group-hover:opacity-100 hover:bg-black/40`}
                      onClick={handlePrevious}
                    >
                      <i
                        className={`i-mingcute-left-line ${isMobile ? 'text-lg' : 'text-xl'}`}
                      />
                    </button>
                  )}

                  {currentIndex < photos.length - 1 && (
                    <button
                      type="button"
                      className={`swiper-button-next-custom absolute ${isMobile ? 'right-2' : 'right-4'} top-1/2 z-20 flex -translate-y-1/2 items-center justify-center ${isMobile ? 'size-8' : 'size-10'} bg-material-medium rounded-full text-white opacity-0 backdrop-blur-sm duration-200 group-hover:opacity-100 hover:bg-black/40`}
                    >
                      <i
                        className={`i-mingcute-right-line ${isMobile ? 'text-lg' : 'text-xl'}`}
                      />
                    </button>
                  )}
                </div>

                <GalleryThumbnail
                  currentIndex={currentIndex}
                  photos={photos}
                  onIndexChange={onIndexChange}
                />
              </div>

              {/* ExifPanel - 在桌面端始终显示，在移动端根据状态显示 */}

              {(!isMobile || showExifPanel) && (
                <ExifPanel
                  currentPhoto={currentPhoto}
                  exifData={currentPhoto.exif}
                  onClose={isMobile ? () => setShowExifPanel(false) : undefined}
                />
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
