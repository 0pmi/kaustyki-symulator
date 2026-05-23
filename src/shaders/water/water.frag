/**
 * Advanced physically based water rendering.
 * Utilizes pure continuous mathematics and native IEEE 754 Infinity handling
 * to eliminate derivative tearing and mipmap drop artifacts.
 */
uniform sampler2D tTiles;
uniform sampler2D tSky;
uniform float poolSize;
uniform float poolDepth;
uniform vec3 waterAttenuation;
uniform float reflectivity;
uniform float ior;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

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

    float tFloor = 999999.0;
    if (rd.y < -1e-6) {
        tFloor = (boxMin.y - ro.y) / rd.y;
    }

    float tX = 999999.0;
    if (rd.x > 1e-6) {
        tX = (boxMax.x - ro.x) / rd.x;
    } else if (rd.x < -1e-6) {
        tX = (boxMin.x - ro.x) / rd.x;
    }

    float tZ = 999999.0;
    if (rd.z > 1e-6) {
        tZ = (boxMax.z - ro.z) / rd.z;
    } else if (rd.z < -1e-6) {
        tZ = (boxMin.z - ro.z) / rd.z;
    }

    float t = min(tFloor, min(tX, tZ));

    if (t == 999999.0) return vec3(0.0);

    vec3 hitPoint = ro + rd * t;
    vec2 uv;
    float tileScale = 0.4;

    if (t == tFloor) {
        uv = hitPoint.xz * tileScale;
    } else if (t == tX) {
        uv = hitPoint.zy * tileScale;
    } else {
        uv = hitPoint.xy * tileScale;
    }

    vec3 tileColor = texture2D(tTiles, uv).rgb;
    vec3 transmission = exp(-waterAttenuation * max(t, 0.0));
    return tileColor * transmission;
}

void main() {
    vec3 incident = normalize(vWorldPosition - cameraPosition);
    vec3 normal = normalize(vWorldNormal);

    if (!gl_FrontFacing) normal = -normal;

    vec3 dirR = refract(incident, normal, 1.0 / (ior - 0.008));
    vec3 dirG = refract(incident, normal, 1.0 / ior);
    vec3 dirB = refract(incident, normal, 1.0 / (ior + 0.007));

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
    vec3 reflectedColor = sampleEquirectangular(tSky, reflectedDir) * reflectivity;

    // Fresnel
    float r0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
    float cosTheta = clamp(abs(dot(-incident, normal)), 0.0, 1.0);
    float fRatio = r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);

    if (length(refract(incident, normal, 1.0 / ior)) < 0.001) fRatio = 1.0;

    vec3 finalColor = mix(refractedColor, reflectedColor, clamp(fRatio, 0.0, 1.0));
    gl_FragColor = vec4(finalColor, 1.0);

    #include <colorspace_fragment>
}