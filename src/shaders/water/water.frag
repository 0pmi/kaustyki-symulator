/*
 * Physically based water rendering with analytical raytracing and dynamic shadow projection.
 * This shader computes the final visual output of the water surface, including refraction,
 * reflection, chromatic aberration, and the intersection of light rays with submerged objects.
 */
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>

#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
#endif

// Environmental and physical textures
uniform sampler2D tTiles;
uniform sampler2D tSky;
uniform sampler2D tCaustics;

// Pool and optical parameters
uniform float poolSize;
uniform float poolDepth;
uniform vec3 waterAttenuation;
uniform float reflectivity;
uniform float ior;
uniform float ambientShadowBase;
uniform float shadowBlurRadius;
uniform vec3 lightDir;

// Dynamic sphere tracking and PBR mapping
uniform vec3 sphereCenter;
uniform float sphereRadius;
uniform sampler2D tSphereTex;
uniform int hasSphereTex;
uniform mat4 sphereMatrixInv;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

/*
 * Maps a 3D direction vector to a 2D UV coordinate for sampling HDRI environments.
 */
vec3 sampleEquirectangular(sampler2D map, vec3 dir) {
    float u = atan(dir.z, dir.x) / (2.0 * 3.1415926) + 0.5;
    float v = asin(clamp(dir.y, -0.9999, 0.9999)) / 3.1415926 + 0.5;
    return texture2D(map, vec2(u, v)).rgb;
}

/*
 * Calculates the dynamic shadow factor at a specific world coordinate.
 * Combines analytical sphere tracing with geometric bounds for the pool rim.
 */
float getShadowAt(vec3 hitPos) {
    if (hitPos.y > 0.5) return 1.0;

/* 1. Calculate static shadow cast by the pool edges */
    float t = (0.5 - hitPos.y) / max(-lightDir.y, 0.0001);
    vec2 pXZ = hitPos.xz - lightDir.xz * t;

    float blur = max(shadowBlurRadius * 0.02, 0.01);
    float shadowX = 1.0 - smoothstep(poolSize * 0.5 - blur, poolSize * 0.5 + blur, abs(pXZ.x));
    float shadowZ = 1.0 - smoothstep(poolSize * 0.5 - blur, poolSize * 0.5 + blur, abs(pXZ.y));
    float rimShadow = mix(ambientShadowBase, 1.0, shadowX * shadowZ);

/* 2. Calculate the refracted shadow cast by the dynamic sphere */
    vec3 L = normalize(lightDir);
    vec3 refractedLight = refract(L, vec3(0.0, 1.0, 0.0), 1.0 / ior);

    // Trace the shadow ray back to the water surface
    float tToSurface = -hitPos.y / max(-refractedLight.y, 0.0001);
    vec3 surfacePos = hitPos - refractedLight * tToSurface;

    // Segment A: Submerged ray trace (hitPos -> surfacePos)
    vec3 v1 = sphereCenter - hitPos;
    vec3 dir1 = normalize(-refractedLight);
    float t1 = clamp(dot(v1, dir1), 0.0, length(surfacePos - hitPos));
    float dist1 = length(v1 - t1 * dir1);

    // Segment B: Above-water ray trace (surfacePos -> Sun)
    vec3 v2 = sphereCenter - surfacePos;
    vec3 dir2 = normalize(-L);
    float t2 = max(0.0, dot(v2, dir2));
    float dist2 = length(v2 - t2 * dir2);

    // Determine the closest approach distance of the light ray to the sphere center
    float minDist = min(dist1, dist2);

    // Generate soft shadow penumbra based on sphere radius
    float ballShadow = smoothstep(sphereRadius * 0.8, sphereRadius * 1.2, minDist);
    ballShadow = mix(ambientShadowBase, 1.0, ballShadow);

    return min(rimShadow, ballShadow);
}

/*
 * Analytical Ray-Sphere Intersection.
 * Determines if a refracted ray hits the submerged portion of the physical sphere,
 * calculating texturing, diffuse lighting, and caustic projection onto its surface.
 */
