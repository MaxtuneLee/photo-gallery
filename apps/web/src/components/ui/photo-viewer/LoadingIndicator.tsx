import { AnimatePresence, m } from 'motion/react'
import { useCallback, useImperativeHandle, useState } from 'react'

import { Spring } from '~/lib/spring'

interface LoadingState {
  isVisible: boolean
  isConverting: boolean
  isHeicFormat: boolean
  loadingProgress: number
  loadedBytes: number
  totalBytes: number
  conversionMessage?: string // 视频转换消息
  codecInfo?: string // 编码器信息
}

interface LoadingIndicatorRef {
  updateLoadingState: (state: Partial<LoadingState>) => void
  resetLoadingState: () => void
}

const initialLoadingState: LoadingState = {
  isVisible: false,
  isConverting: false,
  isHeicFormat: false,
  loadingProgress: 0,
  loadedBytes: 0,
  totalBytes: 0,
  conversionMessage: undefined,
  codecInfo: undefined,
}

export const LoadingIndicator = ({
  ref,
  ..._
}: {
  ref?: React.Ref<LoadingIndicatorRef | null>
}) => {
  const [loadingState, setLoadingState] =
    useState<LoadingState>(initialLoadingState)

  useImperativeHandle(
    ref,
    useCallback(
      () => ({
        updateLoadingState: (partialState: Partial<LoadingState>) => {
          setLoadingState((prev) => ({ ...prev, ...partialState }))
        },
        resetLoadingState: () => {
          setLoadingState(initialLoadingState)
        },
      }),
      [],
    ),
  )

  return (
    <AnimatePresence>
      {loadingState.isVisible && (
        <m.div
          className="pointer-events-none absolute right-4 bottom-4 z-10 rounded-xl border border-white/10 bg-black/80 px-3 py-2 backdrop-blur-sm"
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={Spring.presets.snappy}
        >
          <div className="flex items-center gap-3 text-white">
            <div className="relative">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              {loadingState.isConverting ? (
                <>
                  <p className="text-xs font-medium text-white tabular-nums">
                    {loadingState.conversionMessage || '转换中...'}
                  </p>
                  {loadingState.codecInfo && (
                    <p className="text-xs text-white/70 tabular-nums">
                      {loadingState.codecInfo}
                    </p>
                  )}
                  <span className="text-xs text-white/60 tabular-nums">
                    {Math.round(loadingState.loadingProgress)}%
                  </span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-white">
                      {loadingState.isHeicFormat ? 'HEIC' : '加载中'}
                    </p>
                    <span className="text-xs text-white/60 tabular-nums">
                      {Math.round(loadingState.loadingProgress)}%
                    </span>
                  </div>
                  {loadingState.totalBytes > 0 && (
                    <p className="text-xs text-white/70 tabular-nums">
                      {(loadingState.loadedBytes / 1024 / 1024).toFixed(1)}MB /{' '}
                      {(loadingState.totalBytes / 1024 / 1024).toFixed(1)}MB
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

LoadingIndicator.displayName = 'LoadingIndicator'

export type { LoadingIndicatorRef, LoadingState }
