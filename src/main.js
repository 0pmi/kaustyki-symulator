import './style.css'

// -----------------------------------------------
// Lightbox component – image gallery overlay
// -----------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const images = document.querySelectorAll('.gallery-item img');
    const closeBtn = document.querySelector('.close-lightbox');

    // Open lightbox when a gallery image is clicked
    images.forEach(img => {
        img.addEventListener('click', () => {
            lightbox.style.display = 'flex';
            lightboxImg.src = img.src;
        });
    });

    // Close lightbox on "×" button click
    closeBtn.addEventListener('click', () => {
        lightbox.style.display = 'none';
    });

    // Close lightbox when clicking the dark background (outside the image)
    lightbox.addEventListener('click', (e) => {
        if (e.target !== lightboxImg) {
            lightbox.style.display = 'none';
        }
    });
});

// ======================================================
// 2D vector operations
// ======================================================
const vec = {
    add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
    sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
    mul: (v, scalar) => ({ x: v.x * scalar, y: v.y * scalar }),
    dot: (v1, v2) => v1.x * v2.x + v1.y * v2.y,
    mag: (v) => Math.sqrt(vec.dot(v, v)),
    normalize: (v) => {
        const m = vec.mag(v);
        return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
    }
};

// ------------------------------------------------------
// Ray–circle intersection (returns distance t or null)
// ------------------------------------------------------
function intersectCircle(origin, dir, circleCenter, circleRadius) {
    const L = vec.sub(origin, circleCenter);
    const a = vec.dot(dir, dir);
    const b = 2 * vec.dot(dir, L);
    const c = vec.dot(L, L) - circleRadius * circleRadius;
    const delta = b * b - 4 * a * c;

    if (delta < 0) return null;

    const t1 = (-b - Math.sqrt(delta)) / (2 * a);
    const t2 = (-b + Math.sqrt(delta)) / (2 * a);

    if (t1 > 0.001) return t1;
    if (t2 > 0.001) return t2;
    return null;
}

