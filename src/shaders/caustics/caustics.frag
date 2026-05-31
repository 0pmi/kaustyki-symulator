/*
 * Calculates the intensity of the focused light (caustics).
 * Uses partial derivatives (dFdx, dFdy) to measure the area of the
 * geometry formed by adjacent pixels.
 * If the refracted area (newArea) is smaller than the original area (oldArea),
 * light rays are converging, creating a bright caustic spot.
 */
uniform float causticsIntensity;
uniform vec3 channelMask;
varying vec3 vOldPos;
varying vec3 vNewPos;

void main() {
/* Calculate the base area of the un-refracted geometry */
    float oldArea = length(dFdx(vOldPos)) * length(dFdy(vOldPos));

/* Calculate the area of the geometry after refraction through the waves */
    float newArea = length(cross(dFdx(vNewPos), dFdy(vNewPos)));

/* Light intensity is inversely proportional to the stretched area */
    float intensity = oldArea / max(newArea, 0.00005);
    intensity *= causticsIntensity * 2.5;
    intensity = clamp(intensity, 0.0, 5.0);

/* Render the specific color channel (RGB pass) for chromatic aberration */
    gl_FragColor = vec4(channelMask * intensity, 0.0);
}