/*
 * Vertex shader for the physical water surface geometry.
 * Displaces vertices vertically based on the GPGPU height map
 * and enforces strict World Space coordinate output for accurate analytical raytracing.
 */
#include <common>
#include <shadowmap_pars_vertex>

uniform sampler2D tHeightMap;
uniform sampler2D tNormalMap;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
/* 1. Fetch simulation data from the FBO textures */
    float height = texture2D(tHeightMap, uv).r;

/* Decode normals from [0, 1] RGB space back to [-1, 1] directional vectors */
    vec3 nMap = texture2D(tNormalMap, uv).xyz * 2.0 - 1.0;
    vec3 localNormal = normalize(vec3(nMap.x, nMap.z, -nMap.y));

/* 2. Apply vertical wave displacement */
    vec3 displacedPosition = position;
    displacedPosition.y += height;

/* 3. Transform position strictly into World Space for fragment raytracing */
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPosition.xyz;

/* 4. Transform normals avoiding scale distortion using the normalMatrix (mat3(modelMatrix)) */
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);

/* 5. Compute View Space normal explicitly for the Three.js shadow chunk to process Normal Bias */
    vec3 transformedNormal = normalize(normalMatrix * localNormal);

/* 6. Process default Three.js shadow map coordinates */
    #include <shadowmap_vertex>

/* 7. Final screen projection for the GPU rasterizer */
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}