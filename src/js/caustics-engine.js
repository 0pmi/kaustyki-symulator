// Inicjalizacja sceny Three.js
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('three-container');

    if (!container) {
        console.error("Nie znaleziono kontenera #three-container!");
        return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });



    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Oświetlenie
    const ambientLight = new THREE.AmbientLight(0x404040); // Słabe światło otoczenia
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // Dno basenu
    const geometry = new THREE.PlaneGeometry(10, 10);
    const material = new THREE.MeshStandardMaterial({ color: 0x4a90e2, side: THREE.DoubleSide });
    const poolFloor = new THREE.Mesh(geometry, material);
    poolFloor.rotation.x = -Math.PI / 2;
    scene.add(poolFloor);

    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0);

    // Pętla animacji
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();
});