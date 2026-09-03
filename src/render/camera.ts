import { mat4, vec3, type Mat4, type Vec3 } from 'wgpu-matrix'
import { isDown, keyAxis, takeMouseDelta, type InputState } from './input'

const UP = vec3.create(0, 1, 0)
const PITCH_LIMIT = Math.PI / 2 - 0.01

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

export interface CameraState {
  position: Vec3
  /** Radians around +Y. 0 looks down -Z. */
  yaw: number
  pitch: number
  fovY: number
  near: number
  far: number
  /** Units per second, multiplied by sprint while Shift is held. */
  moveSpeed: number
  sprint: number
  /** Radians of rotation per pixel of mouse movement. */
  sensitivity: number
}

export const createCameraState = (overrides: Partial<CameraState> = {}): CameraState => ({
  position: vec3.create(0, 3, 12),
  yaw: 0,
  pitch: -0.16,
  fovY: (60 * Math.PI) / 180,
  near: 0.1,
  far: 200,
  moveSpeed: 6,
  sprint: 3,
  sensitivity: 0.0022,
  ...overrides,
})

/** Unit vector the camera looks along. */
export const cameraForward = (camera: CameraState, out = vec3.create()): Vec3 => {
  const cosPitch = Math.cos(camera.pitch)
  return vec3.set(cosPitch * Math.sin(camera.yaw), Math.sin(camera.pitch), -cosPitch * Math.cos(camera.yaw), out)
}

/** Unit vector pointing right of the camera, flat on the XZ plane. */
export const cameraRight = (camera: CameraState, out = vec3.create()): Vec3 =>
  vec3.set(Math.cos(camera.yaw), 0, Math.sin(camera.yaw), out)

/** Applies one frame of mouse look and WASD/Space/Ctrl movement. */
export const updateCamera = (camera: CameraState, input: InputState, dt: number): void => {
  const [dx, dy] = takeMouseDelta(input)
  if (input.locked) {
    camera.yaw += dx * camera.sensitivity
    camera.pitch = clamp(camera.pitch - dy * camera.sensitivity, -PITCH_LIMIT, PITCH_LIMIT)
  }

  const speed = camera.moveSpeed * dt * (isDown(input, 'ShiftLeft', 'ShiftRight') ? camera.sprint : 1)
  const move = (direction: Vec3, distance: number): void => {
    if (distance !== 0) vec3.addScaled(camera.position, direction, distance, camera.position)
  }

  move(cameraForward(camera), keyAxis(input, 'KeyW', 'KeyS') * speed)
  move(cameraRight(camera), keyAxis(input, 'KeyD', 'KeyA') * speed)
  move(UP, keyAxis(input, 'Space', 'ControlLeft') * speed)
}

/** Combined projection * view matrix for the given aspect ratio. */
export const cameraViewProjection = (camera: CameraState, aspect: number, out = mat4.create()): Mat4 => {
  const proj = mat4.perspective(camera.fovY, aspect, camera.near, camera.far)
  const target = vec3.add(camera.position, cameraForward(camera))
  const view = mat4.lookAt(camera.position, target, UP)
  return mat4.multiply(proj, view, out)
}
