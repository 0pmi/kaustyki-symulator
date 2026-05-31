/*
 * Injects a localized kinetic impact (droplet) into the simulation.
 */
uniform sampler2D tHeightMap;
uniform vec2 center;
uniform float radius;
uniform float strength;

varying vec2 vUv;

void main() {
    vec4 data = texture2D(tHeightMap, vUv);

/* Calculate distance from the impact epicenter */
    float dist = length(vUv - center);

/* * Construct a smooth, bell-like curve for the droplet profile.
     * Using a cosine interpolation prevents sharp, jagged edges
     * which would otherwise cause instability in the wave solver.
     */
    float drop = max(0.0, 1.0 - dist / radius);
    drop = 0.5 - cos(drop * 3.1415926) * 0.5;

/* Apply displacement directly to the height channel */
    data.r += drop * strength;

    gl_FragColor = data;
}