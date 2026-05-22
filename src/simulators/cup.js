/**
 * @fileoverview Simulates a reflective caustic (Nephroid) generated
 * inside a cylindrical mirror surface, simulating a coffee cup.
 */

import { vec, intersectCircle } from '../utils/math.js';

export function initCupSimulation() {
    const canvasCup = document.getElementById('canvas-cup');
    if (!canvasCup) return;

    const ctxCup = canvasCup.getContext('2d');

    const cupSliders = {
        lightX: document.getElementById('reflect-light-x'),
        lightXVal: document.getElementById('reflect-light-x-val'),
        ray: document.getElementById('reflect-ray-count'),
        rayVal: document.getElementById('reflect-ray-count-val')
    };

    /**
     * Main render loop for the light reflection simulation.
     */
    function drawCupSimulation() {
        ctxCup.globalCompositeOperation = 'source-over';
        ctxCup.clearRect(0, 0, canvasCup.width, canvasCup.height);

        const cupCenter = { x: canvasCup.width / 2, y: canvasCup.height / 2 };
        const cupRadius = 220;
        const rayCount = parseInt(cupSliders.ray?.value || 100, 10);

        // Resolve incident light angle based on slider input
        const sliderVal = parseInt(cupSliders.lightX?.value || 50, 10);
        const sunAngle = (sliderVal - 50) * 0.015;

        // Directional vector and its normal
        const sunDir = { x: Math.cos(sunAngle), y: Math.sin(sunAngle) };
        const sunNormal = { x: -sunDir.y, y: sunDir.x };

        // 1. Render the cylindrical boundary
        ctxCup.beginPath();
        ctxCup.arc(cupCenter.x, cupCenter.y, cupRadius, 0, 2 * Math.PI);
        ctxCup.strokeStyle = 'rgba(231, 76, 60, 0.5)';
        ctxCup.fillStyle = 'rgba(231, 76, 60, 0.02)';
        ctxCup.lineWidth = 3;
        ctxCup.fill();
        ctxCup.stroke();

        ctxCup.globalCompositeOperation = 'lighter';
        ctxCup.lineWidth = 1;

        // Dynamically adjust alpha based on ray count to prevent overexposure
        const alphaBase = Math.min(1.0, 15.0 / rayCount).toFixed(3);
        const alphaCaustic = Math.min(1.0, 40.0 / rayCount).toFixed(3);

        for (let i = 0; i < rayCount; i++) {
            // Distribute rays uniformly along the wavefront
            const t = i / (rayCount - 1 || 1);
            const offset = -cupRadius + t * (cupRadius * 2);

            const rayOrigin = {
                x: cupCenter.x - sunDir.x * 500 + sunNormal.x * offset,
                y: cupCenter.y - sunDir.y * 500 + sunNormal.y * offset
            };

            // Analytical ray-circle intersection
            const L = vec.sub(rayOrigin, cupCenter);
            const a = vec.dot(sunDir, sunDir);
            const b = 2 * vec.dot(sunDir, L);
            const c = vec.dot(L, L) - cupRadius * cupRadius;
            const delta = b * b - 4 * a * c;

            if (delta > 0) {
                const t1 = (-b - Math.sqrt(delta)) / (2 * a); // Front entry
                const t2 = (-b + Math.sqrt(delta)) / (2 * a); // Back wall hit

                if (t2 > 0 && t1 > 0) {
                    const hitFront = vec.add(rayOrigin, vec.mul(sunDir, t1));
                    const hitBack = vec.add(rayOrigin, vec.mul(sunDir, t2));

                    // Incoming external ray
                    ctxCup.beginPath();
                    ctxCup.moveTo(rayOrigin.x, rayOrigin.y);
                    ctxCup.lineTo(hitFront.x, hitFront.y);
                    ctxCup.strokeStyle = `rgba(255, 255, 255, ${alphaBase * 0.2})`;
                    ctxCup.stroke();

                    // Internal transmitted ray
                    ctxCup.beginPath();
                    ctxCup.moveTo(hitFront.x, hitFront.y);
                    ctxCup.lineTo(hitBack.x, hitBack.y);
                    ctxCup.strokeStyle = `rgba(255, 255, 255, ${alphaBase})`;
                    ctxCup.stroke();

                    // 2. Internal reflection calculation
                    const normal = vec.normalize(vec.sub(cupCenter, hitBack));
                    const dotDN = vec.dot(sunDir, normal);

                    // Vector reflection: R = I - 2(I \cdot N)N
                    const reflectDir = vec.sub(sunDir, vec.mul(normal, 2 * dotDN));

                    // Offset origin slightly to prevent floating-point self-intersection
                    const startReflect = vec.add(hitBack, vec.mul(reflectDir, 0.01));
                    const tReflect = intersectCircle(startReflect, reflectDir, cupCenter, cupRadius);

                    if (tReflect) {
                        const hitReflect = vec.add(startReflect, vec.mul(reflectDir, tReflect));

                        ctxCup.beginPath();
                        ctxCup.moveTo(hitBack.x, hitBack.y);
                        ctxCup.lineTo(hitReflect.x, hitReflect.y);

                        // Render the reflected ray forming the nephroid caustic
                        ctxCup.strokeStyle = `rgba(255, 180, 50, ${alphaCaustic})`;
                        ctxCup.stroke();
                    }
                }
            }
        }
        ctxCup.globalCompositeOperation = 'source-over';
    }

    function updateCupUI() {
        if (cupSliders.lightXVal) cupSliders.lightXVal.textContent = cupSliders.lightX.value;
        if (cupSliders.rayVal) cupSliders.rayVal.textContent = cupSliders.ray.value;
        drawCupSimulation();
    }

    ['input'].forEach(evt => {
        cupSliders.lightX?.addEventListener(evt, updateCupUI);
        cupSliders.ray?.addEventListener(evt, updateCupUI);
    });

    drawCupSimulation();
}