import { requestDevice } from '../shared/gpu'
import { showCode } from '../shared/highlight'
import { runSquares, SQUARE_COUNT, squareShaderSource, WORKGROUP_SIZE, type ThreadResult } from './square'
import {
  colorize,
  createGpuMandelbrot,
  disagreementPercent,
  defaultParams,
  mandelbrotShaderSource,
  runCpuMandelbrot,
  type MandelbrotParams,
  type MandelbrotRun,
} from './mandelbrot'

const squareInputs = Float32Array.from({ length: SQUARE_COUNT }, (_, i) => i + 1)

const el = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!

const inputsEl = el('#inputs')
const resultsEl = el('#results')
const squaresStatus = el('#squares-status')
const squaresButton = el<HTMLButtonElement>('#run-squares')
const sizeSelect = el<HTMLSelectElement>('#size')
const iterationsSelect = el<HTMLSelectElement>('#iterations')
const gpuButton = el<HTMLButtonElement>('#run-gpu')
const cpuButton = el<HTMLButtonElement>('#run-cpu')
const benchStatus = el('#bench-status')
const benchTable = el('#bench-table')
const canvas = el<HTMLCanvasElement>('#canvas')

interface Timing {
  compute: number
  total: number
  iterations: Uint32Array
}

const timings: { gpu: Timing | null; cpu: Timing | null } = { gpu: null, cpu: null }

/** A distinct hue per workgroup, so the split across groups is visible. */
const groupColor = (workgroup: number): string => `hsl(${(workgroup * 67) % 360} 70% 60%)`

const renderSquareInputs = (): void => {
  inputsEl.replaceChildren(
    ...Array.from(squareInputs, (value) => {
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.textContent = String(value)
      return chip
    }),
  )
}

const renderSquareResults = (results: ThreadResult[]): void => {
  resultsEl.replaceChildren(
    ...results.map((result) => {
      const cell = document.createElement('div')
      cell.className = 'cell'
      cell.style.setProperty('--group', groupColor(result.workgroup))
      cell.innerHTML =
        `<div>${result.input} squared = <b>${result.output}</b></div>` +
        `<div class="meta">workgroup ${result.workgroup} - thread ${result.thread}</div>`
      return cell
    }),
  )
}

const runSquaresDemo = async (device: GPUDevice): Promise<void> => {
  squaresButton.disabled = true
  const { results, workgroups, threads, milliseconds } = await runSquares(device, squareInputs)
  const wrong = results.filter((result) => result.output !== result.input * result.input).length

  renderSquareResults(results)
  squaresStatus.textContent = [
    `${workgroups} workgroups x ${WORKGROUP_SIZE} threads = ${threads} threads for ${SQUARE_COUNT} numbers`,
    `${threads - SQUARE_COUNT} threads had nothing to do and exited early`,
    `round trip ${milliseconds.toFixed(1)} ms, ${wrong === 0 ? 'all results match the CPU' : `${wrong} wrong results`}`,
  ].join('\n')
  squaresButton.disabled = false
}

const currentParams = (): MandelbrotParams =>
  defaultParams(Number(sizeSelect.value), Number(iterationsSelect.value))

const formatRate = (pixels: number, milliseconds: number): string =>
  `${((pixels / milliseconds) * 1000).toExponential(2).replace('e+', 'e')} px/s`

const showTimings = (params: MandelbrotParams): void => {
  const pixels = params.size * params.size
  benchTable.hidden = false

  const rows = [
    ['#gpu-compute', timings.gpu?.compute, 'fast'],
    ['#gpu-total', timings.gpu?.total, 'fast'],
    ['#cpu-time', timings.cpu?.total, 'slow'],
  ] as const

  for (const [selector, milliseconds, tone] of rows) {
    const row = el(selector)
    row.textContent = milliseconds === undefined ? '-' : `${milliseconds.toFixed(1)} ms`
    row.className = milliseconds === undefined ? '' : tone
    const rate = el(`${selector}-rate`)
    rate.textContent = milliseconds === undefined ? '-' : formatRate(pixels, milliseconds)
  }

  const { gpu, cpu } = timings
  el('#speedup').textContent =
    !gpu || !cpu
      ? 'run both to compare'
      : `${(cpu.total / gpu.compute).toFixed(0)}x faster at the maths, ` +
        `${(cpu.total / gpu.total).toFixed(0)}x faster once the pixels are back on the CPU`

  el('#agreement').textContent =
    !gpu || !cpu
      ? ''
      : `${disagreementPercent(gpu.iterations, cpu.iterations).toFixed(1)}% of pixels ended on a ` +
        `different iteration count: the shader works in 32-bit floats, JavaScript in 64-bit, and ` +
        `on the boundary of the set the last bit decides whether a pixel escapes early or late.`
}

const draw = (params: MandelbrotParams, run: MandelbrotRun): void => {
  canvas.width = params.size
  canvas.height = params.size
  canvas.getContext('2d')!.putImageData(colorize(run, params), 0, 0)
}

const runBenchmark = async (
  params: MandelbrotParams,
  execute: () => Promise<MandelbrotRun>,
  target: 'gpu' | 'cpu',
): Promise<void> => {
  gpuButton.disabled = true
  cpuButton.disabled = true
  benchStatus.textContent = `running ${params.size * params.size} pixels on the ${target.toUpperCase()}...`
  // Yield once so the status text lands before a CPU run blocks the main thread.
  await new Promise((resolve) => setTimeout(resolve, 0))

  const run = await execute()
  timings[target] = { compute: run.computeMilliseconds, total: run.totalMilliseconds, iterations: run.iterations }
  draw(params, run)
  showTimings(params)
  benchStatus.textContent =
    `${target.toUpperCase()} finished ${params.size * params.size} pixels in ${run.totalMilliseconds.toFixed(1)} ms`

  gpuButton.disabled = false
  cpuButton.disabled = false
}

const resetTimings = (): void => {
  timings.gpu = null
  timings.cpu = null
  benchTable.hidden = true
  benchStatus.textContent = ''
}

const start = async (): Promise<void> => {
  renderSquareInputs()
  void showCode(el('#squares-shader'), squareShaderSource, 'wgsl')
  void showCode(el('#mandelbrot-shader'), mandelbrotShaderSource, 'wgsl')

  // No canvas to configure: a compute-only page never needs a swap chain.
  const device = await requestDevice()
  const gpuMandelbrot = createGpuMandelbrot(device)

  squaresButton.addEventListener('click', () => void runSquaresDemo(device))
  gpuButton.addEventListener('click', () => {
    const params = currentParams()
    void runBenchmark(params, () => gpuMandelbrot(params), 'gpu')
  })
  cpuButton.addEventListener('click', () => {
    const params = currentParams()
    void runBenchmark(params, async () => runCpuMandelbrot(params), 'cpu')
  })
  for (const select of [sizeSelect, iterationsSelect]) select.addEventListener('change', resetTimings)

  // The first run of any pipeline pays for shader compilation and driver warm-up,
  // so get that out of the way before anything is timed on screen.
  await runSquares(device, squareInputs)
  await gpuMandelbrot(defaultParams(64, 64))

  squaresStatus.textContent = 'GPU ready. Press the button.'
}

start().catch((error: unknown) => {
  squaresStatus.className = 'status error'
  squaresStatus.textContent = error instanceof Error ? error.message : String(error)
  console.error(error)
})
