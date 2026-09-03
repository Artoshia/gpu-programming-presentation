struct Globals {
  viewProjection : mat4x4f,
  cameraPosition : vec3f,
  skyColor : vec3f,
};

@group(0) @binding(0) var<uniform> globals : Globals;

struct VertexInput {
  // Per-vertex, from the cube geometry buffer.
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
  // Per-instance: the model matrix arrives as four column vectors.
  @location(2) model0 : vec4f,
  @location(3) model1 : vec4f,
  @location(4) model2 : vec4f,
  @location(5) model3 : vec4f,
  @location(6) color : vec3f,
};

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) worldPosition : vec3f,
  @location(1) worldNormal : vec3f,
  @location(2) color : vec3f,
};

const LIGHT_DIRECTION = normalize(vec3f(0.4, 1.0, 0.35));
const LIGHT_COLOR = vec3f(1.0, 0.96, 0.9);
const GROUND_COLOR = vec3f(0.08, 0.07, 0.09);

@vertex
fn vertexMain(input : VertexInput) -> VertexOutput {
  let model = mat4x4f(input.model0, input.model1, input.model2, input.model3);
  let worldPosition = model * vec4f(input.position, 1.0);

  // Dividing by the squared column lengths cancels the instance scale, which
  // keeps normals correct on non-uniformly scaled cubes such as the floor slab.
  let squaredScale = vec3f(
    dot(model[0].xyz, model[0].xyz),
    dot(model[1].xyz, model[1].xyz),
    dot(model[2].xyz, model[2].xyz),
  );

  var output : VertexOutput;
  output.clipPosition = globals.viewProjection * worldPosition;
  output.worldPosition = worldPosition.xyz;
  output.worldNormal = normalize((model * vec4f(input.normal / squaredScale, 0.0)).xyz);
  output.color = input.color;
  return output;
}

@fragment
fn fragmentMain(input : VertexOutput) -> @location(0) vec4f {
  let normal = normalize(input.worldNormal);
  let viewDirection = normalize(globals.cameraPosition - input.worldPosition);

  // Hemispheric ambient: sky above, bounce light below.
  let ambient = mix(GROUND_COLOR, globals.skyColor, normal.y * 0.5 + 0.5);
  let diffuse = max(dot(normal, LIGHT_DIRECTION), 0.0) * LIGHT_COLOR;

  let halfway = normalize(LIGHT_DIRECTION + viewDirection);
  let specular = pow(max(dot(normal, halfway), 0.0), 48.0) * 0.25;

  let lit = input.color * (ambient + diffuse) + specular;
  // Cheap gamma correction so the mid-tones do not look muddy.
  return vec4f(pow(lit, vec3f(1.0 / 2.2)), 1.0);
}
