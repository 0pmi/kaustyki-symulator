/**
 * @fileoverview Simulates the exact energy distribution of a light ray
 * undergoing multiple internal reflections inside a spherical water droplet.
 * Computes Fresnel equations to accurately demonstrate energy loss at each optical boundary,
 * effectively disproving the Total Internal Reflection (TIR) myth for primary rainbows.
 */

export function initFresnelSimulation(i18n) {
    const t = (key) => i18n ? i18n.t(key) : key;
    // ---------------------------------------------------------
    // DOM Element Initialization & Safety Checks
    // ---------------------------------------------------------
    const canvas = document.getElementById('canvas-fresnel');
    const angleSlider = document.getElementById('fresnel-angle');

    // Abort initialization if core interactive elements are missing from the DOM
    if (!canvas || !angleSlider) return;

    const ctx = canvas.getContext('2d');

    // Setup fallback for the table body element to ensure dynamic data can be rendered
    let tableBody = document.querySelector('#fresnel-table tbody');
    if (!tableBody) {
        const table = document.getElementById('fresnel-table');
        if (table) {
            tableBody = document.createElement('tbody');
            table.appendChild(tableBody);
        }
    }

    // ---------------------------------------------------------
    // Physical Constants & State Variables
    // ---------------------------------------------------------
    const N_AIR = 1.0;

    /** * Tracks the currently selected wavelength mode ('white', 'red', 'violet').
     * @type {string}
     */
    let currentWavelength = 'white';

    // ---------------------------------------------------------
    // Mathematical Utilities (2D Vector Operations)
    // ---------------------------------------------------------
    const vec2 = {
        add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
        sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
        mul: (v, s) => ({ x: v.x * s, y: v.y * s }),
        dot: (a, b) => a.x * b.x + a.y * b.y,
        len: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
        normalize: (v) => {
            const l = vec2.len(v);
            return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
        },

        /**
         * Computes the reflection vector.
         * Formula: R = I - 2(I \cdot N)N
         * @param {Object} i - The normalized incident vector.
         * @param {Object} n - The normalized surface normal vector.
         * @returns {Object} The normalized reflected vector.
         */
        reflect: (i, n) => vec2.sub(i, vec2.mul(n, 2 * vec2.dot(i, n))),

        /**
         * Computes the refraction vector using Snell's Law in vector form.
         * Automatically handles normal inversion when rays hit the boundary from the inside.
         * @param {Object} i - The normalized incident vector.
         * @param {Object} n - The normalized surface normal vector.
         * @param {number} eta - The ratio of indices of refraction (n1 / n2).
         * @returns {Object|null} The normalized refracted vector, or null if TIR occurs.
         */
        refract: (i, n, eta) => {
            let cosI = -vec2.dot(n, i);
            let normal = n;

            // Invert the normal if the ray is originating from inside the medium
            if (cosI < 0) {
                cosI = -cosI;
                normal = vec2.mul(n, -1);
            }

            const sinT2 = eta * eta * (1.0 - cosI * cosI);

            // Total Internal Reflection (TIR) condition
            if (sinT2 > 1.0) return null;

            const cosT = Math.sqrt(1.0 - sinT2);
            return vec2.add(vec2.mul(i, eta), vec2.mul(normal, eta * cosI - cosT));
        }
    };

    /**
     * Calculates the Reflectance (R) and Transmittance (T) coefficients using Fresnel equations.
     * Assumes unpolarized light by averaging the s-polarized and p-polarized reflectance.
     * * @param {number} n1 - Refractive index of the incident medium.
     * @param {number} n2 - Refractive index of the transmitting medium.
     * @param {number} thetaI - Angle of incidence in radians.
     * @returns {Object} An object containing R, T, and the angle of transmission (thetaT).
     */
    function getFresnel(n1, n2, thetaI) {
        // Safeguard against floating-point precision issues at grazing incidence (exactly 90 degrees)
        if (Math.abs(thetaI - Math.PI / 2) < 1e-5) {
            return { R: 1.0, T: 0.0, thetaT: 0 };
        }

        const sinI = Math.sin(thetaI);
        const sinT = (n1 / n2) * sinI;

        // Total Internal Reflection check
        if (sinT >= 1.0) return { R: 1.0, T: 0.0, thetaT: 0 };

        const thetaT = Math.asin(sinT);
        const cosI = Math.cos(thetaI);
        const cosT = Math.cos(thetaT);

        // Fresnel equations for s-polarized and p-polarized light
        const Rs = Math.pow((n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT), 2);
        const Rp = Math.pow((n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI), 2);

        // Average reflectance for unpolarized light
        const R = (Rs + Rp) / 2;

        return { R: R, T: 1.0 - R, thetaT: thetaT };
    }

    /**
     * Computes the precise intersection point between a 2D ray and a circle.
     * Utilized to find where the light strikes the back wall of the spherical droplet.
     * * @param {Object} origin - The starting point of the ray {x, y}.
     * @param {Object} dir - The normalized direction vector of the ray.
     * @param {Object} center - The center coordinates of the circle.
     * @param {number} radius - The radius of the circle.
     * @returns {Object|null} The intersection coordinate {x, y}, or null if no hit occurs.
     */
    function rayCircleHit(origin, dir, center, radius) {
        const L = vec2.sub(origin, center);
        const a = vec2.dot(dir, dir);
        const b = 2 * vec2.dot(dir, L);
        const c = vec2.dot(L, L) - radius * radius;
        const delta = b * b - 4 * a * c;

        if (delta < 0) return null;

        const t1 = (-b - Math.sqrt(delta)) / (2 * a);
        const t2 = (-b + Math.sqrt(delta)) / (2 * a);

        // Return the first valid intersection situated in front of the ray's origin
        // A small epsilon (1e-4) is used to prevent self-intersection floating point errors
        if (t1 > 1e-4) return vec2.add(origin, vec2.mul(dir, t1));
        if (t2 > 1e-4) return vec2.add(origin, vec2.mul(dir, t2));

        return null;
    }

    // ---------------------------------------------------------
    // Rendering Utilities
    // ---------------------------------------------------------

    /**
     * Renders a line segment mapping a light ray on the HTML canvas.
     * Line thickness and opacity scale dynamically with the ray's energy level.
     * * @param {Object} start - Ray origin coordinate.
     * @param {Object} end - Ray termination coordinate.
     * @param {number} energy - Fractional energy level (0.0 to 1.0).
     * @param {string} color - RGB color string (e.g., '255, 255, 255').
     */
    function drawRay(start, end, energy, color) {
        // Clamp variables to ensure even the faintest rays remain visually perceptible
        const thickness = Math.max(1.5, energy * 8);
        const alpha = Math.max(0.3, Math.min(1.0, energy * 3));

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = `rgba(${color}, ${alpha})`;
        ctx.lineWidth = thickness;
        ctx.stroke();
    }

    /**
     * Renders text labels positioned at a fixed offset vector from a collision point.
     * Implements a black outline with a white fill to guarantee high contrast against any background.
     * * @param {Object} origin - The reference coordinate.
     * @param {Object} direction - The normalized vector determining the label's spatial offset.
     * @param {string} text - The string to display.
     * @param {number} [offset=45] - Scalar distance from the origin.
     */
    function drawLabel(origin, direction, text, offset = 45) {
        const posX = origin.x + direction.x * offset;
        const posY = origin.y + direction.y * offset;

        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Render high-contrast outline (stroke)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 3;
        ctx.strokeText(text, posX, posY);

        // Render inner text fill
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
        ctx.fillText(text, posX, posY);
    }

    // ---------------------------------------------------------
    // Core Simulation Engine
    // ---------------------------------------------------------

    /**
     * Executes the main physics simulation and updates both the canvas and the data table.
     * Triggered on initialization and whenever user inputs change.
     */
    function updateSimulation() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Define droplet geometry; center is slightly offset to accommodate UI labels
        const cx = canvas.width / 2 + 50;
        const cy = canvas.height / 2;
        const radius = 180;

        // Retrieve and convert the incidence angle from the UI slider
        const incidenceAngleDeg = parseFloat(angleSlider.value) || 0;
        const thetaI = incidenceAngleDeg * (Math.PI / 180);

        // Render the spherical droplet boundary
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(74, 144, 226, 0.8)';
        ctx.fillStyle = 'rgba(74, 144, 226, 0.05)';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Calculate the initial entry coordinate (P0) mapping to the incidence angle
        const p0 = { x: cx - radius * Math.cos(thetaI), y: cy - radius * Math.sin(thetaI) };
        const incomingDir = { x: 1, y: 0 };
        const n0 = vec2.normalize(vec2.sub(p0, { x: cx, y: cy }));

        // --- DYNAMIC OPTICAL CONFIGURATION BASED ON WAVELENGTH ---
        let N_WATER = 1.333;
        let C_IN = '255, 255, 255';
        let C_STAY = '100, 200, 255';
        let C_EXIT = '255, 200, 50';
        let C_REFL = '255, 100, 100';

        if (currentWavelength === 'red') {
            N_WATER = 1.331;
            C_IN = '255, 100, 100';
            C_STAY = '255, 50, 50';
            C_EXIT = '255, 150, 100';
            C_REFL = '255, 80, 80';
        } else if (currentWavelength === 'violet') {
            N_WATER = 1.344;
            C_IN = '200, 150, 255';
            C_STAY = '150, 50, 255';
            C_EXIT = '220, 100, 255';
            C_REFL = '180, 80, 255';
        }

        // Draw external incident solar ray
        drawRay({ x: p0.x - 300, y: p0.y }, p0, 1.0, C_IN);

        // Calculate Fresnel split at the initial Air -> Water boundary
        let opticsEntry = getFresnel(N_AIR, N_WATER, Math.abs(thetaI));

        const tableData = [];
        tableData.push({
            name: t('fresnelTable.entry'),
            energyIn: 1.0,
            refl: opticsEntry.R,
            trans: opticsEntry.T,
            internalAngle: "-"
        });

        // Compute and render the initial external reflection (Glare)
        const extReflectDir = vec2.reflect(incomingDir, n0);
        drawRay(p0, vec2.add(p0, vec2.mul(extReflectDir, 80)), opticsEntry.R, C_REFL);
        drawLabel(p0, extReflectDir, `R: ${(opticsEntry.R * 100).toFixed(2)}%`, 50);

        // Terminate early if incidence is parallel to the boundary (Grazing incidence)
        if (opticsEntry.T <= 0.0001) {
            renderTable(tableData);
            return;
        }

        // Compute the initial refracted vector penetrating the droplet
        let currentDir = vec2.refract(incomingDir, n0, N_AIR / N_WATER);
        if (!currentDir) {
            renderTable(tableData);
            return;
        }

        let currentP = p0;
        let currentEnergy = opticsEntry.T;

        const hitNames = t('fresnelTable.hits');

        // Simulate subsequent internal propagation bounces
        for (let i = 0; i < 3; i++) {
            // Determine the next collision coordinate along the spherical boundary
            const nextP = rayCircleHit(currentP, currentDir, { x: cx, y: cy }, radius);
            if (!nextP) break;

            // Render the internal transmitted ray
            drawRay(currentP, nextP, currentEnergy, C_STAY);

            // Calculate the geometric normal at the new collision point
            const nHit = vec2.normalize(vec2.sub(nextP, { x: cx, y: cy }));

            // Determine the exact internal angle of incidence for educational proof
            let cosInternal = vec2.dot(currentDir, nHit);
            // Clamp dot product to [-1, 1] to prevent NaN resulting from FP precision errors
            cosInternal = Math.max(-1.0, Math.min(1.0, cosInternal));
            let thetaI_internal = Math.acos(cosInternal);

            // Evaluate Fresnel coefficients for the Water -> Air boundary
            let optics = getFresnel(N_WATER, N_AIR, thetaI_internal);

            // Compute the absolute global energy remnants relative to the original 100% solar input
            const exitEnergyGlobal = currentEnergy * optics.T;
            const reflectEnergyGlobal = currentEnergy * optics.R;

            tableData.push({
                name: hitNames[i],
                energyIn: currentEnergy,
                refl: reflectEnergyGlobal,
                trans: exitEnergyGlobal,
                internalAngle: (thetaI_internal * 180 / Math.PI).toFixed(2) + "°"
            });

            // 1. Process the escaping refracted ray (Calculates localized T)
            const exitDir = vec2.refract(currentDir, nHit, N_WATER / N_AIR);
            if (exitDir) {
                // The visual thickness represents the absolute remaining energy leaving the droplet
                drawRay(nextP, vec2.add(nextP, vec2.mul(exitDir, 180)), exitEnergyGlobal, C_EXIT);

                // The text label displays the localized ratio, proving TIR never occurs
                drawLabel(nextP, exitDir, `T: ${(optics.T * 100).toFixed(2)}%`, 50);
            }

            // 2. Process the subsequent internally reflected ray (Calculates localized R)
            const nextInternalDir = vec2.reflect(currentDir, nHit);
            drawLabel(nextP, nextInternalDir, `R: ${(optics.R * 100).toFixed(2)}%`, 45);

            // Propagate state variables for the next simulation iteration
            currentDir = nextInternalDir;
            currentP = nextP;
            currentEnergy = reflectEnergyGlobal;
        }

        renderTable(tableData);
    }

    /**
     * Parses the simulation array and renders the HTML data table.
     * * @param {Array<Object>} tableData - Structured data resulting from the physics loop.
     */
    function renderTable(tableData) {
        if (!tableBody) return;
        tableBody.innerHTML = "";

        tableData.forEach(row => {
            const tr = document.createElement('tr');

            // Format internal angle display, rendering blank for the external entry point
            const angleDisplay = row.internalAngle ? `(${t('fresnelTable.internalAngle')} ${row.internalAngle})` : "";

            // Rendering values utilizing 3 decimal places to expose microscopic dispersion differences
            tr.innerHTML = `
                <td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <strong>${row.name}</strong> <br>
                    <span style="font-size: 0.8em; color: #aaa;">${angleDisplay}</span>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: bold;">
                    ${(row.energyIn * 100).toFixed(3)}%
                </td>
                <td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); color: #96c8ff;">
                    ${(row.refl * 100).toFixed(3)}%
                </td>
                <td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); color: #ffb432;">
                    ${(row.trans * 100).toFixed(3)}%
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // ---------------------------------------------------------
    // Event Listeners Initialization
    // ---------------------------------------------------------

    // Attach event listeners to the wavelength radio buttons
    const waveRadios = document.querySelectorAll('input[name="fresnel-wave"]');
    waveRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentWavelength = e.target.value;
            updateSimulation();
        });
    });

    // Attach event listener to the incidence angle slider
    angleSlider.addEventListener('input', () => {
        const angleVal = document.getElementById('fresnel-angle-val');
        if (angleVal) angleVal.textContent = `${angleSlider.value}°`;
        updateSimulation();
    });

    window.addEventListener('languageChanged', () => {
        updateSimulation();
    });

    // Trigger initial render immediately upon load to populate the canvas
    updateSimulation();
}