import { m } from 'motion/react'
import type { FC } from 'react'
import { useEffect, useRef } from 'react'

import { useMobile } from '~/hooks/useMobile'
import { clsxm } from '~/lib/cn'
import type { PhotoManifest } from '~/types/photo'

export const GalleryThumbnail: FC<{
  currentIndex: number
  photos: PhotoManifest[]
  onIndexChange: (index: number) => void
}> = ({ currentIndex, photos, onIndexChange }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([])
  const isMobile = useMobile()

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    const currentThumbnail = thumbnailRefs.current[currentIndex]

    if (scrollContainer && currentThumbnail) {
      const containerWidth = scrollContainer.clientWidth
      const thumbnailLeft = currentThumbnail.offsetLeft
      const thumbnailWidth = currentThumbnail.clientWidth

      const scrollLeft = thumbnailLeft - containerWidth / 2 + thumbnailWidth / 2

      scrollContainer.scrollTo({
        left: scrollLeft,
        behavior: 'smooth',
      })
    }
  }, [currentIndex])

  // 处理鼠标滚轮事件，映射为横向滚动
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const handleWheel = (e: WheelEvent) => {
      // 阻止默认的垂直滚动
      e.preventDefault()

      // 优先使用触控板的横向滚动 (deltaX)
      // 如果没有横向滚动，则将垂直滚动 (deltaY) 转换为横向滚动
      const scrollAmount =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      scrollContainer.scrollLeft += scrollAmount
    }

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      scrollContainer.removeEventListener('wheel', handleWheel)
    }
  }, [])

  return (
    <m.div
      className="bg-material-medium pb-safe z-10 shrink-0 backdrop-blur-3xl"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bg-material-medium backdrop-blur-[70px]">
        <div
          ref={scrollContainerRef}
          className={`gallery-thumbnail-container flex ${isMobile ? 'gap-2' : 'gap-3'} overflow-x-auto ${isMobile ? 'p-3' : 'p-4'} scrollbar-none`}
        >
          {photos.map((photo, index) => (
            <button
              type="button"
              key={photo.id}
              ref={(el) => {
                thumbnailRefs.current[index] = el
              }}
              className={clsxm(
                `flex-shrink-0 ${isMobile ? 'w-12 h-12' : 'w-16 h-16'} rounded-lg overflow-hidden ring-2 transition-all contain-intrinsic-size`,
                index === currentIndex
                  ? 'ring-accent scale-110'
                  : 'ring-transparent hover:ring-accent',
              )}
              onClick={() => onIndexChange(index)}
            >
              <img
                src={photo.thumbnailUrl}
                alt={photo.title}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </m.div>
  )
}
