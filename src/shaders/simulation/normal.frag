/**
 * Computes the surface normals from the height map
 * using finite differences (central difference method).
 */
uniform sampler2D tHeightMap;
uniform vec2 delta;

varying vec2 vUv;

void main() {
    vec2 dx = vec2(delta.x, 0.0);
    vec2 dy = vec2(0.0, delta.y);

    float hLeft = texture2D(tHeightMap, vUv - dx).r;
    float hRight = texture2D(tHeightMap, vUv + dx).r;
    float hDown = texture2D(tHeightMap, vUv - dy).r;
    float hUp = texture2D(tHeightMap, vUv + dy).r;

    // Compute gradient
    vec3 normal = normalize(vec3(hLeft - hRight, hDown - hUp, 2.0));

    // Map from [-1, 1] to [0, 1] range for texture storage
    gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
}