/**
 * Basic vertex shader for full-screen quad rendering.
 * Used exclusively for FBO processing.
 */
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}