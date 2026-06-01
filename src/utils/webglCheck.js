/**
 * @fileoverview Utility functions to verify WebGL hardware acceleration support.
 */

export function isHardwareAcceleratedWebGLAvailable() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) ||
            canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true });
        return gl !== null;
    } catch (e) {
        return false;
    }
}

export function renderWebGLFallback(container) {
    container.innerHTML = `
        <div class="webgl-fallback-container">
            <h3 class="webgl-fallback-title" data-i18n="gpu.fallbackTitle"></h3>
            <p class="webgl-fallback-desc" data-i18n="gpu.fallbackDesc1"></p>
            <p class="webgl-fallback-hint" data-i18n="gpu.fallbackDesc2"></p>
        </div>
    `;
}

export function renderPerformanceFallback(container) {
    container.innerHTML = `
        <div class="webgl-fallback-container">
            <h3 class="webgl-fallback-title" data-i18n="gpu.perfFallbackTitle"></h3>
            <p class="webgl-fallback-desc" data-i18n="gpu.perfFallbackDesc1"></p>
            <p class="webgl-fallback-hint" data-i18n="gpu.perfFallbackDesc2"></p>
        </div>
    `;
}