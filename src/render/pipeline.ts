import shaderCode from './shaders/cube.wgsl?raw'
import { DEPTH_FORMAT } from '../shared/gpu'
import { CUBE_VERTEX_LAYOUT } from './cube'
import { INSTANCE_LAYOUT } from './scene'

/** Bytes in the Globals uniform block: mat4x4f + two vec3f, each padded to 16. */
export const GLOBALS_SIZE = 96

export const createCubePipeline = (
  device: GPUDevice,
  format: GPUTextureFormat,
  sampleCount: number,
): GPURenderPipeline => {
  const module = device.createShaderModule({ label: 'cube shader', code: shaderCode })

  return device.createRenderPipeline({
    label: 'cube pipeline',
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vertexMain',
      buffers: [CUBE_VERTEX_LAYOUT, INSTANCE_LAYOUT],
    },
    fragment: {
      module,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    // 1 draws straight to the canvas, 4 draws to a 4x multisampled target.
    multisample: { count: sampleCount },
  })
}

export const createGlobalsBindGroup = (
  device: GPUDevice,
  pipeline: GPURenderPipeline,
  uniformBuffer: GPUBuffer,
): GPUBindGroup =>
  device.createBindGroup({
    label: 'globals',
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  })
