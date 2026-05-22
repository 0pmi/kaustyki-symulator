/**
 * @fileoverview Simulates spherical aberration in a circular lens
 * using sequential ray tracing and Snell's Law.
 */

import { vec, intersectCircle, refract } from '../utils/math.js';

export function initLensSimulation() {
    const canvasLens = document.getElementById('canvas-lens');
    if (!canvasLens) return;

    const ctxLens = canvasLens.getContext('2d');

    const lensSliders = {
        ray: document.getElementById('ray-count'),
        rayVal: document.getElementById('ray-count-val'),
        ior: document.getElementById('ior'),
        iorVal: document.getElementById('ior-val'),
        lightY: document.getElementById('light-y')
    };

    /**
     * Main render loop. Traces rays from a point source through
     * a spherical boundary and computes sequential refractions.
     */
    function drawLensSimulation() {
        ctxLens.globalCompositeOperation = 'source-over';
        ctxLens.clearRect(0, 0, canvasLens.width, canvasLens.height);

        const config = {
            rayCount: parseInt(lensSliders.ray?.value || 50, 10),
            ior: parseFloat(lensSliders.ior?.value || 1.5),
            lightY: parseInt(lensSliders.lightY?.value || 200, 10),
            lightX: 50
        };

        const circleCenter = { x: canvasLens.width * 0.35, y: canvasLens.height / 2 };
        const circleRadius = 130;
        const lightSource = { x: config.lightX, y: config.lightY };

        // 1. Render the physical lens boundary
        ctxLens.beginPath();
        ctxLens.arc(circleCenter.x, circleCenter.y, circleRadius, 0, 2 * Math.PI);
        ctxLens.strokeStyle = 'rgba(74, 144, 226, 0.5)';
        ctxLens.fillStyle = 'rgba(74, 144, 226, 0.05)';
        ctxLens.lineWidth = 2;
        ctxLens.fill();
        ctxLens.stroke();

        // 2. Render the point light source
        ctxLens.beginPath();
        ctxLens.arc(lightSource.x, lightSource.y, 8, 0, 2 * Math.PI);
        ctxLens.fillStyle = '#f1c40f';
        ctxLens.fill();

        // Additive blending for energy accumulation (caustic approximation)
        ctxLens.globalCompositeOperation = 'lighter';
        const spreadAngle = Math.PI / 4;
        const startAngle = -spreadAngle / 2;

        for (let i = 0; i < config.rayCount; i++) {
            const angle = startAngle + (i / (config.rayCount - 1 || 1)) * spreadAngle;
            let rayDir = { x: Math.cos(angle), y: Math.sin(angle) };
            let rayPos = { x: lightSource.x, y: lightSource.y };

            const t1 = intersectCircle(rayPos, rayDir, circleCenter, circleRadius);

            if (t1) {
                const hit1 = vec.add(rayPos, vec.mul(rayDir, t1));
                ctxLens.beginPath();
                ctxLens.moveTo(rayPos.x, rayPos.y);
                ctxLens.lineTo(hit1.x, hit1.y);

                const normal1 = vec.normalize(vec.sub(hit1, circleCenter));

                // First refraction: entry into denser medium (air -> glass)
                const refractedDir1 = refract(rayDir, normal1, 1.0 / config.ior);

                let finalHit = null;
                if (refractedDir1) {
                    const t2 = intersectCircle(hit1, refractedDir1, circleCenter, circleRadius);
                    if (t2) {
                        const hit2 = vec.add(hit1, vec.mul(refractedDir1, t2));
                        ctxLens.lineTo(hit2.x, hit2.y);

                        // Normal vector must point inward for exit boundary
                        const normal2 = vec.mul(vec.normalize(vec.sub(hit2, circleCenter)), -1);

                        // Second refraction: exit into sparser medium (glass -> air)
                        const refractedDir2 = refract(refractedDir1, normal2, config.ior / 1.0);

                        if (refractedDir2) {
                            const rayEnd = vec.add(hit2, vec.mul(refractedDir2, 1200));
                            ctxLens.lineTo(rayEnd.x, rayEnd.y);
                            finalHit = hit2;
                        }
                    }
                }

                ctxLens.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctxLens.stroke();

                // Optional photon termination highlight
                if (finalHit) {
                    ctxLens.beginPath();
                    ctxLens.arc(finalHit.x, finalHit.y, 1.5, 0, 2 * Math.PI);
                    ctxLens.fillStyle = 'rgba(255, 255, 255, 0.04)';
                    ctxLens.fill();
                }
            }
        }

        ctxLens.globalCompositeOperation = 'source-over';
    }

    function updateLensUI() {
        if (lensSliders.rayVal) lensSliders.rayVal.textContent = lensSliders.ray.value;
        if (lensSliders.iorVal) lensSliders.iorVal.textContent = parseFloat(lensSliders.ior.value).toFixed(2);
        drawLensSimulation();
    }

    ['input'].forEach(evt => {
        lensSliders.ray?.addEventListener(evt, updateLensUI);
        lensSliders.ior?.addEventListener(evt, updateLensUI);
        lensSliders.lightY?.addEventListener(evt, updateLensUI);
    });

    drawLensSimulation();
}