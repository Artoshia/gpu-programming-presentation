export interface InputState {
  pressed: Set<string>
  /** Mouse movement accumulated since the last takeMouseDelta(). */
  dx: number
  dy: number
  locked: boolean
}

export const createInputState = (): InputState => ({ pressed: new Set(), dx: 0, dy: 0, locked: false })

/**
 * Wires keyboard and pointer-lock listeners into the state.
 * Click the canvas to capture the mouse, Escape to release it. Returns a detach function.
 */
export const attachInput = (canvas: HTMLCanvasElement, state: InputState): (() => void) => {
  const onKeyDown = (e: Event): void => {
    const ev = e as KeyboardEvent
    if (ev.repeat) return
    state.pressed.add(ev.code)
    if (ev.code === 'Space') ev.preventDefault()
  }

  const onKeyUp = (e: Event): void => {
    state.pressed.delete((e as KeyboardEvent).code)
  }

  const onBlur = (): void => state.pressed.clear()

  const onClick = (): void => {
    // Chrome returns a promise here, older browsers return undefined.
    if (!state.locked) void Promise.resolve(canvas.requestPointerLock()).catch(() => {})
  }

  const onPointerLockChange = (): void => {
    state.locked = document.pointerLockElement === canvas
    if (!state.locked) state.pressed.clear()
  }

  const onMouseMove = (e: Event): void => {
    if (!state.locked) return
    const ev = e as MouseEvent
    state.dx += ev.movementX
    state.dy += ev.movementY
  }

  const listeners: Array<[EventTarget, string, EventListener]> = [
    [window, 'keydown', onKeyDown],
    [window, 'keyup', onKeyUp],
    [window, 'blur', onBlur],
    [canvas, 'click', onClick],
    [document, 'pointerlockchange', onPointerLockChange],
    [document, 'mousemove', onMouseMove],
  ]

  for (const [target, type, handler] of listeners) target.addEventListener(type, handler)
  return () => {
    for (const [target, type, handler] of listeners) target.removeEventListener(type, handler)
  }
}

/** Returns 1, -1 or 0 depending on which of the two keys is held. */
export const keyAxis = (state: InputState, positive: string, negative: string): number =>
  (state.pressed.has(positive) ? 1 : 0) - (state.pressed.has(negative) ? 1 : 0)

export const isDown = (state: InputState, ...codes: string[]): boolean => codes.some((code) => state.pressed.has(code))

/** Reads and clears the accumulated mouse movement. */
export const takeMouseDelta = (state: InputState): [number, number] => {
  const delta: [number, number] = [state.dx, state.dy]
  state.dx = 0
  state.dy = 0
  return delta
}
