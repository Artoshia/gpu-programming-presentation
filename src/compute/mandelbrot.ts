import shaderCode from './shaders/mandelbrot.wgsl?raw'

export { shaderCode as mandelbrotShaderSource }

/** Threads per workgroup along each axis. Must match @workgroup_size. */
const WORKGROUP_SIZE = 8

export interface MandelbrotParams {
  /** Image is square: size x size pixels, one thread each. */
  size: number
  maxIterations: number
  centerX: number
  centerY: number
  scale: number
}

export interface MandelbrotRun {
  iterations: Uint32Array
  /** Time spent doing the actual maths. */
  computeMilliseconds: number
  /** Compute plus getting the results back to the CPU. */
  totalMilliseconds: number
}

/**
 * A zoom deep enough to be expensive, but not so deep that f32 runs out of
 * precision: WGSL works in 32-bit floats while JavaScript numbers are 64-bit,
 * so a much tighter zoom would make the two versions disagree everywhere.
 */
export const defaultParams = (size: number, maxIterations: number): MandelbrotParams => ({
  size,
  maxIterations,
  centerX: -0.743643887,
  centerY: 0.131825904,
  scale: 0.01,
})

const packParams = (params: MandelbrotParams): ArrayBuffer => {
  const buffer = new ArrayBuffer(32)
  new Uint32Array(buffer, 0, 4).set([params.size, params.size, params.maxIterations, 0])
  new Float32Array(buffer, 16, 4).set([params.centerX, params.centerY, params.scale, 0])
  return buffer
}

/**
 * Builds the pipeline once, then returns a function that runs one image.
 * The reported time covers the whole round trip: dispatch, wait, read back.
 */
export const createGpuMandelbrot = (device: GPUDevice): ((params: MandelbrotParams) => Promise<MandelbrotRun>) => {
  const pipeline = device.createComputePipeline({
    label: 'mandelbrot',
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ label: 'mandelbrot', code: shaderCode }),
      entryPoint: 'mandelbrot',
    },
  })

  return async (params) => {
    const pixels = params.size * params.size
    const bytes = pixels * 4
    const startTime = performance.now()

    const paramsBuffer = device.createBuffer({
      label: 'params',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(paramsBuffer, 0, packParams(params))

    const outputBuffer = device.createBuffer({
      label: 'iterations',
      size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })
    const readbackBuffer = device.createBuffer({
      label: 'readback',
      size: bytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })

    const encoder = device.createCommandEncoder()
    const pass = encoder.beginComputePass()
    pass.setPipeline(pipeline)
    pass.setBindGroup(
      0,
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuffer } },
          { binding: 1, resource: { buffer: outputBuffer } },
        ],
      }),
    )

    // A 2D dispatch: one workgroup per 8x8 block of pixels.
    const groups = Math.ceil(params.size / WORKGROUP_SIZE)
    pass.dispatchWorkgroups(groups, groups)
    pass.end()

    device.queue.submit([encoder.finish()])

    // Submitting is asynchronous, so wait for the GPU to actually finish the maths.
    await device.queue.onSubmittedWorkDone()
    const computeMilliseconds = performance.now() - startTime

    // Copying results back over the bus is a separate cost, and often the larger one.
    const copyEncoder = device.createCommandEncoder()
    copyEncoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, bytes)
    device.queue.submit([copyEncoder.finish()])

    await readbackBuffer.mapAsync(GPUMapMode.READ)
    const iterations = new Uint32Array(readbackBuffer.getMappedRange().slice(0))
    readbackBuffer.unmap()

    for (const buffer of [paramsBuffer, outputBuffer, readbackBuffer]) buffer.destroy()
    return { iterations, computeMilliseconds, totalMilliseconds: performance.now() - startTime }
  }
}

/**
 * The same algorithm in JavaScript, one pixel after another. Blocks the page while it runs.
 * Note that JavaScript numbers are 64-bit while WGSL works in 32-bit floats, so near the
 * boundary of the set the two versions land on different escape counts for some pixels.
 * Forcing 32-bit maths here with Math.fround makes them agree more often, but it also makes
 * this loop several times slower, which would be a dishonest thing to time against.
 */
export const runCpuMandelbrot = (params: MandelbrotParams): MandelbrotRun => {
  const { size, maxIterations, centerX, centerY, scale } = params
  const iterations = new Uint32Array(size * size)
  const startTime = performance.now()

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = centerX + (x / size - 0.5) * scale
      const cy = centerY + (y / size - 0.5) * scale
      let zx = 0
      let zy = 0
      let count = 0
      while (count < maxIterations && zx * zx + zy * zy <= 4) {
        const next = zx * zx - zy * zy + cx
        zy = 2 * zx * zy + cy
        zx = next
        count++
      }
      iterations[y * size + x] = count
    }
  }

  const milliseconds = performance.now() - startTime
  return { iterations, computeMilliseconds: milliseconds, totalMilliseconds: milliseconds }
}

/** Share of pixels where the two runs disagree, which is a 32-bit versus 64-bit float story. */
export const disagreementPercent = (a: Uint32Array, b: Uint32Array): number => {
  let differing = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differing++
  return (differing / a.length) * 100
}

/** Turns escape counts into pixels: black inside the set, a colour ramp outside. */
export const colorize = (run: MandelbrotRun, params: MandelbrotParams): ImageData => {
  const image = new ImageData(params.size, params.size)
  const { data } = image

  for (let i = 0; i < run.iterations.length; i++) {
    const count = run.iterations[i]!
    const offset = i * 4
    const t = count / params.maxIterations
    const inside = count >= params.maxIterations

    data[offset] = inside ? 0 : 255 * (0.5 + 0.5 * Math.cos(6.0 * t + 0.2))
    data[offset + 1] = inside ? 0 : 255 * (0.5 + 0.5 * Math.cos(6.0 * t + 2.3))
    data[offset + 2] = inside ? 0 : 255 * (0.5 + 0.5 * Math.cos(6.0 * t + 4.1))
    data[offset + 3] = 255
  }

  return image
}
