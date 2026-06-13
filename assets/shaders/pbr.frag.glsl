// ═══════════════════════════════════════════════════════════════
// PBR Fragment Shader — Emperor's Conquest 3D Engine
// Cook-Torrance BRDF with IBL (Image-Based Lighting) approximation
// Supports: Albedo, Metallic, Roughness, Normal, AO, Emissive maps
// ═══════════════════════════════════════════════════════════════

precision highp float;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUV;
varying vec3 vViewDir;

// ── Material Parameters ──
uniform vec3 uAlbedo;        // Base color
uniform float uMetallic;     // 0 = dielectric, 1 = metal
uniform float uRoughness;    // 0 = mirror, 1 = diffuse
uniform float uAO;           // Ambient occlusion
uniform vec3 uEmissive;       // Self-illumination

// ── Textures (sampler2D) ──
uniform sampler2D tAlbedo;
uniform sampler2D tMetallic;
uniform sampler2D tRoughness;
uniform sampler2D tNormal;
uniform sampler2D tAO;

// ── Flags ──
uniform bool useAlbedoMap;
uniform bool useMetallicMap;
uniform bool useRoughnessMap;
uniform bool useNormalMap;
uniform bool useAOMap;

// ── Lighting ──
uniform vec3 uLightDir;       // Directional light direction (world space)
uniform vec3 uLightColor;     // Directional light color/intensity
uniform vec3 uAmbientColor;   // Ambient light
uniform float uAmbientStr;    // Ambient strength

// ── Constants ──
const float PI = 3.14159265359;
const float EPSILON = 0.0001;

// ── Normal map unpacking ──
vec3 getNormalFromMap() {
    if (!useNormalMap) return normalize(vNormal);
    vec3 tangentNormal = texture2D(tNormal, vUV).xyz * 2.0 - 1.0;
    // Build TBN matrix from normal + derivations
    vec3 q1 = dFdx(vWorldPos);
    vec3 q2 = dFdy(vWorldPos);
    vec2 st1 = dFdx(vUV);
    vec2 st2 = dFdy(vUV);
    vec3 N = normalize(vNormal);
    vec3 T = normalize(q1 * st2.t - q2 * st1.t);
    vec3 B = -normalize(cross(N, T));
    mat3 TBN = mat3(T, B, N);
    return normalize(TBN * tangentNormal);
}

// ── Distribution (GGX/Trowbridge-Reitz) ──
float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    float denom = NdotH2 * (a2 - 1.0) + 1.0;
    denom = PI * denom * denom;
    return a2 / max(denom, EPSILON);
}

// ── Geometry (Smith's method with Schlick-GGX) ──
float geometrySchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2 = geometrySchlickGGX(NdotV, roughness);
    float ggx1 = geometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
}

// ── Fresnel (Schlick approximation) ──
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// ── Fresnel with roughness for IBL ──
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
    return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(1.0 - cosTheta, 5.0);
}

// ── ACES tone mapping ──
vec3 ACESFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// ── Main ──
void main() {
    vec3 N = getNormalFromMap();
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(-uLightDir);
    vec3 H = normalize(V + L);

    // ── Sample textures or use uniforms ──
    vec3 albedo;
    if (useAlbedoMap) {
        albedo = pow(texture2D(tAlbedo, vUV).rgb, vec3(2.2)); // sRGB to linear
    } else {
        albedo = uAlbedo;
    }

    float metallic;
    if (useMetallicMap) {
        metallic = texture2D(tMetallic, vUV).r;
    } else {
        metallic = uMetallic;
    }

    float roughness;
    if (useRoughnessMap) {
        roughness = texture2D(tRoughness, vUV).r;
    } else {
        roughness = uRoughness;
    }

    float ao;
    if (useAOMap) {
        ao = texture2D(tAO, vUV).r;
    } else {
        ao = uAO;
    }

    // ── Fresnel reflectance at normal incidence ──
    vec3 F0 = mix(vec3(0.04), albedo, metallic);

    // ── Direct lighting (Cook-Torrance BRDF) ──
    float NDF = distributionGGX(N, H, roughness);
    float G = geometrySmith(N, V, L, roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + EPSILON;
    vec3 specular = numerator / denominator;

    // Energy conservation: diffuse and specular split
    vec3 kS = F;
    vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);

    // Lambertian diffuse
    float NdotL = max(dot(N, L), 0.0);
    vec3 diffuse = kD * albedo / PI;

    // Outgoing radiance
    vec3 Lo = (diffuse + specular) * uLightColor * NdotL;

    // ── Ambient (IBL approximation using hemisphere sampling) ──
    vec3 F_ambient = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);
    vec3 kD_ambient = (vec3(1.0) - F_ambient) * (1.0 - metallic);
    // Approximate irradiance with ambient color
    vec3 irradiance = uAmbientColor * uAmbientStr;
    vec3 diffuse_ambient = kD_ambient * albedo * irradiance;
    // Specular IBL approximation (simplified)
    vec3 R = reflect(-V, N);
    vec3 specular_ambient = F_ambient * irradiance * (roughness * roughness + 0.5);
    vec3 ambient = (diffuse_ambient + specular_ambient) * ao;

    // ── Final color ──
    vec3 color = ambient + Lo + uEmissive;

    // ── Tone mapping ──
    color = ACESFilm(color);

    // ── Gamma correction ──
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
}