vec4 getSphereHit(vec3 rayOrigin, vec3 rayDir) {
    vec3 oc = rayOrigin - sphereCenter;
    float b = dot(oc, rayDir);
    float c = dot(oc, oc) - sphereRadius * sphereRadius;
    float d = b * b - c;

    if (d > 0.0) {
        float t = -b - sqrt(d);
        if (t > 0.0) {
            vec3 hitPos = rayOrigin + rayDir * t;
            vec3 normal = normalize(hitPos - sphereCenter);
            vec3 L = normalize(lightDir);

            // Compute diffuse lighting with a strong ambient baseline to prevent extreme underwater darkness
            float diffuse = max(dot(normal, -L), 0.0) * 0.7 + 0.5;

            // Texture mapping aligned with the actual GLTF model rotation
            vec3 baseColor = vec3(0.8);
            if (hasSphereTex == 1) {
                // Transform hit position into the object's local space using the inverted world matrix
                vec4 localHit = sphereMatrixInv * vec4(hitPos, 1.0);
                vec3 localDir = normalize(localHit.xyz);

                // Map local 3D coordinates to 2D equirectangular UVs
                float u = 0.5 + atan(localDir.z, -localDir.x) / (2.0 * 3.14159265);
                float v = 0.5 + asin(localDir.y) / 3.14159265;

                vec2 sphereUv = vec2(u, v);
                vec2 texScale = vec2(1.0, 1.0);

                baseColor = texture2D(tSphereTex, sphereUv * texScale).rgb;
            }

            vec3 finalColor = baseColor * diffuse;

            // Project caustic patterns onto the sphere surface
            vec3 refractedLight = refract(L, vec3(0.0, 1.0, 0.0), 1.0 / ior);
            float tProj = 0.0;
            if (refractedLight.y < -0.001) {
                tProj = (-poolDepth - hitPos.y) / refractedLight.y;
            }
            vec3 projectedPos = hitPos + refractedLight * tProj;
            vec2 causticUv = vec2(projectedPos.x, -projectedPos.z) / (poolSize * 1.5) + 0.5;

            if (causticUv.x >= 0.0 && causticUv.x <= 1.0 && causticUv.y >= 0.0 && causticUv.y <= 1.0) {
                float fadeU = smoothstep(0.0, 0.02, causticUv.x) * (1.0 - smoothstep(0.98, 1.0, causticUv.x));
                float fadeV = smoothstep(0.0, 0.02, causticUv.y) * (1.0 - smoothstep(0.98, 1.0, causticUv.y));

                // Mask caustics to only illuminate surfaces facing the refracted light
                float causticMask = max(0.0, dot(normal, -L));
                vec3 causticLight = texture2D(tCaustics, causticUv).rgb * fadeU * fadeV;

                finalColor += causticLight * baseColor * causticMask * 3.0;
            }

            finalColor *= 1.2;
            return vec4(finalColor, t);
        }
    }
    return vec4(0.0, 0.0, 0.0, -1.0);
}

/*
 * Core Raytracer: Traces the path of a light ray through the water volume
 * to determine its color based on intersection with walls, the floor, or the sphere.
 */
