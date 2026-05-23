/**
 * Vertex shader for the water surface.
 * Displaces vertices vertically based on the GPGPU height map
 * and computes world-space vectors for lighting calculations.
 */
uniform sampler2D tHeightMap;
uniform sampler2D tNormalMap;

varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
    vUv = uv;

    // 1. Fetch simulation data
    float height = texture2D(tHeightMap, uv).r;

    // Normals are packed in [0, 1] range in the GPGPU step. Unpack to [-1, 1].
    vec3 localNormal = normalize(texture2D(tNormalMap, uv).xyz * 2.0 - 1.0);

    // 2. Vertex displacement
    vec3 displacedPosition = position;
    displacedPosition.y += height;

    // 3. Matrix transformations
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPosition.xyz;

    // Transform normal to world space
    vNormal = normalize(normalMatrix * localNormal);

    // Compute view position for specular and Fresnel calculations
    vec4 mvPosition = viewMatrix * worldPosition;
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
}