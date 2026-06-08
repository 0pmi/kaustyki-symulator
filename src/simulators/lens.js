/**
 * @fileoverview Simulates spherical aberration through a realistic
 * bi-convex glass lens using monochromatic ray tracing and Snell's Law.
 */

// --- 1. INTERNAL MATH UTILITIES ---
// Isolated math module ensuring rock-solid vector operations and intersections.
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

    /**
     * Calculates the reflection vector (used for Total Internal Reflection).
     */
    reflect: (incident, normal) => {
        const dot = MathUtils.dot(incident, normal);
        return MathUtils.sub(incident, MathUtils.mul(normal, 2.0 * dot));
    },

    /**
     * Finds the closest positive intersection distance (t) between a ray and a circle.
     */
    intersectCircle: (ro, rd, center, radius) => {
        const oc = MathUtils.sub(ro, center);
        const b = MathUtils.dot(oc, rd);
        const c = MathUtils.dot(oc, oc) - radius * radius;
        const delta = b * b - c;

        if (delta > 0) {
            const sqrtDelta = Math.sqrt(delta);
            const t1 = -b - sqrtDelta;
            const t2 = -b + sqrtDelta;

            // Return the first valid forward intersection
            if (t1 > 1e-4) return t1;
            if (t2 > 1e-4) return t2;
        }
        return null;
    },

    /**
     * Calculates the refracted directional vector based on Snell's Law.
     * @param {Object} incident - Normalized incoming ray direction.
     * @param {Object} normal - Normalized surface normal pointing against the ray.
     * @param {number} eta - Ratio of indices of refraction (n1 / n2).
     */
    refract: (incident, normal, eta) => {
        const cosi = -MathUtils.dot(incident, normal);
        const sin2t = eta * eta * (1.0 - cosi * cosi);

        // Handle Total Internal Reflection (TIR)
        if (sin2t > 1.0) return null;

        const cost = Math.sqrt(1.0 - sin2t);
        return MathUtils.add(
            MathUtils.mul(incident, eta),
            MathUtils.mul(normal, eta * cosi - cost)
        );
    }
};

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
     * Core render loop. Updates physics and draws the current frame.
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

        // --- 2. BI-CONVEX LENS DEFINITION ---
        // A realistic lens constructed from the intersection of two overlapping circles.
        const lensCenter = { x: canvasLens.width * 0.33, y: canvasLens.height / 2 };
        const lensRadius = 130;
        const lensOffset = 100;

        // C1 defines the LEFT surface (center is on the right)
        const C1 = { x: lensCenter.x + lensOffset, y: lensCenter.y };
        // C2 defines the RIGHT surface (center is on the left)
        const C2 = { x: lensCenter.x - lensOffset, y: lensCenter.y };

        const lightSource = { x: config.lightX, y: config.lightY };

        // Render physical glass geometry
        const lensAngle = Math.acos(lensOffset / lensRadius);
        ctxLens.beginPath();
        ctxLens.arc(C1.x, C1.y, lensRadius, Math.PI - lensAngle, Math.PI + lensAngle); // Left arc
        ctxLens.arc(C2.x, C2.y, lensRadius, -lensAngle, lensAngle); // Right arc
        ctxLens.closePath();

        ctxLens.fillStyle = 'rgba(74, 144, 226, 0.1)';
        ctxLens.fill();
        ctxLens.strokeStyle = 'rgba(74, 144, 226, 0.6)';
        ctxLens.lineWidth = 2;
        ctxLens.stroke();

        // Render point light source
        ctxLens.beginPath();
        ctxLens.arc(lightSource.x, lightSource.y, 6, 0, 2 * Math.PI);
        ctxLens.fillStyle = '#ffffff';
        ctxLens.shadowBlur = 15;
        ctxLens.shadowColor = '#4cd137'; // Glow matches the monochromatic ray color
        ctxLens.fill();
        ctxLens.shadowBlur = 0;

        // --- 3. DYNAMIC AIMING MATH ---
        // Automatically calculates the perfect angular spread to hit the entire lens surface
        const targetVector = MathUtils.sub(lensCenter, lightSource);
        const distanceToLens = MathUtils.mag(targetVector);
        const baseAngle = Math.atan2(targetVector.y, targetVector.x);

        const lensHalfHeight = Math.sqrt(lensRadius * lensRadius - lensOffset * lensOffset);

        // Scale by 0.98 to prevent boundary precision errors on extreme edges
        const spreadAngle = 2 * Math.asin(lensHalfHeight / distanceToLens) * 0.98;
        const startAngle = baseAngle - spreadAngle / 2;

        ctxLens.globalCompositeOperation = 'lighter'; // Additive blending for caustics

        // --- 4. MONOCHROMATIC RAYTRACING ---
        // Classic "optical green" laser color for high contrast
        ctxLens.strokeStyle = 'rgba(76, 209, 55, 0.15)';
        ctxLens.lineWidth = 1.5;

        for (let i = 0; i < config.rayCount; i++) {
            const angle = startAngle + (i / (config.rayCount - 1 || 1)) * spreadAngle;
            const rayDir = { x: Math.cos(angle), y: Math.sin(angle) };
            const rayPos = lightSource;

            // 1st Intersect: Air -> Glass (Entering Left surface, C1)
            const t1 = MathUtils.intersectCircle(rayPos, rayDir, C1, lensRadius);

            if (t1) {
                const hit1 = MathUtils.add(rayPos, MathUtils.mul(rayDir, t1));
                const distToC2 = MathUtils.mag(MathUtils.sub(hit1, C2));
                if (distToC2 > lensRadius + 0.001) {
                    continue;
                }
                // Draw incoming ray
                ctxLens.beginPath();
                ctxLens.moveTo(rayPos.x, rayPos.y);
                ctxLens.lineTo(hit1.x, hit1.y);
                ctxLens.stroke();

                // Normal pointing outwards from C1 towards the light
                const normal1 = MathUtils.normalize(MathUtils.sub(hit1, C1));
                const refractedDir1 = MathUtils.refract(rayDir, normal1, 1.0 / config.ior);

                if (refractedDir1) {
                    // 2nd Intersect: Glass -> Air (Exiting Right surface, C2)
                    const t2 = MathUtils.intersectCircle(hit1, refractedDir1, C2, lensRadius);

                    if (t2) {
                        const hit2 = MathUtils.add(hit1, MathUtils.mul(refractedDir1, t2));
                        const distToC1 = MathUtils.mag(MathUtils.sub(hit2, C1));
                        if (distToC1 > lensRadius + 0.001) {
                            continue;
                        }
                        // Draw internal ray
                        ctxLens.beginPath();
                        ctxLens.moveTo(hit1.x, hit1.y);
                        ctxLens.lineTo(hit2.x, hit2.y);
                        ctxLens.stroke();

                        // Normal pointing INTO the glass for the exit calculation
                        const normal2 = MathUtils.normalize(MathUtils.sub(C2, hit2));
                        const refractedDir2 = MathUtils.refract(refractedDir1, normal2, config.ior / 1.0);

                        if (refractedDir2) {
                            // Standard exit refraction
                            const rayEnd = MathUtils.add(hit2, MathUtils.mul(refractedDir2, 1000));

                            ctxLens.beginPath();
                            ctxLens.moveTo(hit2.x, hit2.y);
                            ctxLens.lineTo(rayEnd.x, rayEnd.y);
                            ctxLens.stroke();
                        } else {
                            // Total Internal Reflection (TIR) fallback
                            // If the exit angle is too extreme, the ray bounces internally
                            const reflectedDir = MathUtils.reflect(refractedDir1, normal2);
                            const t3 = MathUtils.intersectCircle(hit2, reflectedDir, C1, lensRadius);

                            if (t3) {
                                const hit3 = MathUtils.add(hit2, MathUtils.mul(reflectedDir, t3));
                                ctxLens.beginPath();
                                ctxLens.moveTo(hit2.x, hit2.y);
                                ctxLens.lineTo(hit3.x, hit3.y);

                                // Draw reflected internal rays slightly dimmer
                                ctxLens.globalAlpha = 0.5;
                                ctxLens.stroke();
                                ctxLens.globalAlpha = 1.0;
                            }
                        }
                    }
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

    // Attach event listeners to UI controls
    ['input'].forEach(evt => {
        lensSliders.ray?.addEventListener(evt, updateLensUI);
        lensSliders.ior?.addEventListener(evt, updateLensUI);
        lensSliders.lightY?.addEventListener(evt, updateLensUI);
    });

    // Initial render
    drawLensSimulation();
}