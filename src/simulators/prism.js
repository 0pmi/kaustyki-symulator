/**
 * @fileoverview Simulates light dispersion and rainbow formation
 * within a circular raindrop via sequential internal reflection and refraction.
 */

const MathUtils = {
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    mul: (v, s) => ({ x: v.x * s, y: v.y * s }),
    mag: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
    normalize: (v) => {
        const m = MathUtils.mag(v);
        return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
    },
    dot: (a, b) => a.x * b.x + a.y * b.y,
    reflect: (incident, normal) => {
        const dot = MathUtils.dot(incident, normal);
        return MathUtils.sub(incident, MathUtils.mul(normal, 2.0 * dot));
    },
    intersectCircle: (ro, rd, center, radius) => {
        const oc = MathUtils.sub(ro, center);
        const b = MathUtils.dot(oc, rd);
        const c = MathUtils.dot(oc, oc) - radius * radius;
        const delta = b * b - c;
        if (delta > 0) {
            const sqrtDelta = Math.sqrt(delta);
            const t1 = -b - sqrtDelta;
            const t2 = -b + sqrtDelta;
            // Return the first forward-facing intersection
            if (t1 > 1e-4) return t1;
            if (t2 > 1e-4) return t2;
        }
        return null;
    },
    refract: (incident, normal, eta) => {
        const cosi = -MathUtils.dot(incident, normal);
        const sin2t = eta * eta * (1.0 - cosi * cosi);
        if (sin2t > 1.0) return null; // Total Internal Reflection
        const cost = Math.sqrt(1.0 - sin2t);
        return MathUtils.add(
            MathUtils.mul(incident, eta),
            MathUtils.mul(normal, eta * cosi - cost)
        );
    }
};

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
     * Renders chromatic dispersion by tracking physical hits step-by-step.
     * Prevents overdraw by splitting wavelengths only after droplet entry.
     */
    function drawPrismSimulation() {
        ctxPrism.globalCompositeOperation = 'source-over';
        ctxPrism.clearRect(0, 0, canvasPrism.width, canvasPrism.height);

        // Normalize slider input [-20, 20] to [-1.0, 1.0] for geometric targeting
        const sliderVal = parseFloat(prismSliders.angle?.value || -5);
        const normalizedOffset = sliderVal / 20.0;

        const config = {
            rayCount: parseInt(prismSliders.ray?.value || 1, 10)
        };

        const dropCenter = { x: canvasPrism.width * 0.65, y: canvasPrism.height * 0.45 };
        const dropRadius = 180;

        // Base droplet rendering
        ctxPrism.beginPath();
        ctxPrism.arc(dropCenter.x, dropCenter.y, dropRadius, 0, Math.PI * 2);
        ctxPrism.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctxPrism.fillStyle = 'rgba(74, 144, 226, 0.05)';
        ctxPrism.fill();
        ctxPrism.stroke();

        const lightDir = { x: 1, y: 0 };

        // Map offset to physical drop radius. Invert Y so positive slider values move up.
        const targetOffset = -normalizedOffset * dropRadius * 0.95;

        // Limit maximum beam spread to 40% of the radius to maintain visual clarity
        const beamWidth = (config.rayCount === 1) ? 0 : (config.rayCount / 300) * dropRadius * 0.4;

        // Independent alpha scaling based on ray density to prevent white blowout
        const incidentAlpha = Math.max(0.02, 1.0 / config.rayCount).toFixed(3);
        const colorAlpha = Math.max(0.08, 4.0 / config.rayCount).toFixed(3);
        const secondaryAlpha = Math.max(0.02, 1.5 / config.rayCount).toFixed(3);

        const wavelengths = [
            { r: 255, g: 30,  b: 30,  ior: 1.320 },
            { r: 255, g: 150, b: 0,   ior: 1.325 },
            { r: 255, g: 255, b: 0,   ior: 1.330 },
            { r: 0,   g: 255, b: 0,   ior: 1.335 },
            { r: 0,   g: 150, b: 255, ior: 1.340 },
            { r: 150, g: 0,   b: 255, ior: 1.345 }
        ];

        // Outer loop iterates through spatial rays to draw incident light once per coordinate
        for (let i = 0; i < config.rayCount; i++) {
            const t = config.rayCount > 1 ? (i / (config.rayCount - 1)) - 0.5 : 0;
            const currentOffset = targetOffset + t * beamWidth;

            // Discard rays outside the droplet boundaries
            if (Math.abs(currentOffset) >= dropRadius * 0.99) continue;

            let rayPos = { x: dropCenter.x - 500, y: dropCenter.y + currentOffset };

            const t1 = MathUtils.intersectCircle(rayPos, lightDir, dropCenter, dropRadius);
            if (!t1) continue;

            const hit1 = MathUtils.add(rayPos, MathUtils.mul(lightDir, t1));

            // Render pure white incident ray (No additive blending to prevent glare)
            ctxPrism.globalCompositeOperation = 'source-over';
            ctxPrism.beginPath();
            ctxPrism.moveTo(rayPos.x, rayPos.y);
            ctxPrism.lineTo(hit1.x, hit1.y);
            ctxPrism.strokeStyle = `rgba(255, 255, 255, ${incidentAlpha})`;
            ctxPrism.lineWidth = 1;
            ctxPrism.stroke();

            const normal1 = MathUtils.normalize(MathUtils.sub(hit1, dropCenter));

            // Switch to additive blending for internal spectrum separation
            ctxPrism.globalCompositeOperation = 'lighter';

            // Inner loop computes dispersion specific to each wavelength
            for (let c = 0; c < wavelengths.length; c++) {
                const channel = wavelengths[c];
                ctxPrism.strokeStyle = `rgba(${channel.r}, ${channel.g}, ${channel.b}, ${colorAlpha})`;

                const dir1 = MathUtils.refract(lightDir, normal1, 1.0 / channel.ior);
                if (!dir1) continue;

                // Phase 1: Internal propagation to back wall
                const startInside1 = MathUtils.add(hit1, MathUtils.mul(dir1, 0.01));
                const t2 = MathUtils.intersectCircle(startInside1, dir1, dropCenter, dropRadius);
                if (!t2) continue;

                const hit2 = MathUtils.add(startInside1, MathUtils.mul(dir1, t2));
                ctxPrism.beginPath();
                ctxPrism.moveTo(hit1.x, hit1.y);
                ctxPrism.lineTo(hit2.x, hit2.y);
                ctxPrism.stroke();

                // Phase 2: Primary internal reflection
                const normal2_in = MathUtils.normalize(MathUtils.sub(dropCenter, hit2));
                const dir2 = MathUtils.reflect(dir1, normal2_in);

                const startInside2 = MathUtils.add(hit2, MathUtils.mul(dir2, 0.01));
                const t3 = MathUtils.intersectCircle(startInside2, dir2, dropCenter, dropRadius);
                if (!t3) continue;

                const hit3 = MathUtils.add(startInside2, MathUtils.mul(dir2, t3));
                ctxPrism.beginPath();
                ctxPrism.moveTo(hit2.x, hit2.y);
                ctxPrism.lineTo(hit3.x, hit3.y);
                ctxPrism.stroke();

                // Phase 3: Primary rainbow exit
                const normal3_in = MathUtils.normalize(MathUtils.sub(dropCenter, hit3));
                const primaryExitDir = MathUtils.refract(dir2, normal3_in, channel.ior / 1.0);

                if (primaryExitDir) {
                    const hitPrimaryEnd = MathUtils.add(hit3, MathUtils.mul(primaryExitDir, 1000));
                    ctxPrism.beginPath();
                    ctxPrism.moveTo(hit3.x, hit3.y);
                    ctxPrism.lineTo(hitPrimaryEnd.x, hitPrimaryEnd.y);
                    ctxPrism.stroke();
                }

                // Phase 4: Secondary internal reflection and rainbow
                const dir3 = MathUtils.reflect(dir2, normal3_in);
                const startInside3 = MathUtils.add(hit3, MathUtils.mul(dir3, 0.01));
                const t4 = MathUtils.intersectCircle(startInside3, dir3, dropCenter, dropRadius);

                if (t4) {
                    const hit4 = MathUtils.add(startInside3, MathUtils.mul(dir3, t4));

                    ctxPrism.strokeStyle = `rgba(${channel.r}, ${channel.g}, ${channel.b}, ${secondaryAlpha})`;
                    ctxPrism.beginPath();
                    ctxPrism.moveTo(hit3.x, hit3.y);
                    ctxPrism.lineTo(hit4.x, hit4.y);
                    ctxPrism.stroke();

                    const normal4_in = MathUtils.normalize(MathUtils.sub(dropCenter, hit4));
                    const secondaryExitDir = MathUtils.refract(dir3, normal4_in, channel.ior / 1.0);

                    if (secondaryExitDir) {
                        const hitSecondaryEnd = MathUtils.add(hit4, MathUtils.mul(secondaryExitDir, 1000));
                        ctxPrism.beginPath();
                        ctxPrism.moveTo(hit4.x, hit4.y);
                        ctxPrism.lineTo(hitSecondaryEnd.x, hitSecondaryEnd.y);
                        ctxPrism.stroke();
                    }
                }
            }
        }

        // Draw physical boundary outline over all rays to prevent edge aliasing
        ctxPrism.globalCompositeOperation = 'source-over';
        ctxPrism.beginPath();
        ctxPrism.arc(dropCenter.x, dropCenter.y, dropRadius, 0, Math.PI * 2);
        ctxPrism.strokeStyle = 'rgba(74, 144, 226, 0.6)';
        ctxPrism.lineWidth = 2;
        ctxPrism.stroke();
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