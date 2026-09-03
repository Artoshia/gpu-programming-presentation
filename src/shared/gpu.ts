export const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus'

/** Adapter and device only: compute-only pages never touch a canvas. */
export const requestDevice = async (): Promise<GPUDevice> => {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not available. Use Chrome/Edge 113+, Firefox 141+, or Safari 26+.')
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('No suitable GPU adapter found.')

  const device = await adapter.requestDevice()
  void device.lost.then((info) => console.error(`WebGPU device lost: ${info.reason} - ${info.message}`))
  return device
}

/** Points a canvas at the device and returns what the render pipeline needs. */
export const configureCanvas = (
  device: GPUDevice,
  canvas: HTMLCanvasElement,
): { context: GPUCanvasContext; format: GPUTextureFormat } => {
  const context = canvas.getContext('webgpu')
  if (!context) throw new Error('Failed to acquire a webgpu canvas context.')

  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'opaque' })
  return { context, format }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

/** Syncs the canvas backing store with its CSS size. Returns null when nothing changed. */
export const syncCanvasSize = (
  canvas: HTMLCanvasElement,
  device: GPUDevice,
): { width: number; height: number } | null => {
  const dpr = Math.min(window.devicePixelRatio, 2)
  const max = device.limits.maxTextureDimension2D
  const width = clamp(Math.round(canvas.clientWidth * dpr), 1, max)
  const height = clamp(Math.round(canvas.clientHeight * dpr), 1, max)
  if (width === canvas.width && height === canvas.height) return null

  canvas.width = width
  canvas.height = height
  return { width, height }
}

export const createDepthTexture = (
  device: GPUDevice,
  width: number,
  height: number,
  sampleCount = 1,
): GPUTexture =>
  device.createTexture({
    label: 'depth',
    size: [width, height],
    format: DEPTH_FORMAT,
    sampleCount,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })

/**
 * Off-screen multisampled colour target. The pass draws into this and the GPU
 * resolves it down to the canvas texture, which is what antialiasing costs you:
 * one extra full-size render target.
 */
export const createMultisampledTexture = (
  device: GPUDevice,
  format: GPUTextureFormat,
  width: number,
  height: number,
  sampleCount: number,
): GPUTexture =>
  device.createTexture({
    label: 'msaa colour',
    size: [width, height],
    format,
    sampleCount,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })

export const createBufferWithData = (
  device: GPUDevice,
  data: Float32Array | Uint16Array | Uint32Array,
  usage: GPUBufferUsageFlags,
  label?: string,
): GPUBuffer => {
  const buffer = device.createBuffer({
    label,
    size: Math.ceil(data.byteLength / 4) * 4,
    usage: usage | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(buffer, 0, data)
  return buffer
}
