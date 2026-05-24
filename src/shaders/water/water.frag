/**
 * Physically based water rendering with analytical raytracing and dynamic shadow projection.
 */
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>

#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    // Explicitly declare shadow matrices for the fragment stage.
// Three.js natively limits these to the vertex stage.
uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
#endif

uniform sampler2D tTiles;
uniform sampler2D tSky;
uniform float poolSize;
uniform float poolDepth;
uniform vec3 waterAttenuation;
uniform float reflectivity;
uniform float ior;
uniform float ambientShadowBase;
uniform float shadowBlurRadius;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

/**
 * Analytically computes soft shadows via Percentage-Closer Filtering (PCF).
 * Evaluates the intersection coordinate in the directional light's clip space.
 */
float getShadowAt(vec3 hitPos) {
    float shadow = 1.0;

    #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        vec4 shadowCoord = directionalShadowMatrix[0] * vec4(hitPos, 1.0);
    shadowCoord.xyz /= shadowCoord.w;

    // BOUNDARY CHECK
    if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
    shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
    shadowCoord.z > 1.0) {
        return 1.0;
    }

    shadowCoord.z += directionalLightShadows[0].shadowBias;

    // SOFT SHADOWS: Scale the texel sampling footprint to create a wider, softer penumbra
    float blurRadius = 3.5;
    vec2 texelSize = (vec2(1.0) / directionalLightShadows[0].shadowMapSize) * shadowBlurRadius;

    float lit = 0.0;

    // 3x3 PCF filter with increased spatial stride
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            vec2 uv = shadowCoord.xy + offset;

            #if __VERSION__ >= 300
                    lit += texture(directionalShadowMap[0], vec3(uv, shadowCoord.z));
            #else
                    float depth = texture2D(directionalShadowMap[0], uv).r;
            lit += step(shadowCoord.z, depth);
            #endif
            }
    }

    lit /= 9.0;

    // VOLUMETRIC SCATTERING: Elevated ambient baseline to 0.55.
    // Prevents shadowed underwater areas from becoming pitch black due to global illumination.
    shadow = mix(ambientShadowBase, 1.0, lit);
    #endif

    return shadow;
}

vec3 sampleEquirectangular(sampler2D map, vec3 dir) {
    float u = atan(dir.z, dir.x) / (2.0 * 3.1415926) + 0.5;
    float v = asin(clamp(dir.y, -0.9999, 0.9999)) / 3.1415926 + 0.5;
    return texture2D(map, vec2(u, v)).rgb;
}

vec3 getPoolColor(vec3 origin, vec3 dir) {
    if (length(dir) < 0.001) return vec3(0.0);

    vec3 ro = origin;
    vec3 rd = normalize(dir);

    vec3 boxMin = vec3(-poolSize * 0.5, -poolDepth, -poolSize * 0.5);
    vec3 boxMax = vec3(poolSize * 0.5, 2.0, poolSize * 0.5);

    vec3 invRd = 1.0 / rd;
    vec3 t0 = (boxMin - ro) * invRd;
    vec3 t1 = (boxMax - ro) * invRd;
    vec3 tMax = max(t0, t1);
    float t = min(min(tMax.x, tMax.y), tMax.z);

    vec3 hitPos = ro + rd * t;

    // UV BOX MAPPING: Dynamically select projection planes to fix wall texture stretching
    vec2 uv;
    vec3 hitNormal;

    if (hitPos.y > -poolDepth + 0.001) {
        // Wall intersection: evaluate whether we hit an X-plane or Z-plane wall
        vec2 absXZ = abs(hitPos.xz);
        if (absXZ.x > absXZ.y) {
            uv = vec2(hitPos.z, hitPos.y);
            hitNormal = vec3(-sign(hitPos.x), 0.0, 0.0);
        } else {
            uv = vec2(hitPos.x, hitPos.y);
            hitNormal = vec3(0.0, 0.0, -sign(hitPos.z));
        }
    } else {
        // Floor intersection: evaluate directly on XZ plane
        uv = hitPos.xz;
        hitNormal = vec3(0.0, 1.0, 0.0);
    }

    // Scale UV coordinates to match original tiling density
    uv = uv * 0.5 + 0.5;

    // NORMAL BIAS: Self-shadow acne prevention
    vec3 shadowHitPos = hitPos + hitNormal * 0.05;
    float shadowMask = getShadowAt(shadowHitPos);

    vec3 tileColor = texture2D(tTiles, uv).rgb;
    vec3 transmission = exp(-waterAttenuation * max(t, 0.0));

    // Optional Wall AO: subtle darkening at edges for depth perception (0.95)
    if (hitPos.y > -poolDepth + 0.001) {
        return tileColor * transmission * shadowMask * 0.95;
    }

    return tileColor * transmission * shadowMask;
}

void main() {
    vec3 incident = normalize(vWorldPosition - cameraPosition);
    vec3 normal = normalize(vWorldNormal);

    if (!gl_FrontFacing) normal = -normal;

    // Chromatic Aberration Refraction
    vec3 dirR = refract(incident, normal, 1.0 / (ior - 0.008));
    vec3 dirG = refract(incident, normal, 1.0 / ior);
    vec3 dirB = refract(incident, normal, 1.0 / (ior + 0.007));

    // Total Internal Reflection fallback
    if (length(dirG) < 0.001) dirG = reflect(incident, normal);
    if (length(dirR) < 0.001) dirR = dirG;
    if (length(dirB) < 0.001) dirB = dirG;

    vec3 refractedColor = vec3(
    getPoolColor(vWorldPosition, dirR).r,
    getPoolColor(vWorldPosition, dirG).g,
    getPoolColor(vWorldPosition, dirB).b
    );

    vec3 reflectedDir = normalize(reflect(incident, normal));
    reflectedDir.y = max(reflectedDir.y, 0.001);
    vec3 reflectedColor = sampleEquirectangular(tSky, reflectedDir);

    float f0 = reflectivity;
    float cosTheta = max(dot(-incident, normal), 0.0);
    float reflectance = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

    vec3 finalColor = mix(refractedColor, reflectedColor, reflectance);
    float surfaceShadow = getShadowAt(vWorldPosition);
    finalColor *= mix(0.75, 1.0, surfaceShadow);

    gl_FragColor = vec4(finalColor, 1.0);
}