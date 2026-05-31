/*
 * Computes surface normals dynamically from the height map.
 * Utilizes the central difference method (finite differences) to evaluate slopes.
 */
uniform sampler2D tHeightMap;
uniform vec2 delta;

varying vec2 vUv;

void main() {
/* Offset vectors for sampling neighboring texels */
    vec2 dx = vec2(delta.x, 0.0);
    vec2 dy = vec2(0.0, delta.y);

/* Sample heights from the immediate cardinal directions */
    float hLeft = texture2D(tHeightMap, vUv - dx).r;
    float hRight = texture2D(tHeightMap, vUv + dx).r;
    float hDown = texture2D(tHeightMap, vUv - dy).r;
    float hUp = texture2D(tHeightMap, vUv + dy).r;

/* * Compute the cross-product gradient based on slope differences.
     * The Z-component (2.0) defines the base steepness of the normal.
     */
    vec3 normal = normalize(vec3(hLeft - hRight, hDown - hUp, 2.0));

/* Encode the [-1, 1] normal vector into a [0, 1] RGB color space for texture storage */
    gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
}