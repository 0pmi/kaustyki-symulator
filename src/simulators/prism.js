/**
 * @fileoverview Simulates light dispersion and rainbow formation
 * within a circular raindrop via internal reflection and refraction.
 */

import { vec, intersectCircle, refract } from '../utils/math.js';

export function initPrismSimulation() {
    const canvasPrism = document.getElementById('canvas-prism');
    if (!canvasPrism) return;

    const ctxPrism = canvasPrism.getContext('2d');

    const prismSliders = {
        angle: document.getElementById('prism-angle'),
        ray: document.getElementById('prism-ray-count'),
        rayVal: document.getElementById('prism-ray-count-val')
    };

    /**
     * Renders chromatic dispersion by processing distinct wavelengths independently.
     */
    function drawPrismSimulation() {
        ctxPrism.globalCompositeOperation = 'source-over';
        ctxPrism.clearRect(0, 0, canvasPrism.width, canvasPrism.height);

        const config = {
            angle: parseInt(prismSliders.angle?.value || 0, 10) * (Math.PI / 180),
            rayCount: parseInt(prismSliders.ray?.value || 50, 10)
        };

        const dropCenter = { x: canvasPrism.width * 0.65, y: canvasPrism.height * 0.35 };
        const dropRadius = 160;

        // 1. Render the physical water droplet
        ctxPrism.beginPath();
        ctxPrism.arc(dropCenter.x, dropCenter.y, dropRadius, 0, Math.PI * 2);
        ctxPrism.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctxPrism.fillStyle = 'rgba(74, 144, 226, 0.05)';
        ctxPrism.fill();
        ctxPrism.stroke();

        ctxPrism.globalCompositeOperation = 'screen';

        const alpha = Math.min(1.0, 12.0 / config.rayCount).toFixed(3);

        // Exaggerated Indices of Refraction (IOR) per wavelength
        // to clearly visualize color separation.
        const colors = [
            { hex: `rgba(255, 30, 30, ${alpha})`,   ior: 1.315 }, // Red
            { hex: `rgba(255, 150, 0, ${alpha})`,   ior: 1.322 }, // Orange
            { hex: `rgba(255, 255, 0, ${alpha})`,   ior: 1.328 }, // Yellow
            { hex: `rgba(0, 255, 0, ${alpha})`,     ior: 1.335 }, // Green
            { hex: `rgba(0, 150, 255, ${alpha})`,   ior: 1.342 }, // Blue
            { hex: `rgba(150, 0, 255, ${alpha})`,   ior: 1.350 }  // Violet
        ];

        // Incident white light directional vectors
        const lightDir = { x: Math.cos(config.angle), y: Math.sin(config.angle) };
        const lightNormal = { x: lightDir.y, y: -lightDir.x };

        // Process ray tracing independently for each wavelength channel
        for (let c = 0; c < colors.length; c++) {
            const channel = colors[c];
            ctxPrism.strokeStyle = channel.hex;
            ctxPrism.lineWidth = 1;
            ctxPrism.beginPath();

            for (let i = 0; i < config.rayCount; i++) {
                const t = i / (config.rayCount - 1 || 1);

                // Concentrate rays in the Descartes zone (70-95% of radius)
                // for optimal rainbow intensity visibility.
                const offset = dropRadius * 0.8 + t * dropRadius * 0.35;

                let rayPos = {
                    x: dropCenter.x - lightDir.x * 500 + lightNormal.x * offset,
                    y: dropCenter.y - lightDir.y * 500 + lightNormal.y * offset
                };
                let rayDir = { x: lightDir.x, y: lightDir.y };

                // Phase 1: Droplet entry
                const t1 = intersectCircle(rayPos, rayDir, dropCenter, dropRadius);
                if (t1) {
                    const hit1 = vec.add(rayPos, vec.mul(rayDir, t1));
                    ctxPrism.moveTo(rayPos.x, rayPos.y);
                    ctxPrism.lineTo(hit1.x, hit1.y);

                    const normal1 = vec.normalize(vec.sub(hit1, dropCenter));

                    // Refraction (Air -> Water) based on specific IOR
                    const rDir1 = refract(rayDir, normal1, 1.0 / channel.ior);

                    if (rDir1) {
                        const startInside = vec.add(hit1, vec.mul(rDir1, 0.01));

                        // Phase 2: Internal propagation to back wall
                        const t2 = intersectCircle(startInside, rDir1, dropCenter, dropRadius);
                        if (t2) {
                            const hit2 = vec.add(startInside, vec.mul(rDir1, t2));
                            ctxPrism.lineTo(hit2.x, hit2.y);

                            const normal2 = vec.normalize(vec.sub(dropCenter, hit2));
                            const dotDN = vec.dot(rDir1, normal2);

                            // Phase 3: Partial internal reflection
                            const rDir2 = vec.sub(rDir1, vec.mul(normal2, 2 * dotDN));
                            const startInside2 = vec.add(hit2, vec.mul(rDir2, 0.01));

                            // Phase 4: Droplet exit
                            const t3 = intersectCircle(startInside2, rDir2, dropCenter, dropRadius);
                            if (t3) {
                                const hit3 = vec.add(startInside2, vec.mul(rDir2, t3));
                                ctxPrism.lineTo(hit3.x, hit3.y);

                                const normal3 = vec.normalize(vec.sub(dropCenter, hit3));

                                // Refraction (Water -> Air)
                                const rDir3 = refract(rDir2, normal3, channel.ior / 1.0);

                                if (rDir3) {
                                    // Project dispersed spectrum toward the observer
                                    const hit4 = vec.add(hit3, vec.mul(rDir3, 2000));
                                    ctxPrism.lineTo(hit4.x, hit4.y);
                                }
                            }
                        }
                    }
                }
            }
            ctxPrism.stroke();
        }
        ctxPrism.globalCompositeOperation = 'source-over';
    }

    function updatePrismUI() {
        if (prismSliders.rayVal) prismSliders.rayVal.textContent = prismSliders.ray.value;
        drawPrismSimulation();
    }

    ['input'].forEach(evt => {
        prismSliders.angle?.addEventListener(evt, updatePrismUI);
        prismSliders.ray?.addEventListener(evt, updatePrismUI);
    });

    drawPrismSimulation();
}