import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { AnimatePresence, m } from 'motion/react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { clsxm } from '~/lib/cn'
import { Spring } from '~/lib/spring'
import type { PhotoManifest } from '~/types/photo'

interface SharePanelProps {
  photo: PhotoManifest
  trigger: React.ReactNode
  blobSrc?: string
}

interface ShareOption {
  id: string
  label: string
  icon: string
  action: () => Promise<void> | void
  color?: string
  bgColor?: string
}

interface SocialShareOption {
  id: string
  label: string
  icon: string
  url: string
  color: string
  bgColor: string
}

// 社交媒体分享选项
const socialOptions: SocialShareOption[] = [
  {
    id: 'twitter',
    label: 'Twitter',
    icon: 'i-mingcute-twitter-fill',
    url: 'https://twitter.com/intent/tweet?text={text}&url={url}',
    color: 'text-white',
    bgColor: 'bg-sky-500',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: 'i-mingcute-facebook-line',
    url: 'https://www.facebook.com/sharer/sharer.php?u={url}',
    color: 'text-white',
    bgColor: 'bg-[#1877F2]',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'i-mingcute-telegram-line',
    url: 'https://t.me/share/url?url={url}&text={text}',
    color: 'text-white',
    bgColor: 'bg-[#0088CC]',
  },
  {
    id: 'weibo',
    label: '微博',
    icon: 'i-mingcute-weibo-line',
    url: 'https://service.weibo.com/share/share.php?url={url}&title={text}',
    color: 'text-white',
    bgColor: 'bg-[#E6162D]',
  },
]

export const SharePanel = ({ photo, trigger, blobSrc }: SharePanelProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const handleNativeShare = useCallback(async () => {
    const shareUrl = window.location.href
    const shareTitle = photo.title || '照片分享'
    const shareText = `查看这张精美的照片：${shareTitle}`

    try {
      // 优先使用 blobSrc（转换后的图片），如果没有则使用 originalUrl
      const imageUrl = blobSrc || photo.originalUrl
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const file = new File([blob], `${photo.title || 'photo'}.jpg`, {
        type: blob.type || 'image/jpeg',
      })

      // 检查是否支持文件分享
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
          files: [file],
        })
      } else {
        // 不支持文件分享，只分享链接
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        })
      }
      setIsOpen(false)
    } catch {
      // 如果分享失败，复制链接
      await navigator.clipboard.writeText(shareUrl)
      toast.success('链接已复制到剪贴板')
      setIsOpen(false)
    }
  }, [photo.title, blobSrc, photo.originalUrl])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('链接已复制到剪贴板')
      setIsOpen(false)
    } catch {
      toast.error('复制失败')
    }
  }, [])

  const handleSocialShare = useCallback(
    (url: string) => {
      const shareUrl = encodeURIComponent(window.location.href)
      const shareTitle = encodeURIComponent(photo.title || '照片分享')
      const shareText = encodeURIComponent(
        `查看这张精美的照片：${photo.title || '照片分享'}`,
      )

      const finalUrl = url
        .replace('{url}', shareUrl)
        .replace('{title}', shareTitle)
        .replace('{text}', shareText)

      window.open(finalUrl, '_blank', 'width=600,height=400')
      setIsOpen(false)
    },
    [photo.title],
  )

  // 功能选项
  const actionOptions: ShareOption[] = [
    ...(typeof navigator !== 'undefined' && 'share' in navigator
      ? [
          {
            id: 'native-share',
            label: '系统分享',
            icon: 'i-mingcute-share-2-line',
            action: handleNativeShare,
            color: 'text-blue-500',
          },
        ]
      : []),
    {
      id: 'copy-link',
      label: '复制链接',
      icon: 'i-mingcute-link-line',
      action: handleCopyLink,
    },
  ]

  return (
    <DropdownMenuPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuPrimitive.Trigger asChild>
        {trigger}
      </DropdownMenuPrimitive.Trigger>

      <AnimatePresence>
        {isOpen && (
          <DropdownMenuPrimitive.Portal forceMount>
            <DropdownMenuPrimitive.Content
              align="end"
              sideOffset={8}
              className="z-[10000] min-w-[280px] will-change-[opacity,transform]"
              asChild
            >
              <m.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={Spring.presets.smooth}
                className={clsxm(
                  'rounded-2xl border border-border/10 p-4',
                  'bg-material-ultra-thick backdrop-blur-[70px]',
                  'shadow-2xl shadow-black/20',
                  'dark:shadow-black/50',
                )}
              >
                {/* 标题区域 */}
                <div className="mb-4 text-center">
                  <h3 className="text-text font-semibold">分享照片</h3>
                  {photo.title && (
                    <p className="text-text-secondary mt-1 line-clamp-1 text-sm">
                      {photo.title}
                    </p>
                  )}
                </div>

                {/* 社交媒体分享 - 第一排 */}
                <div className="mb-6">
                  <div className="mb-3">
                    <h4 className="text-text-secondary text-xs font-medium tracking-wide uppercase">
                      社交媒体
                    </h4>
                  </div>
                  <div className="flex justify-center gap-4">
                    {socialOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="group flex flex-col items-center gap-2"
                        onClick={() => handleSocialShare(option.url)}
                      >
                        <div
                          className={clsxm(
                            'flex size-12 items-center justify-center rounded-full transition-all duration-200',
                            option.bgColor,
                            'group-hover:scale-110 group-active:scale-95',
                            'shadow-lg',
                          )}
                        >
                          <i
                            className={clsxm(
                              option.icon,
                              'size-5',
                              option.color,
                            )}
                          />
                        </div>
                        <span className="text-text-secondary text-xs font-medium">
                          {option.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 功能选项 - 第二排 */}
                <div>
                  <div className="mb-3">
                    <h4 className="text-text-secondary text-xs font-medium tracking-wide uppercase">
                      操作
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {actionOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={clsxm(
                          'relative flex cursor-pointer select-none items-center rounded-lg px-2 py-2',
                          'text-sm outline-none transition-all duration-200',
                          'hover:bg-fill-secondary/80 active:bg-fill-secondary',
                          'group',
                        )}
                        onClick={() => option.action()}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={clsxm(
                              'flex size-7 items-center justify-center rounded-full',
                              'bg-fill-tertiary/80 group-hover:bg-fill-tertiary',
                              'transition-colors duration-200',
                            )}
                          >
                            <i
                              className={clsxm(
                                option.icon,
                                'size-3.5',
                                option.color || 'text-text-secondary',
                              )}
                            />
                          </div>
                          <span className="text-text text-xs font-medium">
                            {option.label}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </m.div>
            </DropdownMenuPrimitive.Content>
          </DropdownMenuPrimitive.Portal>
        )}
      </AnimatePresence>
    </DropdownMenuPrimitive.Root>
  )
}
