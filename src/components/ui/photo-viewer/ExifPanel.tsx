import './PhotoViewer.css'

import type { Exif } from 'exif-reader'
import { m } from 'motion/react'
import type { FC } from 'react'
import { Fragment } from 'react'

import { ScrollArea } from '~/components/ui/scroll-areas/ScrollArea'
import { useMobile } from '~/hooks/useMobile'
import {
  CarbonIsoOutline,
  MaterialSymbolsExposure,
  MaterialSymbolsShutterSpeed,
  StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens,
  TablerAperture,
} from '~/icons'
import { getImageFormat } from '~/lib/image-utils'
import type { PhotoManifest } from '~/types/photo'

import { MotionButtonBase } from '../button'
import { EllipsisHorizontalTextWithTooltip } from '../typography'

export const ExifPanel: FC<{
  currentPhoto: PhotoManifest
  exifData: Exif | null

  onClose?: () => void
}> = ({ currentPhoto, exifData, onClose }) => {
  const isMobile = useMobile()
  const formattedExifData = formatExifData(exifData)

  // 使用通用的图片格式提取函数
  const imageFormat = getImageFormat(
    currentPhoto.originalUrl || currentPhoto.s3Key || '',
  )

  return (
    <m.div
      className={`${
        isMobile
          ? 'exif-panel-mobile fixed right-0 bottom-0 left-0 max-h-[60vh] w-full rounded-t-2xl'
          : 'w-80 shrink-0'
      } bg-material-medium z-10 flex flex-col text-white backdrop-blur-3xl`}
      initial={{
        opacity: 0,
        ...(isMobile ? { y: 100 } : { x: 100 }),
      }}
      animate={{
        opacity: 1,
        ...(isMobile ? { y: 0 } : { x: 0 }),
      }}
      exit={{
        opacity: 0,
        ...(isMobile ? { y: 100 } : { x: 100 }),
      }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-4 flex shrink-0 items-center justify-between p-4 pb-0">
        <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold`}>
          图片信息
        </h3>
        {isMobile && onClose && (
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-full text-white/70 duration-200 hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            <i className="i-mingcute-close-line text-sm" />
          </button>
        )}
      </div>

      <ScrollArea
        rootClassName="flex-1 min-h-0 overflow-auto lg:overflow-hidden"
        viewportClassName="px-4 pb-4"
      >
        <div className={`space-y-${isMobile ? '3' : '4'}`}>
          {/* 基本信息和标签 - 合并到一个 section */}
          <div>
            <h4 className="mb-2 text-sm font-medium text-white/80">基本信息</h4>
            <div className="space-y-1 text-sm">
              <Row label="文件名" value={currentPhoto.title} ellipsis />
              <Row label="格式" value={imageFormat} />
              <Row
                label="尺寸"
                value={`${currentPhoto.width} × ${currentPhoto.height}`}
              />
              <Row
                label="文件大小"
                value={`${(currentPhoto.size / 1024 / 1024).toFixed(1)}MB`}
              />
              {formattedExifData?.megaPixels && (
                <Row
                  label="像素"
                  value={`${Math.floor(
                    Number.parseFloat(formattedExifData.megaPixels),
                  )} MP`}
                />
              )}
              {formattedExifData?.colorSpace && (
                <Row label="色彩空间" value={formattedExifData.colorSpace} />
              )}

              {formattedExifData?.dateTime && (
                <Row label="拍摄时间" value={formattedExifData.dateTime} />
              )}
            </div>

            {/* 标签信息 - 移到基本信息 section 内 */}
            {currentPhoto.tags && currentPhoto.tags.length > 0 && (
              <div className="mt-3">
                <div className="mb-2 text-sm text-white/80">标签</div>
                <div className="flex flex-wrap gap-1.5">
                  {currentPhoto.tags.map((tag) => (
                    <MotionButtonBase
                      type="button"
                      onClick={() => {
                        window.open(
                          `/?tags=${tag}`,
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }}
                      key={tag}
                      className="bg-material-medium hover:bg-material-thin inline-flex cursor-pointer items-center rounded-full px-2 py-1 text-xs text-white/90 backdrop-blur-sm"
                    >
                      {tag}
                    </MotionButtonBase>
                  ))}
                </div>
              </div>
            )}
          </div>

          {formattedExifData && (
            <Fragment>
              {(formattedExifData.camera || formattedExifData.lens) && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">
                    设备信息
                  </h4>
                  <div className="space-y-1 text-sm">
                    {formattedExifData.camera && (
                      <Row label="相机" value={formattedExifData.camera} />
                    )}
                    {formattedExifData.lens && (
                      <Row label="镜头" value={formattedExifData.lens} />
                    )}

                    {formattedExifData.focalLength && (
                      <Row
                        label="实际焦距"
                        value={`${formattedExifData.focalLength}mm`}
                      />
                    )}
                    {formattedExifData.focalLength35mm && (
                      <Row
                        label="等效焦距"
                        value={`${formattedExifData.focalLength35mm}mm`}
                      />
                    )}
                    {formattedExifData.maxAperture && (
                      <Row
                        label="最大光圈"
                        value={`f/${formattedExifData.maxAperture}`}
                      />
                    )}
                    {formattedExifData.digitalZoom && (
                      <Row
                        label="数字变焦"
                        value={`${formattedExifData.digitalZoom.toFixed(2)}x`}
                      />
                    )}
                  </div>
                </div>
              )}

              <div>
                <h4 className="my-2 text-sm font-medium text-white/80">
                  拍摄参数
                </h4>
                <div className={`grid grid-cols-2 gap-3`}>
                  {formattedExifData.focalLength35mm && (
                    <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">
                      <StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens className="text-sm text-white/70" />
                      <span className="text-xs">
                        {formattedExifData.focalLength35mm}mm
                      </span>
                    </div>
                  )}

                  {formattedExifData.aperture && (
                    <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">
                      <TablerAperture className="text-sm text-white/70" />
                      <span className="text-xs">
                        {formattedExifData.aperture}
                      </span>
                    </div>
                  )}

                  {formattedExifData.shutterSpeed && (
                    <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">
                      <MaterialSymbolsShutterSpeed className="text-sm text-white/70" />
                      <span className="text-xs">
                        {formattedExifData.shutterSpeed}
                      </span>
                    </div>
                  )}

                  {formattedExifData.iso && (
                    <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">
                      <CarbonIsoOutline className="text-sm text-white/70" />
                      <span className="text-xs">
                        ISO {formattedExifData.iso}
                      </span>
                    </div>
                  )}

                  {formattedExifData.exposureBias && (
                    <div className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1">
                      <MaterialSymbolsExposure className="text-sm text-white/70" />
                      <span className="text-xs">
                        {formattedExifData.exposureBias}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 新增：拍摄模式信息 */}
              {(formattedExifData.exposureMode ||
                formattedExifData.meteringMode ||
                formattedExifData.whiteBalance ||
                formattedExifData.lightSource ||
                formattedExifData.flash) && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">
                    拍摄模式
                  </h4>
                  <div className="space-y-1 text-sm">
                    {formattedExifData.exposureMode && (
                      <Row
                        label="曝光模式"
                        value={formattedExifData.exposureMode}
                      />
                    )}
                    {formattedExifData.meteringMode && (
                      <Row
                        label="测光模式"
                        value={formattedExifData.meteringMode}
                      />
                    )}
                    {formattedExifData.whiteBalance && (
                      <Row
                        label="白平衡"
                        value={formattedExifData.whiteBalance}
                      />
                    )}
                    {formattedExifData.whiteBalanceBias && (
                      <Row
                        label="白平衡偏移"
                        value={`${formattedExifData.whiteBalanceBias} Mired`}
                      />
                    )}
                    {formattedExifData.wbShiftAB && (
                      <Row
                        label="白平衡偏移 (琥珀-蓝)"
                        value={formattedExifData.wbShiftAB}
                      />
                    )}
                    {formattedExifData.wbShiftGM && (
                      <Row
                        label="白平衡偏移 (绿-洋红)"
                        value={formattedExifData.wbShiftGM}
                      />
                    )}
                    {formattedExifData.whiteBalanceFineTune && (
                      <Row
                        label="白平衡微调"
                        value={formattedExifData.whiteBalanceFineTune}
                      />
                    )}
                    {formattedExifData.wbGRBLevels && (
                      <Row
                        label="白平衡 GRB 级别"
                        value={
                          Array.isArray(formattedExifData.wbGRBLevels)
                            ? formattedExifData.wbGRBLevels.join(' ')
                            : formattedExifData.wbGRBLevels
                        }
                      />
                    )}
                    {formattedExifData.wbGRBLevelsStandard && (
                      <Row
                        label="标准白平衡 GRB"
                        value={
                          Array.isArray(formattedExifData.wbGRBLevelsStandard)
                            ? formattedExifData.wbGRBLevelsStandard.join(' ')
                            : formattedExifData.wbGRBLevelsStandard
                        }
                      />
                    )}
                    {formattedExifData.wbGRBLevelsAuto && (
                      <Row
                        label="自动白平衡 GRB"
                        value={
                          Array.isArray(formattedExifData.wbGRBLevelsAuto)
                            ? formattedExifData.wbGRBLevelsAuto.join(' ')
                            : formattedExifData.wbGRBLevelsAuto
                        }
                      />
                    )}
                    {formattedExifData.flash && (
                      <Row label="闪光灯" value={formattedExifData.flash} />
                    )}
                    {formattedExifData.lightSource && (
                      <Row label="光源" value={formattedExifData.lightSource} />
                    )}
                  </div>
                </div>
              )}

              {formattedExifData.fujiRecipe && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">
                    富士胶片模拟
                  </h4>
                  <div className="space-y-1 text-sm">
                    {formattedExifData.fujiRecipe.FilmMode && (
                      <Row
                        label="胶片模式"
                        value={formattedExifData.fujiRecipe.FilmMode}
                      />
                    )}
                    {formattedExifData.fujiRecipe.DynamicRange && (
                      <Row
                        label="动态范围"
                        value={formattedExifData.fujiRecipe.DynamicRange}
                      />
                    )}
                    {formattedExifData.fujiRecipe.WhiteBalance && (
                      <Row
                        label="白平衡"
                        value={formattedExifData.fujiRecipe.WhiteBalance}
                      />
                    )}
                    {formattedExifData.fujiRecipe.HighlightTone && (
                      <Row
                        label="高光色调"
                        value={formattedExifData.fujiRecipe.HighlightTone}
                      />
                    )}
                    {formattedExifData.fujiRecipe.ShadowTone && (
                      <Row
                        label="阴影色调"
                        value={formattedExifData.fujiRecipe.ShadowTone}
                      />
                    )}
                    {formattedExifData.fujiRecipe.Saturation && (
                      <Row
                        label="饱和度"
                        value={formattedExifData.fujiRecipe.Saturation}
                      />
                    )}
                    {formattedExifData.fujiRecipe.Sharpness && (
                      <Row
                        label="锐度"
                        value={formattedExifData.fujiRecipe.Sharpness}
                      />
                    )}
                    {formattedExifData.fujiRecipe.NoiseReduction && (
                      <Row
                        label="降噪"
                        value={formattedExifData.fujiRecipe.NoiseReduction}
                      />
                    )}
                    {formattedExifData.fujiRecipe.Clarity && (
                      <Row
                        label="清晰度"
                        value={formattedExifData.fujiRecipe.Clarity}
                      />
                    )}
                    {formattedExifData.fujiRecipe.ColorChromeEffect && (
                      <Row
                        label="色彩效果"
                        value={formattedExifData.fujiRecipe.ColorChromeEffect}
                      />
                    )}
                    {formattedExifData.fujiRecipe.ColorChromeFxBlue && (
                      <Row
                        label="蓝色色彩效果"
                        value={formattedExifData.fujiRecipe.ColorChromeFxBlue}
                      />
                    )}
                    {(formattedExifData.fujiRecipe.GrainEffectRoughness ||
                      formattedExifData.fujiRecipe.GrainEffectSize) && (
                      <>
                        {formattedExifData.fujiRecipe.GrainEffectRoughness && (
                          <Row
                            label="颗粒效果强度"
                            value={
                              formattedExifData.fujiRecipe.GrainEffectRoughness
                            }
                          />
                        )}
                        {formattedExifData.fujiRecipe.GrainEffectSize && (
                          <Row
                            label="颗粒效果大小"
                            value={formattedExifData.fujiRecipe.GrainEffectSize}
                          />
                        )}
                      </>
                    )}
                    {(formattedExifData.fujiRecipe.Red ||
                      formattedExifData.fujiRecipe.Blue) && (
                      <>
                        {formattedExifData.fujiRecipe.Red && (
                          <Row
                            label="红色调整"
                            value={formattedExifData.fujiRecipe.Red}
                          />
                        )}
                        {formattedExifData.fujiRecipe.Blue && (
                          <Row
                            label="蓝色调整"
                            value={formattedExifData.fujiRecipe.Blue}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              {formattedExifData.gps && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">
                    位置信息
                  </h4>
                  <div className="space-y-1 text-sm">
                    <Row label="纬度" value={formattedExifData.gps.latitude} />
                    <Row label="经度" value={formattedExifData.gps.longitude} />
                    {formattedExifData.gps.altitude && (
                      <Row
                        label="海拔"
                        value={`${formattedExifData.gps.altitude}m`}
                      />
                    )}
                    <div className="mt-2 text-right">
                      <a
                        href={`https://uri.amap.com/marker?position=${formattedExifData.gps.longitude},${formattedExifData.gps.latitude}&name=拍摄位置`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue inline-flex items-center gap-1 text-xs underline transition-colors hover:text-blue-300"
                      >
                        在高德地图中查看
                        <i className="i-mingcute-external-link-line" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* 新增：技术参数 */}
              {(formattedExifData.brightnessValue ||
                formattedExifData.shutterSpeedValue ||
                formattedExifData.apertureValue ||
                formattedExifData.sensingMethod ||
                formattedExifData.customRendered ||
                formattedExifData.focalPlaneXResolution ||
                formattedExifData.focalPlaneYResolution) && (
                <div>
                  <h4 className="my-2 text-sm font-medium text-white/80">
                    技术参数
                  </h4>
                  <div className="space-y-1 text-sm">
                    {formattedExifData.brightnessValue && (
                      <Row
                        label="亮度值"
                        value={formattedExifData.brightnessValue}
                      />
                    )}
                    {formattedExifData.shutterSpeedValue && (
                      <Row
                        label="快门速度值"
                        value={formattedExifData.shutterSpeedValue}
                      />
                    )}
                    {formattedExifData.apertureValue && (
                      <Row
                        label="光圈值"
                        value={formattedExifData.apertureValue}
                      />
                    )}
                    {formattedExifData.sensingMethod && (
                      <Row
                        label="感光方法"
                        value={formattedExifData.sensingMethod}
                      />
                    )}
                    {formattedExifData.customRendered && (
                      <Row
                        label="图像处理"
                        value={formattedExifData.customRendered}
                      />
                    )}
                    {(formattedExifData.focalPlaneXResolution ||
                      formattedExifData.focalPlaneYResolution) && (
                      <Row
                        label="焦平面分辨率"
                        value={`${formattedExifData.focalPlaneXResolution || 'N/A'} × ${formattedExifData.focalPlaneYResolution || 'N/A'}${formattedExifData.focalPlaneResolutionUnit ? ` (${formattedExifData.focalPlaneResolutionUnit})` : ''}`}
                      />
                    )}
                  </div>
                </div>
              )}
            </Fragment>
          )}
        </div>
      </ScrollArea>
    </m.div>
  )
}

