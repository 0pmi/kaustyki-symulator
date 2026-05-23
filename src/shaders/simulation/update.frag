/**
 * Computes the 2D wave equation using Verlet integration.
 * Channel R: Current height
 * Channel G: Previous height
 */
uniform sampler2D tHeightMap;
uniform vec2 delta;
uniform float damping;

varying vec2 vUv;

void main() {
    // Spatial discrete steps
    vec2 dx = vec2(delta.x, 0.0);
    vec2 dy = vec2(0.0, delta.y);

    // Sum of neighboring heights
    float neighborSum = texture2D(tHeightMap, vUv - dx).r +
                        texture2D(tHeightMap, vUv + dx).r +
                        texture2D(tHeightMap, vUv - dy).r +
                        texture2D(tHeightMap, vUv + dy).r;

    // Current state
    vec4 data = texture2D(tHeightMap, vUv);
    float currentHeight = data.r;
    float previousHeight = data.g;

    // Verlet integration step
    float newHeight = (neighborSum * 0.5) - previousHeight;
    newHeight *= damping;

    // Shift time states: new height goes to R, current height becomes previous (G)
    gl_FragColor = vec4(newHeight, currentHeight, 0.0, 1.0);
}