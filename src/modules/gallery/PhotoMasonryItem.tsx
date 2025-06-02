import clsx from 'clsx'
import { m } from 'motion/react'
import { useRef, useState } from 'react'
import { Blurhash } from 'react-blurhash'

import {
  CarbonIsoOutline,
  MaterialSymbolsShutterSpeed,
  StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens,
  TablerAperture,
} from '~/icons'
import { getImageFormat } from '~/lib/image-utils'
import type { PhotoManifest } from '~/types/photo'

import styles from './photo.module.css'

const isSafari =
  /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)

export const PhotoMasonryItem = ({
  data,
  width,
  index: _,
  onPhotoClick,
  photos,
}: {
  data: PhotoManifest
  width: number
  index: number
  onPhotoClick: (index: number, element?: HTMLElement) => void
  photos: PhotoManifest[]
}) => {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)

  const handleImageLoad = () => {
    setImageLoaded(true)
  }

  const handleImageError = () => {
    setImageError(true)
  }

  const handleClick = () => {
    const photoIndex = photos.findIndex((photo) => photo.id === data.id)
    if (photoIndex !== -1 && imageRef.current) {
      onPhotoClick(photoIndex, imageRef.current)
    }
  }

  // 计算基于宽度的高度
  const calculatedHeight = width / data.aspectRatio

  // 格式化 EXIF 数据
  const formatExifData = () => {
    const { exif } = data

    // 安全处理：如果 exif 不存在或为空，则返回空对象
    if (!exif) {
      return {
        focalLength35mm: null,
        iso: null,
        shutterSpeed: null,
        aperture: null,
      }
    }

    const photo = exif.Photo || {}
    const image = exif.Image || {}

    // 等效焦距 (35mm)
    const focalLength35mm =
      photo.FocalLengthIn35mmFilm ||
      (photo.FocalLength ? Math.round(photo.FocalLength) : null)

    // ISO
    const iso = photo.ISOSpeedRatings || image.ISOSpeedRatings

    // 快门速度
    const exposureTime = photo.ExposureTime
    const shutterSpeed = exposureTime
      ? exposureTime >= 1
        ? `${exposureTime}s`
        : `1/${Math.round(1 / exposureTime)}`
      : null

    // 光圈
    const aperture = photo.FNumber ? `f/${photo.FNumber}` : null

    return {
      focalLength35mm,
      iso,
      shutterSpeed,
      aperture,
    }
  }

  const exifData = formatExifData()

  // 使用通用的图片格式提取函数
  const imageFormat = getImageFormat(data.originalUrl || data.s3Key || '')

  return (
    <m.div
      className="bg-fill-quaternary group relative w-full cursor-pointer overflow-hidden rounded lg:rounded-none"
      style={{
        width,
        height: calculatedHeight,
      }}
      onClick={handleClick}
    >
      {/* Blurhash 占位符 */}
      {data.blurhash && (
        <Blurhash
          hash={data.blurhash}
          width="100%"
          height="100%"
          resolutionX={32}
          resolutionY={32}
          punch={1}
          className="absolute inset-0"
        />
      )}

      {!imageError && (
        <img
          ref={imageRef}
          src={data.thumbnailUrl}
          alt={data.title}
          className={clsx(
            'absolute inset-0 h-full w-full object-cover duration-300 group-hover:scale-105',
            !isSafari ? (imageLoaded ? styles.loaded : 'opacity-0') : '',
          )}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {/* 错误状态 */}
      {imageError && (
        <div className="bg-fill-quaternary text-text-tertiary absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <i className="i-mingcute-image-line text-2xl" />
            <p className="mt-2 text-sm">Loaded error</p>
          </div>
        </div>
      )}

      {/* 图片信息和 EXIF 覆盖层 */}
      {imageLoaded && (
        <div className="pointer-events-none">
          {/* 渐变背景 - 独立的层 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          {/* 内容层 - 独立的层以支持 backdrop-filter */}
          <div className="absolute inset-x-0 bottom-0 p-4 text-white ">
            {/* 基本信息和标签 section */}
            <div className="mb-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <h3 className="mb-2 truncate text-sm font-medium">
                {data.title}
              </h3>
              {data.description && (
                <p className="mb-2 line-clamp-2 text-sm text-white/80">
                  {data.description}
                </p>
              )}

              {/* 基本信息 */}
              <div className="mb-2 flex flex-wrap gap-2 text-xs text-white/80">
                <span>{imageFormat}</span>
                <span>•</span>
                <span>
                  {data.width} × {data.height}
                </span>
                <span>•</span>
                <span>{(data.size / 1024 / 1024).toFixed(1)}MB</span>
              </div>

              {/* Tags */}
              {data.tags && data.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white/90 backdrop-blur-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* EXIF 信息网格 */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {exifData.focalLength35mm && (
                <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                  <StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens className="text-white/70" />
                  <span className="text-white/90">
                    {exifData.focalLength35mm}mm
                  </span>
                </div>
              )}

              {exifData.aperture && (
                <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                  <TablerAperture className="text-white/70" />
                  <span className="text-white/90">{exifData.aperture}</span>
                </div>
              )}

              {exifData.shutterSpeed && (
                <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                  <MaterialSymbolsShutterSpeed className="text-white/70" />
                  <span className="text-white/90">{exifData.shutterSpeed}</span>
                </div>
              )}

              {exifData.iso && (
                <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                  <CarbonIsoOutline className="text-white/70" />
                  <span className="text-white/90">ISO {exifData.iso}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </m.div>
  )
}