vec3 getPoolColor(vec3 origin, vec3 dir) {
    if (length(dir) < 0.001) return vec3(0.0);

    vec3 ro = origin;
    vec3 rd = normalize(dir);

    // Define the bounding box of the pool
    vec3 boxMin = vec3(-poolSize * 0.5, -poolDepth, -poolSize * 0.5);
    vec3 boxMax = vec3(poolSize * 0.5, 2.0, poolSize * 0.5);

    // Ray-Box Intersection (AABB - Axis-Aligned Bounding Box)
    vec3 invRd = 1.0 / rd;
    vec3 t0 = (boxMin - ro) * invRd;
    vec3 t1 = (boxMax - ro) * invRd;
    vec3 tMax = max(t0, t1);
    float t = min(min(tMax.x, tMax.y), tMax.z);

    vec3 hitPos = ro + rd * t;

    // Check if the ray escaped the pool vertically (e.g., total internal reflection pointing up)
    if (hitPos.y > 1.99) {
        return sampleEquirectangular(tSky, dir);
    }

    // Check intersection with the physical sphere
    vec4 sphereHit = getSphereHit(ro, rd);
    if (sphereHit.w > 0.0 && sphereHit.w < t) {
        float tSphere = sphereHit.w;
        // Apply volumetric light attenuation (Beer-Lambert law)
        vec3 transmission = exp(-waterAttenuation * max(tSphere, 0.0));
        return sphereHit.rgb * transmission;
    }

    // Determine UV coordinates for pool mapping based on the hit surface
    vec2 uvFloor = hitPos.xz * 0.5 + 0.5;
    vec2 uvWallX = vec2(hitPos.z, hitPos.y) * 0.5 + 0.5;
    vec2 uvWallZ = vec2(hitPos.x, hitPos.y) * 0.5 + 0.5;

    vec3 colFloor = texture2D(tTiles, uvFloor).rgb;
    vec3 colWallX = texture2D(tTiles, uvWallX).rgb;
    vec3 colWallZ = texture2D(tTiles, uvWallZ).rgb;

    // Blend corners seamlessly
    vec2 absXZ = abs(hitPos.xz);
    float blendWallX = smoothstep(-0.02, 0.02, absXZ.x - absXZ.y);
    vec3 colWall = mix(colWallZ, colWallX, blendWallX);

    float blendFloor = smoothstep(-poolDepth, -poolDepth + 0.02, hitPos.y);
    vec3 tileColor = mix(colFloor, colWall, blendFloor);

    float shadowMask = getShadowAt(hitPos);

    // Apply volumetric attenuation based on distance traveled through the water
    vec3 transmission = exp(-waterAttenuation * max(t, 0.0));

    // Project caustics onto the intersected geometry
    vec3 refractedLight = refract(normalize(lightDir), vec3(0.0, 1.0, 0.0), 1.0 / ior);

    float tLight = 0.0;
    if (refractedLight.y < -0.001) {
        tLight = (-poolDepth - hitPos.y) / refractedLight.y;
    }
    vec3 projectedPos = hitPos + refractedLight * tLight;
    vec2 causticsUv = vec2(projectedPos.x, -projectedPos.z) / (poolSize * 1.5) + 0.5;

    vec3 causticLight = vec3(0.0);
    if (causticsUv.x >= 0.0 && causticsUv.x <= 1.0 && causticsUv.y >= 0.0 && causticsUv.y <= 1.0) {
        causticLight = texture2D(tCaustics, causticsUv).rgb;
    }

    float fadeU = smoothstep(0.0, 0.02, causticsUv.x) * (1.0 - smoothstep(0.98, 1.0, causticsUv.x));
    float fadeV = smoothstep(0.0, 0.02, causticsUv.y) * (1.0 - smoothstep(0.98, 1.0, causticsUv.y));
    float edgeFade = fadeU * fadeV;

    // Restrict intense caustics to directly illuminated areas
    float directLight = clamp((shadowMask - ambientShadowBase) / max(1.0 - ambientShadowBase, 0.001), 0.0, 1.0);
    causticLight *= directLight * edgeFade;

    vec3 illuminatedTile = tileColor + causticLight * 1.5;

    // Darken deep corners slightly for ambient occlusion effect
    float darken = mix(1.0, 0.95, blendFloor);
    return illuminatedTile * transmission * shadowMask * darken;
}

void main() {
    vec3 incident = normalize(vWorldPosition - cameraPosition);
    vec3 normal = normalize(vWorldNormal);
    float currentIor;

    // Handle looking from below the water surface vs above
    if (!gl_FrontFacing) {
        normal = -normal;
        currentIor = ior;
    } else {
        currentIor = 1.0 / ior;
    }

    // Calculate chromatic aberration by offsetting the Index of Refraction per color channel
    vec3 dirR = refract(incident, normal, currentIor - 0.008);
    vec3 dirG = refract(incident, normal, currentIor);
    vec3 dirB = refract(incident, normal, currentIor + 0.007);

    // Total Internal Reflection fallback: If refraction is impossible (critical angle), reflect instead
    vec3 reflection = reflect(incident, normal);
    if (length(dirR) < 0.001) dirR = reflection;
    if (length(dirG) < 0.001) dirG = reflection;
    if (length(dirB) < 0.001) dirB = reflection;

    // Gather refracted environmental colors
    vec3 refractedColor = vec3(
    getPoolColor(vWorldPosition, dirR).r,
    getPoolColor(vWorldPosition, dirG).g,
    getPoolColor(vWorldPosition, dirB).b
    );

    // Gather reflected sky colors
    vec3 reflectedDir = normalize(reflect(incident, normal));
    reflectedDir.y = max(reflectedDir.y, 0.001);
    vec3 reflectedColor = sampleEquirectangular(tSky, reflectedDir);

    // Fresnel Schlick approximation to blend reflection and refraction
    float f0 = reflectivity;
    float cosTheta = max(dot(-incident, normal), 0.0);
    float reflectance = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

    vec3 finalColor = mix(refractedColor, reflectedColor, reflectance);

    // Apply environmental shadows to the water surface itself
    float surfaceShadow = getShadowAt(vWorldPosition);
    finalColor *= mix(0.75, 1.0, surfaceShadow);

    gl_FragColor = vec4(finalColor, 1.0);
}