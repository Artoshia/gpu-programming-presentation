type Axis = readonly [number, number, number]

/** Floats per vertex: position (3) + normal (3). */
export const VERTEX_FLOATS = 6
export const VERTEX_STRIDE = VERTEX_FLOATS * Float32Array.BYTES_PER_ELEMENT

const AXES: Axis[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

const cross = (a: Axis, b: Axis): Axis => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
]

/**
 * A unit cube centred on the origin, built face by face so every vertex carries
 * its own flat normal. Winding is counter-clockwise seen from outside.
 */
export const createCubeGeometry = (): { vertices: Float32Array; indices: Uint16Array } => {
  const vertices = new Float32Array(AXES.length * 4 * VERTEX_FLOATS)
  const indices = new Uint16Array(AXES.length * 6)
  let v = 0
  let i = 0

  AXES.forEach((normal, face) => {
    // Any axis not parallel to the normal works as the face's "right" vector.
    const u: Axis = Math.abs(normal[1]!) === 1 ? [1, 0, 0] : [0, 1, 0]
    const w = cross(normal, u)

    for (const [su, sw] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      for (let axis = 0; axis < 3; axis++) {
        vertices[v++] = (normal[axis]! + su * u[axis]! + sw * w[axis]!) * 0.5
      }
      for (let axis = 0; axis < 3; axis++) vertices[v++] = normal[axis]!
    }

    const base = face * 4
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], i)
    i += 6
  })

  return { vertices, indices }
}

export const CUBE_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: VERTEX_STRIDE,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
    { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
  ],
}
