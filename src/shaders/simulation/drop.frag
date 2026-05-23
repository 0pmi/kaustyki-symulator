/**
 * Injects a localized wave disruption (droplet) into the height map.
 */
uniform sampler2D tHeightMap;
uniform vec2 center;
uniform float radius;
uniform float strength;

varying vec2 vUv;

void main() {
    vec4 data = texture2D(tHeightMap, vUv);

    // Calculate distance from drop center
    float dist = length(vUv - center);

    // Smoothstep drop profile
    float drop = max(0.0, 1.0 - dist / radius);
    drop = 0.5 - cos(drop * 3.1415926) * 0.5;

    // Add displacement to current height
    data.r += drop * strength;

    gl_FragColor = data;
}