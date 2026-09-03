import shaderCode from './shaders/square.wgsl?raw'
import { createBufferWithData } from '../shared/gpu'

export { shaderCode as squareShaderSource }

/** Threads per workgroup. Must match @workgroup_size in square.wgsl. */
export const WORKGROUP_SIZE = 8

/** How many numbers the demo squares. Deliberately not a multiple of WORKGROUP_SIZE. */
export const SQUARE_COUNT = 20

/** Floats/uints per Result: value, workgroup, thread, padding. */
const RESULT_FIELDS = 4

export interface ThreadResult {
  index: number
  input: number
  output: number
  /** Which workgroup ran this element. */
  workgroup: number
  /** Which thread inside that workgroup. */
  thread: number
}

export interface SquareRun {
  results: ThreadResult[]
  workgroups: number
  threads: number
  milliseconds: number
}

/**
 * Squares every number in the array on the GPU, one thread per number.
 * Input goes in a storage buffer, the shader writes results into a second one,
 * and the results are copied into a mappable buffer to be read on the CPU.
 */
export const runSquares = async (device: GPUDevice, inputs: Float32Array): Promise<SquareRun> => {
  const startTime = performance.now()
  const resultBytes = inputs.length * RESULT_FIELDS * 4

  const inputBuffer = createBufferWithData(device, inputs, GPUBufferUsage.STORAGE, 'inputs')
  const resultBuffer = device.createBuffer({
    label: 'results',
    size: resultBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  // Storage buffers cannot be read by the CPU, so results are copied here first.
  const readbackBuffer = device.createBuffer({
    label: 'readback',
    size: resultBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  const pipeline = device.createComputePipeline({
    label: 'square',
    layout: 'auto',
    compute: { module: device.createShaderModule({ label: 'square', code: shaderCode }), entryPoint: 'square' },
  })

  const encoder = device.createCommandEncoder()
  const pass = encoder.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(
    0,
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: resultBuffer } },
      ],
    }),
  )

  // Dispatch counts workgroups, not threads: 24 numbers means 3 groups of 8.
  const workgroups = Math.ceil(inputs.length / WORKGROUP_SIZE)
  pass.dispatchWorkgroups(workgroups)
  pass.end()

  encoder.copyBufferToBuffer(resultBuffer, 0, readbackBuffer, 0, resultBytes)
  device.queue.submit([encoder.finish()])

  await readbackBuffer.mapAsync(GPUMapMode.READ)
  const raw = readbackBuffer.getMappedRange().slice(0)
  readbackBuffer.unmap()

  // The same bytes read two ways: the value is a float, the ids are integers.
  const floats = new Float32Array(raw)
  const uints = new Uint32Array(raw)
  const results = Array.from(inputs, (input, index) => ({
    index,
    input,
    output: floats[index * RESULT_FIELDS] ?? 0,
    workgroup: uints[index * RESULT_FIELDS + 1] ?? 0,
    thread: uints[index * RESULT_FIELDS + 2] ?? 0,
  }))

  for (const buffer of [inputBuffer, resultBuffer, readbackBuffer]) buffer.destroy()

  return { results, workgroups, threads: workgroups * WORKGROUP_SIZE, milliseconds: performance.now() - startTime }
}
