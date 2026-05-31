/*
 * Solves the 2D wave equation using Verlet integration.
 * Handles wave propagation across the grid and computes physical displacement
 * caused by interactive objects (e.g., the sphere).
 */
uniform sampler2D tHeightMap;
uniform vec2 delta;
uniform float damping;

uniform vec3 sphereCenter;
uniform vec3 oldSphereCenter;
uniform float sphereRadius;
uniform float poolSize;

varying vec2 vUv;

/*
 * Analytically calculates the precise vertical penetration depth
 * of the sphere into the resting water plane (y = 0.0).
 */
float getSpherePenetration(vec3 center, vec2 pos) {
    float dist = length(pos - center.xz);

/* Soft mask evaluating if the current pixel is within the sphere's radius */
    float mask = 1.0 - smoothstep(sphereRadius * 0.8, sphereRadius, dist);

    if (mask > 0.0) {
    /* Pythagorean theorem to find the vertical height of the sphere at this distance */
        float hOffset = sqrt(max(0.0, sphereRadius * sphereRadius - dist * dist));
        float top = center.y + hOffset;
        float bottom = center.y - hOffset;

    /* The sphere only displaces fluid when intersecting the surface boundary */
        if (top > 0.0 && bottom < 0.0) {
        /* * KINEMATIC DAMPING:
             * min(top, -bottom) ensures the displacement smoothly scales from 0 (entering from above),
             * reaches maximum depth at the equator, and cleanly tapers to 0 as it fully submerges.
             * This prevents violent physics explosions when dragging a completely submerged object.
             */
            return min(top, -bottom) * mask;
        }
    }
    return 0.0;
}

void main() {
    vec2 dx = vec2(delta.x, 0.0);
    vec2 dy = vec2(0.0, delta.y);

/* Gather the energy (height) from the 4 adjacent cardinal texels */
    float neighborSum = texture2D(tHeightMap, vUv - dx).r +
    texture2D(tHeightMap, vUv + dx).r +
    texture2D(tHeightMap, vUv - dy).r +
    texture2D(tHeightMap, vUv + dy).r;

    vec4 data = texture2D(tHeightMap, vUv);
    float currentHeight = data.r;
    float previousHeight = data.g;

/* * Core Wave Equation (Verlet Integration).
     * Computes acceleration based on neighbors, applies velocity, and adds viscosity (damping).
     */
    float newHeight = (neighborSum * 0.5) - previousHeight;
    newHeight *= damping;

/* --- RIGID BODY COLLISION (DIFFERENTIAL KINEMATICS) --- */
    vec2 worldXZ = (vUv - 0.5) * poolSize;

/* Corrected coordinate axes to map WebGL UV space to Three.js world space */
    worldXZ *= -1.0;
    worldXZ.x *= -1.0;

/* Calculate how much fluid volume was displaced between the last frame and this frame */
    float oldPenetration = getSpherePenetration(oldSphereCenter, worldXZ);
    float newPenetration = getSpherePenetration(sphereCenter, worldXZ);
    float displacement = newPenetration - oldPenetration;

/* Constant physical multiplier tuning the resistance and wave generation force */
    float forceMultiplier = 0.2;
    newHeight += displacement * forceMultiplier;

/* Hard clamp to prevent catastrophic physics instability (NaN explosions) */
    newHeight = clamp(newHeight, -2.0, 2.0);

/* * Shift states for the next frame's Verlet integration:
     * R channel stores the new current state.
     * G channel archives the old state (becomes previousHeight next frame).
     */
    gl_FragColor = vec4(newHeight, currentHeight, 0.0, 1.0);
}