const formatExifData = (exif: Exif | null) => {
  if (!exif) return null

  const photo = exif.Photo || {}
  const image = exif.Image || {}
  const gps = exif.GPSInfo || {}

  // 等效焦距 (35mm)
  const focalLength35mm = photo.FocalLengthIn35mmFilm
    ? Math.round(photo.FocalLengthIn35mmFilm)
    : null

  // 实际焦距
  const focalLength = photo.FocalLength ? Math.round(photo.FocalLength) : null

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

  // 最大光圈
  const maxAperture = photo.MaxApertureValue
    ? `${Math.round(Math.pow(Math.sqrt(2), photo.MaxApertureValue) * 10) / 10}`
    : null

  // 相机信息
  const camera =
    image.Make && image.Model ? `${image.Make} ${image.Model}` : null

  // 镜头信息
  const lens =
    photo.LensModel || photo.LensSpecification || photo.LensMake || null

  // 软件信息
  const software = image.Software || null

  const offsetTimeOriginal = photo.OffsetTimeOriginal || photo.OffsetTime
  // 拍摄时间
  const dateTime: string | null = (() => {
    const originalDateTimeStr =
      (photo.DateTimeOriginal as unknown as string) ||
      (photo.DateTime as unknown as string)

    if (!originalDateTimeStr) return null

    const date = new Date(originalDateTimeStr)

    if (offsetTimeOriginal) {
      // 解析时区偏移，例如 "+08:00" 或 "-05:00"
      const offsetMatch = offsetTimeOriginal.match(/([+-])(\d{2}):(\d{2})/)
      if (offsetMatch) {
        const [, sign, hours, minutes] = offsetMatch
        const offsetMinutes =
          (Number.parseInt(hours) * 60 + Number.parseInt(minutes)) *
          (sign === '+' ? 1 : -1)

        // 减去偏移量，将本地时间转换为 UTC 时间
        const utcTime = new Date(date.getTime() - offsetMinutes * 60 * 1000)
        return formatDateTime(utcTime)
      }

      return formatDateTime(date)
    }

    return formatDateTime(date)
  })()

  // 曝光模式
  const exposureModeMap: Record<number, string> = {
    0: '自动曝光',
    1: '手动曝光',
    2: '自动包围曝光',
  }
  const exposureMode =
    photo.ExposureMode !== undefined
      ? exposureModeMap[photo.ExposureMode] || `未知 (${photo.ExposureMode})`
      : null

  // 测光模式
  const meteringModeMap: Record<number, string> = {
    0: '未知',
    1: '平均测光',
    2: '中央重点测光',
    3: '点测光',
    4: '多点测光',
    5: '评价测光',
    6: '局部测光',
  }
  const meteringMode =
    photo.MeteringMode !== undefined
      ? meteringModeMap[photo.MeteringMode] || `未知 (${photo.MeteringMode})`
      : null

  // 白平衡
  const whiteBalanceMap: Record<number, string> = {
    0: '自动白平衡',
    1: '手动白平衡',
  }
  const whiteBalance =
    photo.WhiteBalance !== undefined
      ? whiteBalanceMap[photo.WhiteBalance] || `未知 (${photo.WhiteBalance})`
      : null

  // 闪光灯
  const flashMap: Record<number, string> = {
    0: '未闪光',
    1: '闪光',
    5: '闪光，未检测到回闪',
    7: '闪光，检测到回闪',
    9: '强制闪光',
    13: '强制闪光，未检测到回闪',
    15: '强制闪光，检测到回闪',
    16: '未闪光，强制关闭',
    24: '未闪光，自动模式',
    25: '闪光，自动模式',
    29: '闪光，自动模式，未检测到回闪',
    31: '闪光，自动模式，检测到回闪',
    32: '未提供闪光功能',
  }
  const flash =
    photo.Flash !== undefined
      ? flashMap[photo.Flash] || `未知 (${photo.Flash})`
      : null

  // 数字变焦
  const digitalZoom = photo.DigitalZoomRatio || null

  // 曝光补偿
  const exposureBias = photo.ExposureBiasValue
    ? `${photo.ExposureBiasValue > 0 ? '+' : ''}${photo.ExposureBiasValue.toFixed(1)} EV`
    : null

  // 亮度值
  const brightnessValue = photo.BrightnessValue
    ? `${photo.BrightnessValue.toFixed(1)} EV`
    : null

  // 快门速度值
  const shutterSpeedValue = photo.ShutterSpeedValue
    ? `${photo.ShutterSpeedValue.toFixed(1)} EV`
    : null

  // 光圈值
  const apertureValue = photo.ApertureValue
    ? `${photo.ApertureValue.toFixed(1)} EV`
    : null

  // 光源类型
  const lightSourceMap: Record<number, string> = {
    0: '自动',
    1: '日光',
    2: '荧光灯',
    3: '钨丝灯',
    4: '闪光灯',
    9: '晴天',
    10: '阴天',
    11: '阴影',
    12: '日光荧光灯 (D 5700 – 7100K)',
    13: '日白荧光灯 (N 4600 – 5400K)',
    14: '冷白荧光灯 (W 3900 – 4500K)',
    15: '白荧光灯 (WW 3200 – 3700K)',
    17: '标准光源 A',
    18: '标准光源 B',
    19: '标准光源 C',
    20: 'D55',
    21: 'D65',
    22: 'D75',
    23: 'D50',
    24: 'ISO 钨丝灯',
    255: '其他光源',
  }
  const lightSource =
    photo.LightSource !== undefined
      ? lightSourceMap[photo.LightSource] || `未知 (${photo.LightSource})`
      : null

  // 白平衡偏移/微调相关字段
  const whiteBalanceBias = (photo as any).WhiteBalanceBias || null
  const wbShiftAB = (photo as any).WBShiftAB || null
  const wbShiftGM = (photo as any).WBShiftGM || null
  const whiteBalanceFineTune = (photo as any).WhiteBalanceFineTune || null

  // 富士相机特有的白平衡字段
  const wbGRBLevels =
    (photo as any).WBGRBLevels || (photo as any)['WB GRB Levels'] || null
  const wbGRBLevelsStandard =
    (photo as any).WBGRBLevelsStandard ||
    (photo as any)['WB GRB Levels Standard'] ||
    null
  const wbGRBLevelsAuto =
    (photo as any).WBGRBLevelsAuto ||
    (photo as any)['WB GRB Levels Auto'] ||
    null

  // 感光方法
  const sensingMethodMap: Record<number, string> = {
    1: '未定义',
    2: '单芯片彩色区域传感器',
    3: '双芯片彩色区域传感器',
    4: '三芯片彩色区域传感器',
    5: '彩色顺序区域传感器',
    7: '三线传感器',
    8: '彩色顺序线性传感器',
  }
  const sensingMethod =
    photo.SensingMethod !== undefined
      ? sensingMethodMap[photo.SensingMethod] || `未知 (${photo.SensingMethod})`
      : null

  // 自定义渲染
  const customRenderedMap: Record<number, string> = {
    0: '正常处理',
    1: '自定义处理',
  }
  const customRendered =
    photo.CustomRendered !== undefined
      ? customRenderedMap[photo.CustomRendered] ||
        `未知 (${photo.CustomRendered})`
      : null

  // 焦平面分辨率
  const focalPlaneXResolution = photo.FocalPlaneXResolution
    ? Math.round(photo.FocalPlaneXResolution)
    : null
  const focalPlaneYResolution = photo.FocalPlaneYResolution
    ? Math.round(photo.FocalPlaneYResolution)
    : null

  // 焦平面分辨率单位
  const focalPlaneResolutionUnitMap: Record<number, string> = {
    1: '无单位',
    2: '英寸',
    3: '厘米',
  }
  const focalPlaneResolutionUnit =
    photo.FocalPlaneResolutionUnit !== undefined
      ? focalPlaneResolutionUnitMap[photo.FocalPlaneResolutionUnit] ||
        `未知 (${photo.FocalPlaneResolutionUnit})`
      : null

  // 像素信息
  const pixelXDimension = photo.PixelXDimension || null
  const pixelYDimension = photo.PixelYDimension || null
  const totalPixels =
    pixelXDimension && pixelYDimension
      ? pixelXDimension * pixelYDimension
      : null
  const megaPixels = totalPixels
    ? `${(totalPixels / 1000000).toFixed(1)}MP`
    : null

  // 色彩空间
  const colorSpaceMap: Record<number, string> = {
    1: 'sRGB',
    65535: 'Adobe RGB',
  }
  const colorSpace =
    photo.ColorSpace !== undefined
      ? colorSpaceMap[photo.ColorSpace] || `未知 (${photo.ColorSpace})`
      : null

  // GPS 信息
  let gpsInfo: {
    latitude: string | undefined
    longitude: string | undefined
    altitude: number | null
  } | null = null
  if (gps.GPSLatitude && gps.GPSLongitude) {
    const latitude = convertDMSToDD(gps.GPSLatitude, gps.GPSLatitudeRef || '')
    const longitude = convertDMSToDD(
      gps.GPSLongitude,
      gps.GPSLongitudeRef || '',
    )
    const altitude = gps.GPSAltitude || null

    gpsInfo = {
      latitude: latitude?.toFixed(6),
      longitude: longitude?.toFixed(6),
      altitude: altitude ? Math.round(altitude) : null,
    }
  }

  // 富士相机 Recipe 信息
  const fujiRecipe = (exif as any).FujiRecipe || null

  return {
    focalLength35mm,
    focalLength,
    iso,
    shutterSpeed,
    aperture,
    maxAperture,
    camera,
    lens,
    software,
    dateTime,
    exposureMode,
    meteringMode,
    whiteBalance,
    flash,
    digitalZoom,
    colorSpace,
    gps: gpsInfo,
    exposureBias,
    brightnessValue,
    shutterSpeedValue,
    apertureValue,
    lightSource,
    sensingMethod,
    customRendered,
    focalPlaneXResolution,
    focalPlaneYResolution,
    focalPlaneResolutionUnit,
    megaPixels,
    pixelXDimension,
    pixelYDimension,
    whiteBalanceBias,
    wbShiftAB,
    wbShiftGM,
    whiteBalanceFineTune,
    wbGRBLevels,
    wbGRBLevelsStandard,
    wbGRBLevelsAuto,
    fujiRecipe,
  }
}

