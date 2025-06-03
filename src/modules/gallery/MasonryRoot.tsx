import { useAtomValue } from 'jotai'
import { AnimatePresence, m } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { RootPortal } from '~/components/ui/portal'
import { useScrollViewElement } from '~/components/ui/scroll-areas/hooks'
import { usePhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import { useTypeScriptHappyCallback } from '~/hooks/useTypeScriptCallback'
import { Spring } from '~/lib/spring'
import type { PhotoManifest } from '~/types/photo'

import { ActionGroup } from './ActionGroup'
import { Masonry } from './Masonic'
import { MasonryHeaderMasonryItem } from './MasonryHeaderMasonryItem'
import { PhotoMasonryItem } from './PhotoMasonryItem'

class MasonryHeaderItem {
  static default = new MasonryHeaderItem()
}

type MasonryItemType = PhotoManifest | MasonryHeaderItem

const FIRST_SCREEN_ITEMS_COUNT = 15

export const MasonryRoot = () => {
  const { sortOrder, selectedTags } = useAtomValue(gallerySettingAtom)
  const hasAnimatedRef = useRef(false)

  const photos = usePhotos()

  const photoViewer = usePhotoViewer()

  return (
    <div className="p-1 lg:p-0">
      <FloatingActionBar />
      <Masonry<MasonryItemType>
        key={`${sortOrder}-${selectedTags.join(',')}`}
        items={useMemo(() => [MasonryHeaderItem.default, ...photos], [photos])}
        render={useCallback(
          (props) => (
            <MasonryItem
              {...props}
              onPhotoClick={photoViewer.openViewer}
              photos={photos}
              hasAnimated={hasAnimatedRef.current}
              onAnimationComplete={() => {
                hasAnimatedRef.current = true
              }}
            />
          ),
          [photoViewer.openViewer, photos],
        )}
        columnWidth={300}
        columnGutter={4}
        rowGutter={4}
        itemHeightEstimate={400}
        itemKey={useTypeScriptHappyCallback((data, _index) => {
          if (data instanceof MasonryHeaderItem) {
            return 'header'
          }
          return (data as PhotoManifest).id
        }, [])}
      />
    </div>
  )
}

export const MasonryItem = ({
  data,
  width,
  index,
  onPhotoClick,
  photos,
  hasAnimated,
  onAnimationComplete,
}: {
  data: MasonryItemType
  width: number
  index: number
  onPhotoClick: (index: number, element?: HTMLElement) => void
  photos: PhotoManifest[]
  hasAnimated: boolean
  onAnimationComplete: () => void
}) => {
  // 为每个 item 生成唯一的 key 用于追踪
  const itemKey = useMemo(() => {
    if (data instanceof MasonryHeaderItem) {
      return 'header'
    }
    return (data as PhotoManifest).id
  }, [data])

  // 只对第一屏的 items 做动画，且只在首次加载时
  const shouldAnimate = !hasAnimated && index < FIRST_SCREEN_ITEMS_COUNT

  // 计算动画延迟
  const delay = shouldAnimate
    ? data instanceof MasonryHeaderItem
      ? 0
      : Math.min(index * 0.05, 0.8)
    : 0

  // Framer Motion 动画变体
  const itemVariants = {
    hidden: {
      opacity: 0,
      y: 30,
      scale: 0.95,
      filter: 'blur(4px)',
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: {
        duration: shouldAnimate ? 0.8 : 0,
        ease: [0.16, 1, 0.3, 1], // cubic-bezier(0.16, 1, 0.3, 1)
        delay,
      },
    },
  }

  if (data instanceof MasonryHeaderItem) {
    return (
      <m.div
        variants={shouldAnimate ? itemVariants : undefined}
        initial={shouldAnimate ? 'hidden' : 'visible'}
        animate="visible"
        onAnimationComplete={shouldAnimate ? onAnimationComplete : undefined}
      >
        <MasonryHeaderMasonryItem width={width} />
      </m.div>
    )
  } else {
    return (
      <m.div
        key={itemKey}
        variants={shouldAnimate ? itemVariants : undefined}
        initial={shouldAnimate ? 'hidden' : 'visible'}
        animate="visible"
      >
        <PhotoMasonryItem
          data={data as PhotoManifest}
          width={width}
          index={index}
          onPhotoClick={onPhotoClick}
          photos={photos}
        />
      </m.div>
    )
  }
}

const FloatingActionBar = () => {
  const [showFloatingActions, setShowFloatingActions] = useState(false)
  const scrollElement = useScrollViewElement()

  useEffect(() => {
    if (!scrollElement) return

    const handleScroll = () => {
      const { scrollTop } = scrollElement

      setShowFloatingActions(scrollTop > 500)
    }

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
    }
  }, [scrollElement])

  return (
    <AnimatePresence>
      <RootPortal>
        {showFloatingActions && (
          <m.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={Spring.presets.snappy}
            className="fixed top-4 left-4 z-50"
          >
            <div className="border-material-opaque rounded-xl border bg-black/60 p-3 shadow-2xl backdrop-blur-[70px]">
              <ActionGroup />
            </div>
          </m.div>
        )}
      </RootPortal>
    </AnimatePresence>
  )
}
