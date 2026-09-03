// One thread per pixel. Every pixel iterates z = z^2 + c until it escapes,
// which is a lot of arithmetic and no communication between threads at all.

struct Params {
  width : u32,
  height : u32,
  maxIterations : u32,
  padding : u32,
  center : vec2f,
  scale : f32,
  padding2 : f32,
};

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage, read_write> iterations : array<u32>;

@compute @workgroup_size(8, 8)
fn mandelbrot(@builtin(global_invocation_id) pixel : vec3u) {
  if (pixel.x >= params.width || pixel.y >= params.height) {
    return;
  }

  let size = vec2f(f32(params.width), f32(params.height));
  let c = params.center + (vec2f(f32(pixel.x), f32(pixel.y)) / size - 0.5) * params.scale;

  var z = vec2f(0.0, 0.0);
  var count = 0u;
  while (count < params.maxIterations && dot(z, z) <= 4.0) {
    z = vec2f(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    count += 1u;
  }

  iterations[pixel.y * params.width + pixel.x] = count;
}
