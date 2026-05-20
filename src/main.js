import './style.css'

// 1. DOM Elements Initialization
const canvas = document.getElementById('optics-canvas');
const ctx = canvas.getContext('2d');
const raySlider = document.getElementById('ray-count');
const rayVal = document.getElementById('ray-count-val');
const iorSlider = document.getElementById('ior');
const iorVal = document.getElementById('ior-val');

// 2. Application State
let config = {
    rayCount: parseInt(raySlider.value, 10),
    ior: parseFloat(iorSlider.value)
};

// 3. Main Render Loop
function draw() {
    // Clear the canvas for the next frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Define the central optical boundary (e.g., a glass sphere)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 150;

    // Draw the boundary
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#4a90e2';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Render debug/info text inside the canvas
    ctx.fillStyle = '#666';
    ctx.font = '14px sans-serif';
    ctx.fillText(`Rendering object with IOR: ${config.ior}`, 20, 30);
    ctx.fillText(`Rays emitted: ${config.rayCount}`, 20, 50);

    // TODO: Implement raycasting and refraction physics here
}

// 4. Event Listeners for real-time updates
raySlider.addEventListener('input', (e) => {
    config.rayCount = parseInt(e.target.value, 10);
    rayVal.textContent = config.rayCount;
    draw(); // Trigger re-render
});

iorSlider.addEventListener('input', (e) => {
    config.ior = parseFloat(e.target.value);
    iorVal.textContent = config.ior.toFixed(2);
    draw(); // Trigger re-render
});

// 5. Initial render call
draw();