// ------------------------------------------------------
// Ray–segment intersection (used for polygon edges)
// Returns { t, normal } or null
// ------------------------------------------------------
function intersectSegment(origin, dir, p1, p2) {
    const v1 = { x: origin.x - p1.x, y: origin.y - p1.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const v3 = { x: -dir.y, y: dir.x }; // perpendicular to ray direction

    const dot = v2.x * v3.x + v2.y * v3.y;
    if (Math.abs(dot) < 0.00001) return null;

    const t1 = (v2.x * v1.y - v2.y * v1.x) / dot;
    const t2 = (v1.x * v3.x + v1.y * v3.y) / dot;

    if (t1 >= 0 && t2 >= 0 && t2 <= 1) {
        // Compute outward-pointing normal (assuming clockwise vertex order)
        const n = { x: v2.y, y: -v2.x };
        const len = Math.sqrt(n.x * n.x + n.y * n.y);
        return { t: t1, normal: { x: n.x / len, y: n.y / len } };
    }
    return null;
}

// ======================================================
// Simulator 1 – SNELL'S LAW (refraction at a flat interface)
// ======================================================
const canvasSnell = document.getElementById('canvas-snell');
const ctxSnell = canvasSnell.getContext('2d');

const snellSliders = {
    angle: document.getElementById('snell-angle'),
    angleVal: document.getElementById('snell-angle-val'),
    ior1: document.getElementById('snell-ior1'),
    ior1Val: document.getElementById('snell-ior1-val'),
    ior2: document.getElementById('snell-ior2'),
    ior2Val: document.getElementById('snell-ior2-val')
};

/**
 * Renders the Snell's law diagram:
 * - Two media (top and bottom halves)
 * - A normal line (dashed) through the center
 * - Incident ray, refracted ray, and a weak reflected ray
 * - In case of total internal reflection, draws only the reflected ray in gold
 */
function drawSnellSimulation() {
    ctxSnell.clearRect(0, 0, canvasSnell.width, canvasSnell.height);

    const config = {
        angle: parseInt(snellSliders.angle.value, 10),
        ior1: parseFloat(snellSliders.ior1.value),
        ior2: parseFloat(snellSliders.ior2.value)
    };

    const cw = canvasSnell.width;
    const ch = canvasSnell.height;
    const cx = cw / 2;
    const cy = ch / 2;

    // Background media (shaded according to refractive index)
    ctxSnell.fillStyle = `rgba(74, 144, 226, ${0.05 + config.ior1 * 0.05})`;
    ctxSnell.fillRect(0, 0, cw, cy);

    ctxSnell.fillStyle = `rgba(46, 204, 113, ${0.05 + config.ior2 * 0.05})`;
    ctxSnell.fillRect(0, cy, cw, cy);

    // Interface line
    ctxSnell.beginPath();
    ctxSnell.moveTo(0, cy);
    ctxSnell.lineTo(cw, cy);
    ctxSnell.strokeStyle = '#555';
    ctxSnell.lineWidth = 2;
    ctxSnell.stroke();

    // Normal (dashed)
    ctxSnell.beginPath();
    ctxSnell.setLineDash([5, 5]);
    ctxSnell.moveTo(cx, 50);
    ctxSnell.lineTo(cx, ch - 50);
    ctxSnell.strokeStyle = '#888';
    ctxSnell.lineWidth = 1;
    ctxSnell.stroke();
    ctxSnell.setLineDash([]);

    const theta1Deg = config.angle;
    const theta1Rad = theta1Deg * (Math.PI / 180);

    // Snell's law: sin(theta2) = (n1 / n2) * sin(theta1)
    const sinTheta2 = (config.ior1 / config.ior2) * Math.sin(theta1Rad);

    // Additive blending for glowing lines
    ctxSnell.globalCompositeOperation = 'lighter';
    const incidentEndX = cx - 400 * Math.sin(theta1Rad);
    const incidentEndY = cy - 400 * Math.cos(theta1Rad);

    // Incident ray
    ctxSnell.beginPath();
    ctxSnell.moveTo(incidentEndX, incidentEndY);
    ctxSnell.lineTo(cx, cy);
    ctxSnell.strokeStyle = 'rgba(255, 50, 50, 0.8)';
    ctxSnell.lineWidth = 3;
    ctxSnell.stroke();

    if (Math.abs(sinTheta2) <= 1.0) {
        // Normal refraction
        const theta2Rad = Math.asin(sinTheta2);
        const refractEndX = cx + 400 * Math.sin(theta2Rad);
        const refractEndY = cy + 400 * Math.cos(theta2Rad);

        ctxSnell.beginPath();
        ctxSnell.moveTo(cx, cy);
        ctxSnell.lineTo(refractEndX, refractEndY);
        ctxSnell.strokeStyle = 'rgba(255, 50, 50, 0.8)';
        ctxSnell.lineWidth = 3;
        ctxSnell.stroke();

        // Weak reflected ray (always present at a real interface)
        const reflectEndX = cx + 400 * Math.sin(theta1Rad);
        const reflectEndY = cy - 400 * Math.cos(theta1Rad);
        ctxSnell.beginPath();
        ctxSnell.moveTo(cx, cy);
        ctxSnell.lineTo(reflectEndX, reflectEndY);
        ctxSnell.strokeStyle = 'rgba(255, 50, 50, 0.15)';
        ctxSnell.lineWidth = 1;
        ctxSnell.stroke();
    } else {
        // Total internal reflection (golden ray)
        const reflectEndX = cx + 400 * Math.sin(theta1Rad);
        const reflectEndY = cy - 400 * Math.cos(theta1Rad);

        ctxSnell.beginPath();
        ctxSnell.moveTo(cx, cy);
        ctxSnell.lineTo(reflectEndX, reflectEndY);
        ctxSnell.strokeStyle = 'rgba(255, 200, 50, 0.9)';
        ctxSnell.lineWidth = 4;
        ctxSnell.stroke();
    }

    ctxSnell.globalCompositeOperation = 'source-over';
}

// Update UI labels and redraw
function updateSnellUI() {
    snellSliders.angleVal.textContent = snellSliders.angle.value;
    snellSliders.ior1Val.textContent = parseFloat(snellSliders.ior1.value).toFixed(2);
    snellSliders.ior2Val.textContent = parseFloat(snellSliders.ior2.value).toFixed(2);
    drawSnellSimulation();
}

['input'].forEach(evt => {
    snellSliders.angle.addEventListener(evt, updateSnellUI);
    snellSliders.ior1.addEventListener(evt, updateSnellUI);
    snellSliders.ior2.addEventListener(evt, updateSnellUI);
});

// Initial render
drawSnellSimulation();

// ======================================================
// Simulator 2 – LENS (converging lens with adjustable IOR)
// ======================================================
const canvasLens = document.getElementById('canvas-lens');
const ctxLens = canvasLens.getContext('2d');

const lensSliders = {
    ray: document.getElementById('ray-count'),
    rayVal: document.getElementById('ray-count-val'),
    ior: document.getElementById('ior'),
    iorVal: document.getElementById('ior-val'),
    lightY: document.getElementById('light-y')
};

/**
 * Refracts an incident direction using Snell's law.
 * eta = n1 / n2, where n1 is the index before the interface and n2 is after.
 * Returns the refracted direction (unit vector) or null if TIR occurs.
 */
function refract(incident, normal, eta) {
    let cosi = vec.dot(incident, normal);

    // Ensure normal points against the incident direction
    if (cosi > 0) {
        normal = vec.mul(normal, -1);
        cosi = vec.dot(incident, normal);
    }

    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null; // total internal reflection

    return vec.normalize(
        vec.sub(
            vec.mul(incident, eta),
            vec.mul(normal, eta * cosi + Math.sqrt(k))
        )
    );
}

/**
 * Renders the lens simulation:
 * - A circular lens with adjustable IOR
 * - A point light source on the left side
 * - Multiple rays (configurable) that enter, refract inside, exit, and continue
 */
function drawLensSimulation() {
    ctxLens.globalCompositeOperation = 'source-over';
    ctxLens.clearRect(0, 0, canvasLens.width, canvasLens.height);

    const config = {
        rayCount: parseInt(lensSliders.ray.value, 10),
        ior: parseFloat(lensSliders.ior.value),
        lightY: parseInt(lensSliders.lightY.value, 10),
        lightX: 50
    };

    const circleCenter = { x: canvasLens.width * 0.35, y: canvasLens.height / 2 };
    const circleRadius = 130;
    const lightSource = { x: config.lightX, y: config.lightY };

    // Draw lens
    ctxLens.beginPath();
    ctxLens.arc(circleCenter.x, circleCenter.y, circleRadius, 0, 2 * Math.PI);
    ctxLens.strokeStyle = 'rgba(74, 144, 226, 0.5)';
    ctxLens.fillStyle = 'rgba(74, 144, 226, 0.05)';
    ctxLens.lineWidth = 2;
    ctxLens.fill();
    ctxLens.stroke();

    // Light source indicator
    ctxLens.beginPath();
    ctxLens.arc(lightSource.x, lightSource.y, 8, 0, 2 * Math.PI);
    ctxLens.fillStyle = '#f1c40f';
    ctxLens.fill();

    // Additive blending for bright ray lines
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
            const refractedDir1 = refract(rayDir, normal1, 1.0 / config.ior);

            let finalHit = null;
            if (refractedDir1) {
                const t2 = intersectCircle(hit1, refractedDir1, circleCenter, circleRadius);
                if (t2) {
                    const hit2 = vec.add(hit1, vec.mul(refractedDir1, t2));
                    ctxLens.lineTo(hit2.x, hit2.y);

                    const normal2 = vec.mul(vec.normalize(vec.sub(hit2, circleCenter)), -1);
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

// Update slider labels and redraw
function updateLensUI() {
    lensSliders.rayVal.textContent = lensSliders.ray.value;
    lensSliders.iorVal.textContent = parseFloat(lensSliders.ior.value).toFixed(2);
    drawLensSimulation();
}

['input'].forEach(evt => {
    lensSliders.ray.addEventListener(evt, updateLensUI);
    lensSliders.ior.addEventListener(evt, updateLensUI);
    lensSliders.lightY.addEventListener(evt, updateLensUI);
});

drawLensSimulation();

// ======================================================
// Simulator 3 – CUP (nephroid caustic inside a circular mirror)
// ======================================================
const canvasCup = document.getElementById('canvas-cup');
const ctxCup = canvasCup.getContext('2d');

const cupSliders = {
    lightX: document.getElementById('reflect-light-x'),
    lightXVal: document.getElementById('reflect-light-x-val'),
    ray: document.getElementById('reflect-ray-count'),
    rayVal: document.getElementById('reflect-ray-count-val')
};

/**
 * Renders the cup caustic simulation:
 * - A circular reflective wall (the cup)
 * - Parallel rays entering from a certain direction (sun angle controlled by slider)
 * - Each ray hits the interior back wall, reflects, and draws a segment of the caustic
 */
function drawCupSimulation() {
    ctxCup.globalCompositeOperation = 'source-over';
    ctxCup.clearRect(0, 0, canvasCup.width, canvasCup.height);

    const cupCenter = { x: canvasCup.width / 2, y: canvasCup.height / 2 };
    const cupRadius = 220;
    const rayCount = parseInt(cupSliders.ray.value, 10);

    // Slider value maps to sun direction angle
    const sliderVal = parseInt(cupSliders.lightX.value, 10) || 50;
    const sunAngle = (sliderVal - 50) * 0.015;

    const sunDir = { x: Math.cos(sunAngle), y: Math.sin(sunAngle) };
    const sunNormal = { x: -sunDir.y, y: sunDir.x };

    // Draw the cup outline
    ctxCup.beginPath();
    ctxCup.arc(cupCenter.x, cupCenter.y, cupRadius, 0, 2 * Math.PI);
    ctxCup.strokeStyle = 'rgba(231, 76, 60, 0.5)';
    ctxCup.fillStyle = 'rgba(231, 76, 60, 0.02)';
    ctxCup.lineWidth = 3;
    ctxCup.fill();
    ctxCup.stroke();

    ctxCup.globalCompositeOperation = 'lighter';
    ctxCup.lineWidth = 1;

    // Dynamic transparency to avoid over-exposure
    const alphaBase = Math.min(1.0, 15.0 / rayCount).toFixed(3);
    const alphaCaustic = Math.min(1.0, 40.0 / rayCount).toFixed(3);

    for (let i = 0; i < rayCount; i++) {
        const t = i / (rayCount - 1 || 1);
        const offset = -cupRadius + t * (cupRadius * 2);

        // Ray starts far outside the cup
        const rayOrigin = {
            x: cupCenter.x - sunDir.x * 500 + sunNormal.x * offset,
            y: cupCenter.y - sunDir.y * 500 + sunNormal.y * offset
        };

        // Intersection with the circle (front and back hits)
        const L = vec.sub(rayOrigin, cupCenter);
        const a = vec.dot(sunDir, sunDir);
        const b = 2 * vec.dot(sunDir, L);
        const c = vec.dot(L, L) - cupRadius * cupRadius;
        const delta = b * b - 4 * a * c;

        if (delta > 0) {
            const t1 = (-b - Math.sqrt(delta)) / (2 * a); // front entry
            const t2 = (-b + Math.sqrt(delta)) / (2 * a); // back wall hit

            if (t2 > 0 && t1 > 0) {
                const hitFront = vec.add(rayOrigin, vec.mul(sunDir, t1));
                const hitBack = vec.add(rayOrigin, vec.mul(sunDir, t2));

                // Outer approach (faint)
                ctxCup.beginPath();
                ctxCup.moveTo(rayOrigin.x, rayOrigin.y);
                ctxCup.lineTo(hitFront.x, hitFront.y);
                ctxCup.strokeStyle = `rgba(255, 255, 255, ${alphaBase * 0.2})`;
                ctxCup.stroke();

                // Path inside the cup to the back wall
                ctxCup.beginPath();
                ctxCup.moveTo(hitFront.x, hitFront.y);
                ctxCup.lineTo(hitBack.x, hitBack.y);
                ctxCup.strokeStyle = `rgba(255, 255, 255, ${alphaBase})`;
                ctxCup.stroke();

                // Internal reflection at the back wall
                const normal = vec.normalize(vec.sub(cupCenter, hitBack));
                const dotDN = vec.dot(sunDir, normal);
                const reflectDir = vec.sub(sunDir, vec.mul(normal, 2 * dotDN));

                const startReflect = vec.add(hitBack, vec.mul(reflectDir, 0.01));
                const tReflect = intersectCircle(startReflect, reflectDir, cupCenter, cupRadius);

                if (tReflect) {
                    const hitReflect = vec.add(startReflect, vec.mul(reflectDir, tReflect));

                    ctxCup.beginPath();
                    ctxCup.moveTo(hitBack.x, hitBack.y);
                    ctxCup.lineTo(hitReflect.x, hitReflect.y);
                    // Golden caustic segment
                    ctxCup.strokeStyle = `rgba(255, 180, 50, ${alphaCaustic})`;
                    ctxCup.stroke();
                }
            }
        }
    }
    ctxCup.globalCompositeOperation = 'source-over';
}

// Update slider labels and redraw
function updateCupUI() {
    cupSliders.lightXVal.textContent = cupSliders.lightX.value;
    cupSliders.rayVal.textContent = cupSliders.ray.value;
    drawCupSimulation();
}

['input'].forEach(evt => {
    cupSliders.lightX.addEventListener(evt, updateCupUI);
    cupSliders.ray.addEventListener(evt, updateCupUI);
});

drawCupSimulation();

// ======================================================
// Simulator 4 – PRISM / RAINBOW DROP (dispersion simulation)
// ======================================================
const canvasPrism = document.getElementById('canvas-prism');
const ctxPrism = canvasPrism.getContext('2d');

const prismSliders = {
    angle: document.getElementById('prism-angle'),
    ray: document.getElementById('prism-ray-count'),
    rayVal: document.getElementById('prism-ray-count-val')
};

// ------------------------------------------------------
// Wavelength (nm) to RGB color conversion
// ------------------------------------------------------
function wavelengthToRGB(wavelength) {
    let r = 0, g = 0, b = 0;

    if (wavelength >= 380 && wavelength < 440) {
        r = -(wavelength - 440) / (440 - 380);
        b = 1;
    } else if (wavelength < 490) {
        g = (wavelength - 440) / (490 - 440);
        b = 1;
    } else if (wavelength < 510) {
        g = 1;
        b = -(wavelength - 510) / (510 - 490);
    } else if (wavelength < 580) {
        r = (wavelength - 510) / (580 - 510);
        g = 1;
    } else if (wavelength < 645) {
        r = 1;
        g = -(wavelength - 645) / (645 - 580);
    } else if (wavelength <= 780) {
        r = 1;
    }

    // Fade near vision limits
    let factor = 1;
    if (wavelength < 420) {
        factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
    } else if (wavelength > 700) {
        factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
    }

    r *= factor;
    g *= factor;
    b *= factor;

    return `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
}

// ------------------------------------------------------
// Cauchy dispersion formula: n(λ) ≈ baseIOR + dispersionStrength / λ²
// ------------------------------------------------------
function getIOR(wavelength, baseIOR, dispersionStrength) {
    const lambda = wavelength / 1000; // convert nm to µm
    return baseIOR + dispersionStrength / (lambda * lambda);
}

// ------------------------------------------------------
// Prism geometry (a triangle, but for the drop simulation we use a circle)
// ------------------------------------------------------
const prism = [
    { x: 320, y: 180 },
    { x: 520, y: 300 },
    { x: 320, y: 420 }
];

// Intersection of a ray with a convex polygon (used only for the prism, not for the drop)
function intersectPolygon(origin, dir, vertices) {
    let closestHit = null;
    let minDist = Infinity;

    for (let i = 0; i < vertices.length; i++) {
        const p1 = vertices[i];
        const p2 = vertices[(i + 1) % vertices.length];

        const edge = vec.sub(p2, p1);
        const determinant = dir.x * edge.y - dir.y * edge.x;
        if (Math.abs(determinant) < 0.00001) continue;

        const dx = p1.x - origin.x;
        const dy = p1.y - origin.y;

        const t = (dx * edge.y - dy * edge.x) / determinant;
        const u = (dx * dir.y - dy * dir.x) / determinant;

        if (t > 0.001 && u >= 0 && u <= 1) {
            if (t < minDist) {
                minDist = t;
                let normal = vec.normalize({ x: edge.y, y: -edge.x });
                if (vec.dot(normal, dir) > 0) {
                    normal = vec.mul(normal, -1);
                }
                closestHit = { t, normal };
            }
        }
    }
    return closestHit;
}

/**
 * Renders the dispersive drop simulation:
 * - A circular drop with radius 160
 * - Light rays enter from a direction controlled by the 'angle' slider
 * - Each colour channel (red, orange, yellow, green, blue, violet) uses a slightly different IOR
 * - The rays undergo entry refraction, internal reflection, exit refraction, then continue far off-screen
 */
function drawPrismSimulation() {
    ctxPrism.globalCompositeOperation = 'source-over';
    ctxPrism.clearRect(0, 0, canvasPrism.width, canvasPrism.height);

    const config = {
        angle: parseInt(prismSliders.angle.value, 10) * (Math.PI / 180),
        rayCount: parseInt(prismSliders.ray.value, 10)
    };

    // Drop position and size
    const dropCenter = { x: canvasPrism.width * 0.65, y: canvasPrism.height * 0.35 };
    const dropRadius = 160;

    // Draw the drop outline
    ctxPrism.beginPath();
    ctxPrism.arc(dropCenter.x, dropCenter.y, dropRadius, 0, Math.PI * 2);
    ctxPrism.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctxPrism.fillStyle = 'rgba(74, 144, 226, 0.05)';
    ctxPrism.fill();
    ctxPrism.stroke();

    ctxPrism.globalCompositeOperation = 'screen';
    const alpha = Math.min(1.0, 12.0 / config.rayCount).toFixed(3);

    // Exaggerated IOR values for clear visual dispersion
    const colors = [
        { hex: `rgba(255, 30, 30, ${alpha})`,   ior: 1.315 },
        { hex: `rgba(255, 150, 0, ${alpha})`,   ior: 1.322 },
        { hex: `rgba(255, 255, 0, ${alpha})`,   ior: 1.328 },
        { hex: `rgba(0, 255, 0, ${alpha})`,     ior: 1.335 },
        { hex: `rgba(0, 150, 255, ${alpha})`,   ior: 1.342 },
        { hex: `rgba(150, 0, 255, ${alpha})`,   ior: 1.350 }
    ];

    const lightDir = { x: Math.cos(config.angle), y: Math.sin(config.angle) };
    const lightNormal = { x: lightDir.y, y: -lightDir.x };

    for (let c = 0; c < colors.length; c++) {
        const channel = colors[c];
        ctxPrism.strokeStyle = channel.hex;
        ctxPrism.lineWidth = 1;
        ctxPrism.beginPath();

        for (let i = 0; i < config.rayCount; i++) {
            const t = i / (config.rayCount - 1 || 1);
            const offset = dropRadius * 0.8 + t * dropRadius * 0.35;

            let rayPos = {
                x: dropCenter.x - lightDir.x * 500 + lightNormal.x * offset,
                y: dropCenter.y - lightDir.y * 500 + lightNormal.y * offset
            };
            let rayDir = { x: lightDir.x, y: lightDir.y };

            const t1 = intersectCircle(rayPos, rayDir, dropCenter, dropRadius);
            if (t1) {
                const hit1 = vec.add(rayPos, vec.mul(rayDir, t1));
                ctxPrism.moveTo(rayPos.x, rayPos.y);
                ctxPrism.lineTo(hit1.x, hit1.y);

                const normal1 = vec.normalize(vec.sub(hit1, dropCenter));
                const rDir1 = refract(rayDir, normal1, 1.0 / channel.ior);

                if (rDir1) {
                    const startInside = vec.add(hit1, vec.mul(rDir1, 0.01));
                    const t2 = intersectCircle(startInside, rDir1, dropCenter, dropRadius);
                    if (t2) {
                        const hit2 = vec.add(startInside, vec.mul(rDir1, t2));
                        ctxPrism.lineTo(hit2.x, hit2.y);

                        const normal2 = vec.normalize(vec.sub(dropCenter, hit2));
                        const dotDN = vec.dot(rDir1, normal2);
                        const rDir2 = vec.sub(rDir1, vec.mul(normal2, 2 * dotDN)); // internal reflection

                        const startInside2 = vec.add(hit2, vec.mul(rDir2, 0.01));
                        const t3 = intersectCircle(startInside2, rDir2, dropCenter, dropRadius);
                        if (t3) {
                            const hit3 = vec.add(startInside2, vec.mul(rDir2, t3));
                            ctxPrism.lineTo(hit3.x, hit3.y);

                            const normal3 = vec.normalize(vec.sub(dropCenter, hit3));
                            const rDir3 = refract(rDir2, normal3, channel.ior / 1.0); // exit refraction

                            if (rDir3) {
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

// Update slider labels and redraw
function updatePrismUI() {
    prismSliders.rayVal.textContent = prismSliders.ray.value;
    drawPrismSimulation();
}

['input'].forEach(evt => {
    prismSliders.angle.addEventListener(evt, updatePrismUI);
    prismSliders.ray.addEventListener(evt, updatePrismUI);
});

drawPrismSimulation();