import { createDepthTexture, createMultisampledTexture } from '../shared/gpu'

export interface Targets {
  depthView: GPUTextureView
  /** Null when antialiasing is off, in which case the pass draws straight to the canvas. */
  colorView: GPUTextureView | null
  destroy: () => void
}

/**
 * The textures a render pass needs at a given size and sample count.
 * With sampleCount 1 only a depth buffer is needed. With 4, drawing goes to an
 * off-screen 4x target that the GPU resolves onto the canvas at the end of the pass.
 */
export const createTargets = (
  device: GPUDevice,
  format: GPUTextureFormat,
  width: number,
  height: number,
  sampleCount: number,
): Targets => {
  const depth = createDepthTexture(device, width, height, sampleCount)
  const color = sampleCount > 1 ? createMultisampledTexture(device, format, width, height, sampleCount) : null

  return {
    depthView: depth.createView(),
    colorView: color?.createView() ?? null,
    destroy: () => {
      depth.destroy()
      color?.destroy()
    },
  }
}
