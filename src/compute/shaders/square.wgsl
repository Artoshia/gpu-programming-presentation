// One thread per number. Thread 7 squares element 7, and nothing else.
// The workgroup and thread ids are written out too, so the page can show which
// thread produced which result.

const WORKGROUP_SIZE : u32 = 8u;

struct Result {
  value : f32,
  workgroup : u32,
  thread : u32,
  padding : u32,
};

@group(0) @binding(0) var<storage, read> inputs : array<f32>;
@group(0) @binding(1) var<storage, read_write> results : array<Result>;

@compute @workgroup_size(WORKGROUP_SIZE)
fn square(
  @builtin(global_invocation_id) global : vec3u,
  @builtin(local_invocation_id) local : vec3u,
  @builtin(workgroup_id) group : vec3u,
) {
  let index = global.x;

  // Dispatches are rounded up to whole workgroups, so the last few threads of
  // the last group can run past the end of the data. They exit here.
  if (index >= arrayLength(&inputs)) {
    return;
  }

  results[index].value = inputs[index] * inputs[index];
  results[index].workgroup = group.x;
  results[index].thread = local.x;
}
