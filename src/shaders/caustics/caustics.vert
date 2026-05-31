/*
 * Forward-projects a dense vertex grid through the dynamic water surface.
 * Simulates photons traveling through the waves and refracting onto the pool floor.
 */
uniform sampler2D tHeightMap;
uniform sampler2D tNormalMap;
uniform vec3 lightDir;
uniform float poolSize;
uniform float poolDepth;
uniform float ior;
uniform float iorOffset;

varying vec3 vOldPos;
varying vec3 vNewPos;

void main() {
/* Map world geometry to the [0, 1] UV space of the simulation textures */
    vec2 uv = vec2(position.x, -position.y) / poolSize + 0.5;

/* Boolean mask (0.0 or 1.0) to strictly bound caustics within the physical pool limits */
    float isInside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);

/* Read simulation data, bounded by the pool mask */
    float height = texture2D(tHeightMap, clamp(uv, 0.0, 1.0)).r * isInside;
    vec3 nMap = texture2D(tNormalMap, clamp(uv, 0.0, 1.0)).xyz * 2.0 - 1.0;

/* Reconstruct the 3D surface normal */
    vec3 normal = normalize(vec3(nMap.x, nMap.z, -nMap.y));

/* Outside the pool bounds, the normal defaults to perfectly flat pointing upwards */
    normal = mix(vec3(0.0, 1.0, 0.0), normal, isInside);

/* Calculate the exact point of intersection on the water surface */
    vec3 surfacePos = vec3(position.x, height, position.y);

/* Apply Snell's Law to bend the light ray through the water */
    vec3 refractedDir = refract(lightDir, normal, 1.0 / (ior + iorOffset));

/* Trace the refracted ray mathematically down to the pool floor (-poolDepth) */
    float t = (-poolDepth - surfacePos.y) / refractedDir.y;
    vec3 hitPos = surfacePos + refractedDir * t;

/* Export original and projected positions for area calculation in the fragment shader */
    vOldPos = surfacePos;
    vNewPos = hitPos;

    gl_Position = projectionMatrix * viewMatrix * vec4(hitPos, 1.0);
}