// 将度分秒格式转换为十进制度数
const convertDMSToDD = (dms: number[], ref: string): number | null => {
  if (!dms || dms.length !== 3) return null

  const [degrees, minutes, seconds] = dms
  let dd = degrees + minutes / 60 + seconds / 3600

  if (ref === 'S' || ref === 'W') {
    dd = dd * -1
  }

  return dd
}

const Row: FC<{
  label: string
  value: string | number | null | undefined | number[]
  ellipsis?: boolean
}> = ({ label, value, ellipsis }) => {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-secondary shrink-0">{label}</span>

      {ellipsis ? (
        <span className="relative min-w-0 flex-1 shrink">
          <span className="absolute inset-0">
            <EllipsisHorizontalTextWithTooltip className="text-text min-w-0 text-right">
              {Array.isArray(value) ? value.join(' ') : value}
            </EllipsisHorizontalTextWithTooltip>
          </span>
        </span>
      ) : (
        <span className="text-text min-w-0 text-right">
          {Array.isArray(value) ? value.join(' ') : value}
        </span>
      )}
    </div>
  )
}

const datetimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'short',
  timeStyle: 'medium',
})

const formatDateTime = (date: Date | null | undefined) => {
  if (!date) return ''

  return datetimeFormatter.format(date)
}
