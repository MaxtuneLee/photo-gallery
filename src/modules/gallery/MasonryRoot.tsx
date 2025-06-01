import { useAtom, useAtomValue } from 'jotai'
import { m } from 'motion/react'
import { useCallback, useMemo, useRef } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { photoLoader } from '~/data/photos'
import { usePhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import type { PhotoManifest } from '~/types/photo'

import { siteConfig } from '../../../config/site.config'
import { Masonry } from './Masonic'
import { PhotoMasonryItem } from './PhotoMasonryItem'

const data = photoLoader.getPhotos()

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
    <div>
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
        columnGutter={16}
        rowGutter={16}
        itemHeightEstimate={400}
        itemKey={(data, _index) => {
          if (data instanceof MasonryHeaderItem) {
            return 'header'
          }
          return (data as PhotoManifest).id
        }}
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
        layout
        whileHover={{
          scale: 1.02,
          transition: { duration: 0.2 },
        }}
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

const numberFormatter = new Intl.NumberFormat('zh-CN')
const allTags = photoLoader.getAllTags()
const MasonryHeaderMasonryItem = ({ width }: { width: number }) => {
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)

  const setSortOrder = (order: 'asc' | 'desc') => {
    setGallerySetting({
      ...gallerySetting,
      sortOrder: order,
    })
  }

  const toggleTag = (tag: string) => {
    const newSelectedTags = gallerySetting.selectedTags.includes(tag)
      ? gallerySetting.selectedTags.filter((t) => t !== tag)
      : [...gallerySetting.selectedTags, tag]

    setGallerySetting({
      ...gallerySetting,
      selectedTags: newSelectedTags,
    })
  }

  const clearAllTags = () => {
    setGallerySetting({
      ...gallerySetting,
      selectedTags: [],
    })
  }

  return (
    <div
      className="border-border bg-material-medium w-full overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl"
      style={{ width }}
    >
      <div className="relative">
        {/* Decorative gradient bar */}
        <div className="to-accent absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-500" />

        {/* Decorative corner elements */}
        <div className="absolute -top-1 -left-1 block size-3 border-t-2 border-l-2 border-blue-500" />
        <div className="absolute -top-1 -right-1 block size-3 border-t-2 border-r-2 border-blue-500" />

        <div className="relative p-6">
          {/* Main header section */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex shrink-0 items-center gap-4">
              <div className="to-accent flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 shadow-lg">
                <i className="i-mingcute-camera-2-line size-6 text-white" />
              </div>
              <div>
                <p className="text-text-secondary mt-1 text-sm">
                  {numberFormatter.format(data?.length || 0)} 张照片
                </p>
                <p className="text-text-secondary text-sm">
                  {siteConfig.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="bg-fill hover:bg-fill-hover rounded-full p-2 transition-colors"
                onClick={() =>
                  window.open(
                    'https://github.com/MaxtuneLee/photo-gallery',
                    '_blank',
                  )
                }
                title="查看 GitHub 仓库"
              >
                <i className="i-mingcute-github-line size-4" />
              </Button>

              {/* 标签筛选按钮 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="bg-fill hover:bg-fill-hover relative rounded-full p-2 transition-colors"
                    title="标签筛选"
                  >
                    <i className="i-mingcute-tag-line size-4" />
                    {gallerySetting.selectedTags.length > 0 && (
                      <span className="bg-accent absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs text-white">
                        {gallerySetting.selectedTags.length}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  className="max-h-80 w-56 overflow-y-auto"
                >
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>标签筛选</span>
                    {gallerySetting.selectedTags.length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={clearAllTags}
                        className="h-6 px-2 text-xs"
                      >
                        清除全部
                      </Button>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {allTags.length === 0 ? (
                    <div className="text-text-secondary px-2 py-3 text-center text-sm">
                      暂无标签
                    </div>
                  ) : (
                    allTags.map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag}
                        checked={gallerySetting.selectedTags.includes(tag)}
                        onCheckedChange={() => toggleTag(tag)}
                      >
                        {tag}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 排序按钮 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="bg-fill hover:bg-fill-hover rounded-full p-2 transition-colors"
                  >
                    {gallerySetting.sortOrder === 'desc' ? (
                      <i className="i-mingcute-sort-descending-line size-4" />
                    ) : (
                      <i className="i-mingcute-sort-ascending-line size-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>根据拍摄日期排序</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setSortOrder('desc')}
                    className={
                      gallerySetting.sortOrder === 'desc' ? 'bg-accent/10' : ''
                    }
                  >
                    <i className="i-mingcute-sort-descending-line mr-2 size-4" />
                    <span>最新优先</span>
                    {gallerySetting.sortOrder === 'desc' && (
                      <i className="i-mingcute-check-line text-accent ml-auto size-4" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortOrder('asc')}
                    className={
                      gallerySetting.sortOrder === 'asc' ? 'bg-accent/10' : ''
                    }
                  >
                    <i className="i-mingcute-sort-ascending-line mr-2 size-4" />
                    <span>最早优先</span>
                    {gallerySetting.sortOrder === 'asc' && (
                      <i className="i-mingcute-check-line text-accent ml-auto size-4" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Separator line */}
          <div className="dark:via-material-medium mb-4 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />

          {/* Bottom info section */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <i className="i-mingcute-calendar-line text-text-secondary size-4" />
              <span className="text-text-secondary">构建于</span>
            </div>

            <div className="text-text-secondary flex items-center gap-2">
              <i className="i-tabler-calendar size-4" />
              <span>
                {new Date(BUILT_DATE).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
