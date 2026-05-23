/**
 * Fragment shader for physically based water rendering.
 * Implements Schlick's approximation of Fresnel equations and Beer-Lambert absorption.
 */
uniform vec3 shallowColor;
uniform vec3 deepColor;
uniform float ior;
uniform float poolDepth;

varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying vec3 vNormal;
varying vec2 vUv;

/**
 * Schlick's approximation for Fresnel reflectance.
 * @param viewDir Normalized vector from surface to camera.
 * @param normal Normalized surface normal.
 * @param ior Relative Index of Refraction (Medium 2 / Medium 1).
 * @return Reflectance coefficient [0, 1].
 */
float computeFresnel(vec3 viewDir, vec3 normal, float ior) {
    float r0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
    float cosTheta = max(dot(viewDir, normal), 0.0);
    return r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
}

void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);

    // 1. Fresnel Reflectance
    float fRatio = computeFresnel(viewDir, normal, ior);

    // 2. Beer-Lambert Law Approximation (Volumetric Absorption)
    // Calculate the path length of the refracted ray through the water volume.
    // For simplicity before full raytracing, we assume a planar pool bottom.
    float cosView = max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.1);
    float pathLength = poolDepth / cosView;

    // Exponential attenuation based on path length
    float absorptionFactor = clamp(exp(-pathLength * 0.15), 0.0, 1.0);
    vec3 transmissionColor = mix(deepColor, shallowColor, absorptionFactor);

    // 3. Sky/Environment Reflection (Placeholder color before adding Environment Cubemap)
    vec3 skyColor = vec3(0.8, 0.9, 1.0);

    // 4. Final Composite
    vec3 finalColor = mix(transmissionColor, skyColor, fRatio);

    gl_FragColor = vec4(finalColor, 1.0);

    // Output color space correction (Three.js integration)
    #include <colorspace_fragment>
}