uniform sampler2D tHeightMap;
uniform sampler2D tNormalMap;
uniform vec3 lightDir;
uniform float poolSize;
uniform float poolDepth;
uniform float ior;

varying vec3 vOldPos;
varying vec3 vNewPos;

void main() {
    vec2 uv = vec2(position.x, -position.y) / poolSize + 0.5;

    float isInside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);

    float height = texture2D(tHeightMap, clamp(uv, 0.0, 1.0)).r * isInside;
    vec3 nMap = texture2D(tNormalMap, clamp(uv, 0.0, 1.0)).xyz * 2.0 - 1.0;

    vec3 normal = normalize(vec3(nMap.x, nMap.z, -nMap.y));

    normal = mix(vec3(0.0, 1.0, 0.0), normal, isInside);

    vec3 surfacePos = vec3(position.x, height, position.y);
    vec3 refractedDir = refract(lightDir, normal, 1.0 / ior);

    float t = (-poolDepth - surfacePos.y) / refractedDir.y;
    vec3 hitPos = surfacePos + refractedDir * t;

    vOldPos = surfacePos;
    vNewPos = hitPos;

    gl_Position = projectionMatrix * viewMatrix * vec4(hitPos, 1.0);
}