/**
 * @fileoverview Simulates Snell's Law (light refraction across a planar boundary)
 * and Total Internal Reflection (TIR).
 */

export function initSnellSimulation() {
    const canvasSnell = document.getElementById('canvas-snell');
    if (!canvasSnell) return;

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
     * Main render loop. Draws the mediums, incident ray, refracted ray,
     * and handles internal reflection states.
     */
    function drawSnellSimulation() {
        ctxSnell.clearRect(0, 0, canvasSnell.width, canvasSnell.height);

        // Safely retrieve configuration values with fallbacks
        const config = {
            angle: parseInt(snellSliders.angle?.value || 30, 10),
            ior1: parseFloat(snellSliders.ior1?.value || 1.0),
            ior2: parseFloat(snellSliders.ior2?.value || 1.5)
        };

        const cw = canvasSnell.width;
        const ch = canvasSnell.height;
        const cx = cw / 2;
        const cy = ch / 2;

        // Render optical mediums with IOR-dependent shading
        ctxSnell.fillStyle = `rgba(74, 144, 226, ${0.05 + config.ior1 * 0.05})`;
        ctxSnell.fillRect(0, 0, cw, cy);
        ctxSnell.fillStyle = `rgba(46, 204, 113, ${0.05 + config.ior2 * 0.05})`;
        ctxSnell.fillRect(0, cy, cw, cy);

        // Medium boundary
        ctxSnell.beginPath();
        ctxSnell.moveTo(0, cy);
        ctxSnell.lineTo(cw, cy);
        ctxSnell.strokeStyle = '#555';
        ctxSnell.lineWidth = 2;
        ctxSnell.stroke();

        // Surface normal (dashed)
        ctxSnell.beginPath();
        ctxSnell.setLineDash([5, 5]);
        ctxSnell.moveTo(cx, 50);
        ctxSnell.lineTo(cx, ch - 50);
        ctxSnell.strokeStyle = '#888';
        ctxSnell.lineWidth = 1;
        ctxSnell.stroke();
        ctxSnell.setLineDash([]);

        const theta1Rad = config.angle * (Math.PI / 180);
        const sinTheta2 = (config.ior1 / config.ior2) * Math.sin(theta1Rad);

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

        // Evaluate Total Internal Reflection (TIR) condition
        if (Math.abs(sinTheta2) <= 1.0) {
            // Standard refraction
            const theta2Rad = Math.asin(sinTheta2);
            const refractEndX = cx + 400 * Math.sin(theta2Rad);
            const refractEndY = cy + 400 * Math.cos(theta2Rad);

            ctxSnell.beginPath();
            ctxSnell.moveTo(cx, cy);
            ctxSnell.lineTo(refractEndX, refractEndY);
            ctxSnell.strokeStyle = 'rgba(255, 50, 50, 0.8)';
            ctxSnell.lineWidth = 3;
            ctxSnell.stroke();

            // Partial reflection
            const reflectEndX = cx + 400 * Math.sin(theta1Rad);
            const reflectEndY = cy - 400 * Math.cos(theta1Rad);
            ctxSnell.beginPath();
            ctxSnell.moveTo(cx, cy);
            ctxSnell.lineTo(reflectEndX, reflectEndY);
            ctxSnell.strokeStyle = 'rgba(255, 50, 50, 0.15)';
            ctxSnell.lineWidth = 1;
            ctxSnell.stroke();
        } else {
            // Total Internal Reflection (highlighted)
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

    function updateSnellUI() {
        if (snellSliders.angleVal) snellSliders.angleVal.textContent = snellSliders.angle.value;
        if (snellSliders.ior1Val) snellSliders.ior1Val.textContent = parseFloat(snellSliders.ior1.value).toFixed(2);
        if (snellSliders.ior2Val) snellSliders.ior2Val.textContent = parseFloat(snellSliders.ior2.value).toFixed(2);
        drawSnellSimulation();
    }

    ['input'].forEach(evt => {
        snellSliders.angle?.addEventListener(evt, updateSnellUI);
        snellSliders.ior1?.addEventListener(evt, updateSnellUI);
        snellSliders.ior2?.addEventListener(evt, updateSnellUI);
    });

    drawSnellSimulation();
}