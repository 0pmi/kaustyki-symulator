/*
 * Minimal vertex shader for full-screen quad rendering.
 * Used strictly for GPGPU ping-pong processing where geometry perspective is irrelevant.
 */
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}