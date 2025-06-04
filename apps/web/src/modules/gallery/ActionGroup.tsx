import { siteConfig } from '@config'
import { useAtom } from 'jotai'

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

const allTags = photoLoader.getAllTags()

export const ActionGroup = () => {
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
    <div className="flex items-center justify-center gap-3">
      {siteConfig.extra.accessRepo && (
        <Button
          variant="ghost"
          size="sm"
          className="h-10 w-10 rounded-full border-0 bg-gray-100 transition-all duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
          onClick={() =>
            window.open('https://github.com/Innei/photo-gallery', '_blank')
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
  )
}
