import { mat4, vec3, type Vec3 } from 'wgpu-matrix'

/** Ambient sky tint, shared by the clear colour and the shader's hemispheric light. */
export const SKY_COLOR = vec3.create(0.34, 0.42, 0.56)

/** Floats per instance: model matrix (16) + colour (3) + padding (1). */
export const INSTANCE_FLOATS = 20
export const INSTANCE_STRIDE = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT

export interface CubeInstance {
  position: Vec3
  scale: Vec3
  color: Vec3
  /** Radians per second around Y. */
  spin: number
}

/** Cheap HSV to RGB, hue in turns. */
const hueColor = (hue: number, saturation = 0.55, value = 0.9): Vec3 => {
  const channel = (n: number): number => {
    const k = (n + hue * 6) % 6
    return value * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1)))
  }
  return vec3.create(channel(5), channel(3), channel(1))
}

/** A ring of cubes around a taller centre block, sitting on a wide flat slab. */
export const createScene = (ringCount = 8, ringRadius = 5): CubeInstance[] => {
  const ring = Array.from({ length: ringCount }, (_, i) => {
    // Half a step of offset keeps the ring from hiding the centre block.
    const angle = ((i + 0.5) / ringCount) * Math.PI * 2
    const height = 1 + (i % 3) * 0.6
    return {
      position: vec3.create(Math.cos(angle) * ringRadius, height / 2, Math.sin(angle) * ringRadius),
      scale: vec3.create(1, height, 1),
      color: hueColor(i / ringCount),
      spin: 0.3 + (i % 4) * 0.15,
    }
  })

  return [
    {
      position: vec3.create(0, -0.25, 0),
      scale: vec3.create(ringRadius * 4, 0.5, ringRadius * 4),
      color: vec3.create(0.16, 0.17, 0.2),
      spin: 0,
    },
    {
      position: vec3.create(0, 1.25, 0),
      scale: vec3.create(1.5, 2.5, 1.5),
      color: vec3.create(0.85, 0.85, 0.88),
      spin: -0.25,
    },
    ...ring,
  ]
}

/** Packs model matrices and colours for the given time into a buffer-ready array. */
export const writeInstances = (instances: CubeInstance[], timeSeconds: number, out: Float32Array): Float32Array => {
  const model = mat4.create()
  instances.forEach((instance, i) => {
    mat4.translation(instance.position, model)
    mat4.rotateY(model, instance.spin * timeSeconds, model)
    mat4.scale(model, instance.scale, model)

    const base = i * INSTANCE_FLOATS
    out.set(model, base)
    out.set(instance.color, base + 16)
  })
  return out
}

export const INSTANCE_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: INSTANCE_STRIDE,
  stepMode: 'instance',
  attributes: [
    // A mat4x4 crosses four vertex attribute slots, one per column.
    { shaderLocation: 2, offset: 0, format: 'float32x4' },
    { shaderLocation: 3, offset: 16, format: 'float32x4' },
    { shaderLocation: 4, offset: 32, format: 'float32x4' },
    { shaderLocation: 5, offset: 48, format: 'float32x4' },
    { shaderLocation: 6, offset: 64, format: 'float32x3' }, // colour
  ],
}
