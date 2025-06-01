import { siteConfig } from '@config'
import { useAtom, useAtomValue } from 'jotai'
import { m } from 'motion/react'
import { useCallback, useMemo, useRef } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { photoLoader } from '~/data/photos'
import { usePhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import { useTypeScriptHappyCallback } from '~/hooks/useTypeScriptCallback'
import type { PhotoManifest } from '~/types/photo'

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
      className="overflow-hidden border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
      style={{ width }}
    >
      {/* Header section with clean typography */}
      <div className="px-6 pt-8 pb-6 text-center">
        <div className="from-accent to-accent/80 mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg">
          <i className="i-mingcute-camera-2-line text-2xl text-white" />
        </div>

        <h2 className="mb-1 text-2xl font-semibold text-gray-900 dark:text-white">
          {siteConfig.name}
        </h2>

        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {numberFormatter.format(data?.length || 0)} 张照片
        </p>
      </div>

      {/* Controls section */}
      <div className="px-6 pb-6">
        <div className="flex items-center justify-center gap-3">
          {siteConfig.extra.accessRepo && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 rounded-full border-0 bg-gray-100 transition-all duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              onClick={() =>
                window.open(
                  'https://github.com/Maxtune/photo-gallery',
                  '_blank',
                )
              }
              title="查看 GitHub 仓库"
            >
              <i className="i-mingcute-github-line text-base text-gray-600 dark:text-gray-300" />
            </Button>
          )}

          {/* 标签筛选按钮 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="relative h-10 w-10 rounded-full border-0 bg-gray-100 transition-all duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                title="标签筛选"
              >
                <i className="i-mingcute-tag-line text-base text-gray-600 dark:text-gray-300" />
                {gallerySetting.selectedTags.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white shadow-sm">
                    {gallerySetting.selectedTags.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="center" className="w-64">
              <DropdownMenuLabel className="relative">
                <span>标签筛选</span>
                {gallerySetting.selectedTags.length > 0 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={clearAllTags}
                    className="absolute top-0 right-0 h-6 rounded-md px-2 text-xs"
                  >
                    清除
                  </Button>
                )}
              </DropdownMenuLabel>

              {allTags.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  暂无标签
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {allTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag}
                      checked={gallerySetting.selectedTags.includes(tag)}
                      onCheckedChange={() => toggleTag(tag)}
                    >
                      {tag}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 排序按钮 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-10 rounded-full border-0 bg-gray-100 transition-all duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                title="排序方式"
              >
                {gallerySetting.sortOrder === 'desc' ? (
                  <i className="i-mingcute-sort-descending-line text-base text-gray-600 dark:text-gray-300" />
                ) : (
                  <i className="i-mingcute-sort-ascending-line text-base text-gray-600 dark:text-gray-300" />
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="center" className="w-48">
              <DropdownMenuLabel>排序方式</DropdownMenuLabel>

              <DropdownMenuCheckboxItem
                onClick={() => setSortOrder('desc')}
                icon={<i className="i-mingcute-sort-descending-line" />}
                checked={gallerySetting.sortOrder === 'desc'}
              >
                <span>最新优先</span>
              </DropdownMenuCheckboxItem>

              <DropdownMenuCheckboxItem
                onClick={() => setSortOrder('asc')}
                icon={<i className="i-mingcute-sort-ascending-line" />}
                checked={gallerySetting.sortOrder === 'asc'}
              >
                <span>最早优先</span>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Footer with build date */}
      <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800/50">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <i className="i-mingcute-calendar-line text-sm" />
          <span>
            构建于{' '}
            {new Date(BUILT_DATE).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>
    </div>
  )
}
