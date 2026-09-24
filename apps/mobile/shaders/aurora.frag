// Animated aurora / gradient-mesh background used on splash, onboarding and auth.
// The native Flutter take on the shaders.com hero effect used on the website.
#version 460 core
#include <flutter/runtime_effect.glsl>

uniform vec2 uSize;
uniform float uTime;
uniform vec4 uColorA; // base
uniform vec4 uColorB; // mid
uniform vec4 uColorC; // highlight

out vec4 fragColor;

void main() {
  vec2 uv = FlutterFragCoord().xy / uSize;
  float t = uTime * 0.15;

  float w1 = sin(uv.x * 3.0 + t * 2.0 + sin(uv.y * 2.0 + t)) * 0.5 + 0.5;
  float w2 = sin(uv.y * 4.0 - t * 1.5 + cos(uv.x * 3.0 - t)) * 0.5 + 0.5;

  vec3 col = mix(uColorA.rgb, uColorB.rgb, smoothstep(0.1, 0.9, w1 * uv.y + 0.2));
  col = mix(col, uColorC.rgb, smoothstep(0.55, 1.0, w2 * (1.0 - uv.y) + 0.15) * 0.8);

  float vignette = smoothstep(1.2, 0.3, length(uv - 0.5));
  fragColor = vec4(col * (0.75 + 0.25 * vignette), 1.0);
}
