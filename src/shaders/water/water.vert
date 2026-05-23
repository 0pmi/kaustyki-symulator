/**
 * Vertex shader for the water surface.
 * Displaces vertices and enforces strict World Space coordinate output
 * for accurate analytical raytracing in the fragment stage.
 */
uniform sampler2D tHeightMap;
uniform sampler2D tNormalMap;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal; // Explicitly renamed to denote World Space

void main() {
    // 1. Fetch fluid simulation data
    float height = texture2D(tHeightMap, uv).r;
    vec3 nMap = texture2D(tNormalMap, uv).xyz * 2.0 - 1.0;

    vec3 localNormal = normalize(vec3(nMap.x, nMap.z, -nMap.y));

    // 2. Vertical displacement based on the wave equation
    vec3 displacedPosition = position;
    displacedPosition.y += height;

    // 3. Transform position strictly to World Space
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPosition.xyz;

    // 4. Transform normal strictly to World Space using the upper-left 3x3 of the model matrix
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);

    // 5. Final projection for the rasterizer
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}