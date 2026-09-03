# WebGPU cubes

A minimal but complete WebGPU starter in TypeScript and WGSL: a fly camera with WASD, a handful of
instanced cubes, a standalone compute pass that does non-render work on the same device, and a
slide deck at `/talk/` that explains the whole thing.

Reference material: the [WebGPU samples](https://webgpu.github.io/webgpu-samples/) and the
[spec](https://www.w3.org/TR/webgpu/).

## Run

```bash
npm install
npm run dev
```

Needs a browser with WebGPU: Chrome/Edge 113+, Firefox 141+ or Safari 26+.

## Controls

Click the canvas to capture the mouse.

| Input | Action |
| --- | --- |
| Mouse | Look |
| W A S D | Move |
| Space / Ctrl | Up / down |
| Shift | Sprint |
| Esc | Release the mouse |

## Layout

Three independent pages sharing one helper module. Nothing on the render page touches the compute
code, and the compute page never creates a canvas. Every module is a set of plain functions over
plain data; each page's `main.ts` is the only place that holds state and wires things together.

| Path | Role |
| --- | --- |
| `index.html`, `src/render/` | The cubes: camera, input, geometry, scene, pipeline |
| `compute/index.html`, `src/compute/` | The compute demo, run by a button |
| `talk/index.html`, `src/talk/` | The slide deck |
| `src/shared/gpu.ts` | Device request, canvas setup, canvas sizing, buffer helper |
| `src/shared/highlight.ts` | Shiki syntax colouring for the TypeScript and WGSL shown on the pages |

### Render page

| File | Role |
| --- | --- |
| `src/render/main.ts` | Startup, resources, the frame loop |
| `src/render/camera.ts` | Camera state, movement, view-projection matrix |
| `src/render/input.ts` | Keyboard and pointer-lock state |
| `src/render/cube.ts` | Generated cube geometry and its vertex layout |
| `src/render/scene.ts` | Cube placement and per-instance data packing |
| `src/render/pipeline.ts` | Render pipeline and bind group |
| `src/render/targets.ts` | Depth and multisampled colour targets |
| `src/render/shaders/cube.wgsl` | Vertex and fragment shaders |

All cubes are drawn with one `drawIndexed` call. The geometry buffer holds a single unit cube
(24 vertices, flat normals); a second vertex buffer stepped per instance carries each cube's model
matrix and colour, rebuilt on the CPU each frame and uploaded with `writeBuffer`. A `mat4x4f`
occupies four vertex attribute slots, one per column, which is why the instance layout runs from
`@location(2)` to `@location(5)`.

The camera writes a view-projection matrix, its own position and the sky colour into a uniform
buffer read by both shader stages. Depth testing uses a `depth24plus` texture recreated whenever
the canvas resizes.

The `4x MSAA` checkbox toggles antialiasing so you can see what it costs and what it buys. A
pipeline is compiled for the target it draws into, so there is one pipeline per sample count and
the toggle switches between them. With antialiasing on, the pass draws into an off-screen 4x
target and names the canvas texture as its `resolveTarget`, which the GPU averages down at the end
of the pass. With it off, the pass draws to the canvas directly and no extra target exists.

### Compute page

At `/compute/`, with no rendering involved. Two examples, both driven by buttons.

| File | Role |
| --- | --- |
| `src/compute/main.ts` | Page wiring: build the inputs, run on click, draw the results |
| `src/compute/square.ts` | The small example: buffers, pipeline, dispatch and readback |
| `src/compute/mandelbrot.ts` | The scale example, plus the same maths in JavaScript to compare |
| `src/compute/shaders/` | Both compute shaders |

The first example squares 20 numbers with one thread each, and reports which workgroup and thread
produced every result. That is far too little work to be worth a GPU, and it is only there to show
the shape of the thing.

The second one runs it at a size where the hardware matters: a 1024 x 1024 Mandelbrot zoom, one
thread per pixel, each pixel looping up to 2000 iterations. Roughly a billion multiplications with
no communication between threads, which is exactly what the GPU is built for. On this machine the
maths takes about 13 ms, 24 ms once every pixel is back on the CPU, against about 3250 ms of
blocked main thread for the identical JavaScript. That is 241x on the maths and 134x end to end.
Pipelines are warmed up at startup so the first click is not paying for shader compilation, and the
page reports the maths and the readback separately because the second one is often the larger cost.

Running both also reports how many pixels the two disagree on, usually around 17%. WGSL works in
32-bit floats and JavaScript numbers are 64-bit, and on the boundary of the set the last bit
decides whether a pixel escapes after 50 steps or 500. Forcing the JavaScript version to 32 bits
with `Math.fround` narrows the gap but makes that loop several times slower, which would be a
dishonest thing to time against. Precision is a real thing to plan for on the GPU, not a bug here.

The shape of the work is the same for any GPU compute task:

1. Put the input in a storage buffer, or in a uniform buffer if it is small and read-only.
2. Create a second storage buffer for the results.
3. Dispatch enough workgroups to cover the data. `dispatchWorkgroups` counts groups, not threads,
   so 20 numbers at 8 threads per group means 3 groups and 4 threads with nothing to do. The
   shader's bounds check sends them home.
4. Copy the results into a buffer created with `MAP_READ`, since storage buffers cannot be read
   directly by the CPU, then `mapAsync` it and read the bytes.

Each thread finds its own element with `global_invocation_id`. Nothing is shared, nothing is
ordered, and no thread waits for another. Reading results back costs real time, so work that stays
on the GPU, such as feeding a render pass, skips step 4 entirely.

### Talk page

At `/talk/`, 17 slides covering what WebGPU is, how a GPU differs from a CPU, the render pipeline,
the three shader stages, the TypeScript side of the boundary, where this is useful, how the same
model shows up again in wgpu and Bevy, and a closing look at Artoshia. Arrow keys move, the URL
hash is the slide number.

Each demo is linked from the slide it illustrates rather than all at once up front, so the cubes
come up on the pipeline and shader slides and the compute page comes up on the compute, CPU
comparison and readback slides.

| File | Role |
| --- | --- |
| `talk/index.html` | The slide content |
| `src/talk/main.ts` | Navigation, hash sync, progress |
| `src/talk/snippets.ts` | Pulls code samples out of the real source files |
| `src/talk/workgroups.ts` | Draws the thread grid from the compute demo's own constants |
| `src/talk/talk.css` | Deck styling |

No slide contains a copied code sample. A `<pre data-src data-symbol>` names a file and a
declaration, and `snippets.ts` extracts that declaration from the source at build time, so a
snippet cannot drift away from the code it claims to show. The workgroup diagram is drawn from
`WORKGROUP_SIZE` and `SQUARE_COUNT` in `src/compute/square.ts` for the same reason.

Colouring comes from `src/shared/highlight.ts`, which the compute page uses too for the two
shaders it prints. It is Shiki with its bundled TextMate grammars for TypeScript and WGSL. Both
tokenize under Shiki's JavaScript regex engine, so neither page ships the Oniguruma WebAssembly
build. The grammars and the theme are dynamic imports, so they load as separate chunks and the
code appears in plain text first. The render page does not use any of it.
