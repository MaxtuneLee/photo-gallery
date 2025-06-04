/**
 * WebGL图像查看器常量配置
 *
 * 包含所有默认配置值、LOD级别定义等常量
 */

import type {
  AlignmentAnimationConfig,
  DoubleClickConfig,
  PanningConfig,
  PinchConfig,
  VelocityAnimationConfig,
  WheelConfig,
} from './interface'

/**
 * 默认滚轮配置
 */
export const defaultWheelConfig: WheelConfig = {
  step: 0.1,
  wheelDisabled: false,
  touchPadDisabled: false,
}

/**
 * 默认手势缩放配置
 */
export const defaultPinchConfig: PinchConfig = {
  step: 0.5,
  disabled: false,
}

/**
 * 默认双击配置
 */
export const defaultDoubleClickConfig: DoubleClickConfig = {
  step: 2,
  disabled: false,
  mode: 'toggle',
  animationTime: 200,
}

/**
 * 默认平移配置
 */
export const defaultPanningConfig: PanningConfig = {
  disabled: false,
  velocityDisabled: true,
}

/**
 * 默认对齐动画配置
 */
export const defaultAlignmentAnimation: AlignmentAnimationConfig = {
  sizeX: 0,
  sizeY: 0,
  velocityAlignmentTime: 0.2,
}

/**
 * 默认速度动画配置
 */
export const defaultVelocityAnimation: VelocityAnimationConfig = {
  sensitivity: 1,
  animationTime: 0.2,
}

/**
 * LOD (Level of Detail) 级别配置
 * 用于在不同缩放级别下提供合适分辨率的纹理
 */
export const LOD_LEVELS = [
  { scale: 0.125, maxViewportScale: 0.25 }, // LOD 0: 1/8 resolution for very zoomed out
  { scale: 0.25, maxViewportScale: 0.5 }, // LOD 1: 1/4 resolution for zoomed out
  { scale: 0.5, maxViewportScale: 1 }, // LOD 2: 1/2 resolution for normal view
  { scale: 1, maxViewportScale: 2 }, // LOD 3: full resolution for normal view
  { scale: 2, maxViewportScale: 4 }, // LOD 4: 2x resolution for zoomed in
  { scale: 4, maxViewportScale: 8 }, // LOD 5: 4x resolution for very zoomed in
  { scale: 8, maxViewportScale: 16 }, // LOD 6: 8x resolution for extreme zoom
  { scale: 16, maxViewportScale: Infinity }, // LOD 7: 16x resolution for maximum detail
] as const
