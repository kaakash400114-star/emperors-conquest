// ═══════════════════════════════════════════════════════════════
// PBR Vertex Shader — Emperor's Conquest 3D Engine
// Supports: Albedo, Metallic, Roughness, Normal mapping
// ═══════════════════════════════════════════════════════════════

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUV;
varying vec3 vViewDir;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vUV = uv;
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
