/**
 * Physically based water rendering with analytical raytracing and dynamic shadow projection.
 */
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>

#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
#endif

uniform sampler2D tTiles;
uniform sampler2D tSky;
uniform sampler2D tCaustics;

uniform float poolSize;
uniform float poolDepth;
uniform vec3 waterAttenuation;
uniform float reflectivity;
uniform float ior;
uniform float ambientShadowBase;
uniform float shadowBlurRadius;
uniform vec3 lightDir;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

vec3 sampleEquirectangular(sampler2D map, vec3 dir) {
    float u = atan(dir.z, dir.x) / (2.0 * 3.1415926) + 0.5;
    float v = asin(clamp(dir.y, -0.9999, 0.9999)) / 3.1415926 + 0.5;
    return texture2D(map, vec2(u, v)).rgb;
}

float getShadowAt(vec3 hitPos) {
    if (hitPos.y > 0.5) return 1.0;
    float t = (0.5 - hitPos.y) / max(-lightDir.y, 0.0001);
    vec2 pXZ = hitPos.xz - lightDir.xz * t;

    float blur = max(shadowBlurRadius * 0.02, 0.01);
    float shadowX = 1.0 - smoothstep(poolSize * 0.5 - blur, poolSize * 0.5 + blur, abs(pXZ.x));
    float shadowZ = 1.0 - smoothstep(poolSize * 0.5 - blur, poolSize * 0.5 + blur, abs(pXZ.y));

    return mix(ambientShadowBase, 1.0, shadowX * shadowZ);
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
    if (hitPos.y > 1.99) {
        return sampleEquirectangular(tSky, dir);
    }
    vec2 uvFloor = hitPos.xz * 0.5 + 0.5;
    vec2 uvWallX = vec2(hitPos.z, hitPos.y) * 0.5 + 0.5;
    vec2 uvWallZ = vec2(hitPos.x, hitPos.y) * 0.5 + 0.5;

    vec3 colFloor = texture2D(tTiles, uvFloor).rgb;
    vec3 colWallX = texture2D(tTiles, uvWallX).rgb;
    vec3 colWallZ = texture2D(tTiles, uvWallZ).rgb;

    vec2 absXZ = abs(hitPos.xz);
    float blendWallX = smoothstep(-0.02, 0.02, absXZ.x - absXZ.y);
    vec3 colWall = mix(colWallZ, colWallX, blendWallX);

    float blendFloor = smoothstep(-poolDepth, -poolDepth + 0.02, hitPos.y);
    vec3 tileColor = mix(colFloor, colWall, blendFloor);

    float shadowMask = getShadowAt(hitPos);

    vec3 transmission = exp(-waterAttenuation * max(t, 0.0));

    vec3 refractedLight = refract(normalize(lightDir), vec3(0.0, 1.0, 0.0), 1.0 / ior);

    float tLight = 0.0;
    if (refractedLight.y < -0.001) {
        tLight = (-poolDepth - hitPos.y) / refractedLight.y;
    }
    vec3 projectedPos = hitPos + refractedLight * tLight;
    vec2 causticsUv = vec2(projectedPos.x, -projectedPos.z) / (poolSize * 1.5) + 0.5;

    float causticIntensity = 0.0;
    if (causticsUv.x >= 0.0 && causticsUv.x <= 1.0 && causticsUv.y >= 0.0 && causticsUv.y <= 1.0) {
        causticIntensity = texture2D(tCaustics, causticsUv).r;
    }

    float fadeU = smoothstep(0.0, 0.02, causticsUv.x) * (1.0 - smoothstep(0.98, 1.0, causticsUv.x));
    float fadeV = smoothstep(0.0, 0.02, causticsUv.y) * (1.0 - smoothstep(0.98, 1.0, causticsUv.y));
    float edgeFade = fadeU * fadeV;

    float directLight = clamp((shadowMask - ambientShadowBase) / max(1.0 - ambientShadowBase, 0.001), 0.0, 1.0);
    causticIntensity *= directLight * edgeFade;

    vec3 illuminatedTile = tileColor + vec3(causticIntensity * 1.5);

    float darken = mix(1.0, 0.95, blendFloor);
    return illuminatedTile * transmission * shadowMask * darken;
}


void main() {
    vec3 incident = normalize(vWorldPosition - cameraPosition);
    vec3 normal = normalize(vWorldNormal);
    float currentIor;

    if (!gl_FrontFacing) {
        normal = -normal;
        currentIor = ior;
    } else {
        currentIor = 1.0 / ior;
    }

    // Chromatic Aberration Refraction
    vec3 dirR = refract(incident, normal, currentIor - 0.008);
    vec3 dirG = refract(incident, normal, currentIor);
    vec3 dirB = refract(incident, normal, currentIor + 0.007);

    // Total Internal Reflection fallback (Odbicie wewnętrzne, super ważne pod wodą!)
    if (length(dirG) < 0.001) {
        dirG = reflect(incident, normal);
        dirR = dirG;
        dirB = dirG;
    }

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