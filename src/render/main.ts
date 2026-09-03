import { configureCanvas, createBufferWithData, requestDevice, syncCanvasSize } from '../shared/gpu'
import { createCubeGeometry } from './cube'
import { createCameraState, cameraViewProjection, updateCamera } from './camera'
import { attachInput, createInputState } from './input'
import { createScene, writeInstances, INSTANCE_FLOATS, SKY_COLOR } from './scene'
import { createCubePipeline, createGlobalsBindGroup, GLOBALS_SIZE } from './pipeline'
import { createTargets } from './targets'

// The shader gamma-corrects its output, so the clear colour needs the same curve
// to match the sky tint the cubes are lit with.
const toDisplay = (linear: number): number => linear ** (1 / 2.2)
const CLEAR_COLOR: GPUColor = {
  r: toDisplay(SKY_COLOR[0]!),
  g: toDisplay(SKY_COLOR[1]!),
  b: toDisplay(SKY_COLOR[2]!),
  a: 1,
}

/** Antialiasing off and on. 4 samples per pixel is the widely supported setting. */
const SAMPLE_COUNTS = [1, 4]

const start = async (canvas: HTMLCanvasElement, hud: HTMLElement, msaaToggle: HTMLInputElement): Promise<void> => {
  const device = await requestDevice()
  const { context, format } = configureCanvas(device, canvas)

  const geometry = createCubeGeometry()
  const vertexBuffer = createBufferWithData(device, geometry.vertices, GPUBufferUsage.VERTEX, 'cube vertices')
  const indexBuffer = createBufferWithData(device, geometry.indices, GPUBufferUsage.INDEX, 'cube indices')

  const scene = createScene()
  const instanceData = new Float32Array(scene.length * INSTANCE_FLOATS)
  const instanceBuffer = device.createBuffer({
    label: 'cube instances',
    size: instanceData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })

  const globalsData = new Float32Array(GLOBALS_SIZE / 4)
  const globalsBuffer = device.createBuffer({
    label: 'globals',
    size: GLOBALS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  // One pipeline per sample count: a pipeline is baked for the target it draws into.
  const pipelines = new Map(
    SAMPLE_COUNTS.map((count) => {
      const pipeline = createCubePipeline(device, format, count)
      return [count, { pipeline, bindGroup: createGlobalsBindGroup(device, pipeline, globalsBuffer) }]
    }),
  )

  const camera = createCameraState()
  const input = createInputState()
  attachInput(canvas, input)

  let sampleCount = msaaToggle.checked ? 4 : 1
  let targets = createTargets(device, format, canvas.width || 1, canvas.height || 1, sampleCount)

  const rebuildTargets = (): void => {
    targets.destroy()
    targets = createTargets(device, format, canvas.width, canvas.height, sampleCount)
  }

  msaaToggle.addEventListener('change', () => {
    sampleCount = msaaToggle.checked ? 4 : 1
    rebuildTargets()
  })

  let previousTime = performance.now()
  let smoothedFps = 60

  const frame = (now: number): void => {
    const dt = Math.min((now - previousTime) / 1000, 0.1)
    previousTime = now
    smoothedFps += (1 / Math.max(dt, 1e-4) - smoothedFps) * 0.05

    if (syncCanvasSize(canvas, device)) rebuildTargets()

    updateCamera(camera, input, dt)

    globalsData.set(cameraViewProjection(camera, canvas.width / canvas.height), 0)
    globalsData.set(camera.position, 16)
    globalsData.set(SKY_COLOR, 20)
    device.queue.writeBuffer(globalsBuffer, 0, globalsData)
    device.queue.writeBuffer(instanceBuffer, 0, writeInstances(scene, now / 1000, instanceData))

    const { pipeline, bindGroup } = pipelines.get(sampleCount)!
    const canvasView = context.getCurrentTexture().createView()

    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          // With MSAA the pass draws into the off-screen target and resolves onto the canvas.
          view: targets.colorView ?? canvasView,
          resolveTarget: targets.colorView ? canvasView : undefined,
          clearValue: CLEAR_COLOR,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: targets.depthView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })

    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bindGroup)
    pass.setVertexBuffer(0, vertexBuffer)
    pass.setVertexBuffer(1, instanceBuffer)
    pass.setIndexBuffer(indexBuffer, 'uint16')
    pass.drawIndexed(geometry.indices.length, scene.length)
    pass.end()

    device.queue.submit([encoder.finish()])

    const [x, y, z] = camera.position
    hud.textContent = [
      `${smoothedFps.toFixed(0)} fps   ${scene.length} cubes   ${canvas.width}x${canvas.height}   ${sampleCount > 1 ? `${sampleCount}x MSAA` : 'no MSAA'}`,
      `pos ${x!.toFixed(1)}, ${y!.toFixed(1)}, ${z!.toFixed(1)}`,
      input.locked ? 'WASD move   Space/Ctrl up-down   Shift sprint   Esc release' : 'click the canvas to look around',
    ].join('\n')

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

const canvas = document.querySelector<HTMLCanvasElement>('#gpu-canvas')!
const hud = document.querySelector<HTMLElement>('#hud')!
const errorBox = document.querySelector<HTMLElement>('#error')!
const msaaToggle = document.querySelector<HTMLInputElement>('#msaa')!

start(canvas, hud, msaaToggle).catch((error: unknown) => {
  hud.style.display = 'none'
  errorBox.style.display = 'grid'
  errorBox.textContent = error instanceof Error ? error.message : String(error)
  console.error(error)
})
