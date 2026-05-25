uniform float causticsIntensity;
uniform vec3 channelMask;
varying vec3 vOldPos;
varying vec3 vNewPos;

void main() {
    float oldArea = length(dFdx(vOldPos)) * length(dFdy(vOldPos));
    float newArea = length(cross(dFdx(vNewPos), dFdy(vNewPos)));

    float intensity = oldArea / max(newArea, 0.00005);
    intensity *= causticsIntensity * 2.5;
    intensity = clamp(intensity, 0.0, 5.0);

    gl_FragColor = vec4(channelMask * intensity, 0.0);
}