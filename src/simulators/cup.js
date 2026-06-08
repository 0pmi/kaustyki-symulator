/**
 * @fileoverview Simulates a reflective caustic (Nephroid/Cardioid) generated
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

        // Get active mode (nephroid vs cardioid)
        const modeRadio = document.querySelector('input[name="caustic-mode"]:checked');
        const mode = modeRadio ? modeRadio.value : 'nephroid';

        // Resolve incident light angle based on slider input
        const sliderVal = parseInt(cupSliders.lightX?.value || 50, 10);
        const sunAngle = (sliderVal - 50) * 0.015;

        // Base sun directional vectors (used mainly for Nephroid)
        const sunDir = { x: Math.cos(sunAngle), y: Math.sin(sunAngle) };
        const sunNormal = { x: -sunDir.y, y: sunDir.x };

        ctxCup.globalCompositeOperation = 'lighter';
        ctxCup.lineWidth = 1;

        // Dynamically adjust alpha based on ray count to prevent overexposure
        const alphaBase = Math.min(1.0, 15.0 / rayCount).toFixed(3);
        const alphaCaustic = Math.min(1.0, 40.0 / rayCount).toFixed(3);

        for (let i = 0; i < rayCount; i++) {
            let hitBack = null;
            let currentRayDir = null; // Ray direction hitting the back wall

            if (mode === 'nephroid') {
                const t = i / (rayCount - 1 || 1);
                const offset = -cupRadius + t * (cupRadius * 2);

                const rayOrigin = {
                    x: cupCenter.x - sunDir.x * 500 + sunNormal.x * offset,
                    y: cupCenter.y - sunDir.y * 500 + sunNormal.y * offset
                };

                const L = vec.sub(rayOrigin, cupCenter);
                const a = vec.dot(sunDir, sunDir);
                const b = 2 * vec.dot(sunDir, L);
                const c = vec.dot(L, L) - cupRadius * cupRadius;
                let delta = b * b - 4 * a * c;

                if (delta > -1e-6) {
                    delta = Math.max(0, delta);
                    const t1 = (-b - Math.sqrt(delta)) / (2 * a);
                    const t2 = (-b + Math.sqrt(delta)) / (2 * a);

                    if (t2 > 0 && t1 > 0) {
                        const hitFront = vec.add(rayOrigin, vec.mul(sunDir, t1));
                        hitBack = vec.add(rayOrigin, vec.mul(sunDir, t2));
                        currentRayDir = sunDir;

                        // External ray
                        ctxCup.beginPath();
                        ctxCup.moveTo(rayOrigin.x, rayOrigin.y);
                        ctxCup.lineTo(hitFront.x, hitFront.y);
                        ctxCup.strokeStyle = `rgba(255, 255, 255, ${alphaBase * 0.2})`;
                        ctxCup.stroke();

                        // Internal ray
                        ctxCup.beginPath();
                        ctxCup.moveTo(hitFront.x, hitFront.y);
                        ctxCup.lineTo(hitBack.x, hitBack.y);
                        ctxCup.strokeStyle = `rgba(255, 255, 255, ${alphaBase})`;
                        ctxCup.stroke();
                    }
                }
            } else if (mode === 'cardioid') {
                // Light source is situated on the circle. Slider moves it along the top edge.
                const sourceAngle = sunAngle + Math.PI;
                const hitFront = {
                    x: cupCenter.x + cupRadius * Math.cos(sourceAngle),
                    y: cupCenter.y + cupRadius * Math.sin(sourceAngle)
                };

                // Normal vector pointing completely inward
                const normalInAngle = sunAngle;

                // Fan out rays covering a 180-degree spread inwards
                const t = i / (rayCount - 1 || 1);
                const rayAngle = normalInAngle - Math.PI / 2 + t * Math.PI;
                currentRayDir = { x: Math.cos(rayAngle), y: Math.sin(rayAngle) };

                // Calculate geometry to find opposite hit on the circle
                const angleDiff = rayAngle - normalInAngle;
                const dist = 2 * cupRadius * Math.cos(angleDiff);

                // Prevent rendering extremely grazing rays which cause visual bugs
                if (dist > 0.001) {
                    hitBack = vec.add(hitFront, vec.mul(currentRayDir, dist));

                    ctxCup.beginPath();
                    ctxCup.moveTo(hitFront.x, hitFront.y);
                    ctxCup.lineTo(hitBack.x, hitBack.y);
                    ctxCup.strokeStyle = `rgba(255, 255, 255, ${alphaBase})`;
                    ctxCup.stroke();
                }
            }

            // --- SHARED REFLECTION LOGIC ---
            if (hitBack && currentRayDir) {
                const normal = vec.normalize(vec.sub(cupCenter, hitBack));
                const dotDN = vec.dot(currentRayDir, normal);

                // Vector reflection: R = I - 2(I * N)N
                const reflectDir = vec.sub(currentRayDir, vec.mul(normal, 2 * dotDN));

                // Offset origin slightly to prevent floating-point self-intersection
                const startReflect = vec.add(hitBack, vec.mul(reflectDir, 0.01));
                const tReflect = intersectCircle(startReflect, reflectDir, cupCenter, cupRadius);

                if (tReflect) {
                    const hitReflect = vec.add(startReflect, vec.mul(reflectDir, tReflect));

                    ctxCup.beginPath();
                    ctxCup.moveTo(hitBack.x, hitBack.y);
                    ctxCup.lineTo(hitReflect.x, hitReflect.y);

                    const r = mode === 'nephroid' ? 255 : 100;
                    const g = mode === 'nephroid' ? 180 : 210;
                    const b = mode === 'nephroid' ? 50 : 255;

                    // Render the reflected ray forming the caustic
                    ctxCup.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alphaCaustic})`;
                    ctxCup.stroke();
                }
            }
        }

        ctxCup.globalCompositeOperation = 'source-over';

        // Render the cylindrical boundary
        ctxCup.beginPath();
        ctxCup.arc(cupCenter.x, cupCenter.y, cupRadius, 0, 2 * Math.PI);
        ctxCup.strokeStyle = 'rgba(231, 76, 60, 0.8)';
        ctxCup.lineWidth = 4;
        ctxCup.stroke();

        // Optional: Render a small point to indicate the point source in Cardioid mode
        if (mode === 'cardioid') {
            const sourceAngle = sunAngle + Math.PI;
            const sX = cupCenter.x + cupRadius * Math.cos(sourceAngle);
            const sY = cupCenter.y + cupRadius * Math.sin(sourceAngle);

            const grad = ctxCup.createRadialGradient(sX, sY, 0, sX, sY, 15);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(0.3, 'rgba(100, 210, 255, 0.8)');
            grad.addColorStop(1, 'rgba(100, 210, 255, 0)');

            ctxCup.fillStyle = grad;
            ctxCup.beginPath();
            ctxCup.arc(sX, sY, 15, 0, 2 * Math.PI);
            ctxCup.fill();

            ctxCup.fillStyle = '#fff';
            ctxCup.beginPath();
            ctxCup.arc(sX, sY, 4, 0, 2 * Math.PI);
            ctxCup.fill();
        }
    }

    function updateCupUI() {
        if (cupSliders.lightXVal) cupSliders.lightXVal.textContent = cupSliders.lightX.value;
        if (cupSliders.rayVal) cupSliders.rayVal.textContent = cupSliders.ray.value;
        drawCupSimulation();
    }

    // Listen to sliders
    ['input'].forEach(evt => {
        cupSliders.lightX?.addEventListener(evt, updateCupUI);
        cupSliders.ray?.addEventListener(evt, updateCupUI);
    });

    // Listen to mode radio buttons
    document.querySelectorAll('input[name="caustic-mode"]').forEach(radio => {
        radio.addEventListener('change', updateCupUI);
    });

    drawCupSimulation();
}