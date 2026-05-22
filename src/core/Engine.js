import * as THREE from 'three';

/**
 * Core rendering engine responsible for the WebGL pipeline, scene management,
 * and the main requestAnimationFrame loop.
 */
export default class Engine {
    /**
     * Initializes the Three.js environment.
     * @param {HTMLCanvasElement} canvas - The target canvas element.
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();

        // Arrays to hold objects that require per-frame updates
        // (e.g., GPGPU managers, dynamic meshes)
        this.updatables = [];

        this._setupCamera();
        this._setupRenderer();
        this._setupEvents();
    }

    _setupCamera() {
        const aspect = window.innerWidth / window.innerHeight;
        // FOV: 45 degrees, Near plane: 0.1, Far plane: 1000
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);

        // Position the camera to look down at the fluid surface
        this.camera.position.set(0, 15, 15);
        this.camera.lookAt(0, 0, 0);
    }

    _setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            // Power preference to hint the browser to use the dedicated GPU if available
            powerPreference: "high-performance"
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Crucial for photorealistic physical rendering
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    _setupEvents() {
        window.addEventListener('resize', this._onWindowResize.bind(this));
    }

    _onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    /**
     * Registers an object to be updated every frame.
     * The object must implement an `update(deltaTime)` method.
     * @param {Object} updatableInstance
     */
    addUpdatable(updatableInstance) {
        if (typeof updatableInstance.update === 'function') {
            this.updatables.push(updatableInstance);
        } else {
            console.warn('Engine: Object added to updatables lacks an update() method.');
        }
    }

    /**
     * Starts the rendering loop.
     */
    start() {
        this.renderer.setAnimationLoop(() => {
            const deltaTime = this.clock.getDelta();

            // Update all registered components (e.g., fluid physics, controls)
            for (const updatable of this.updatables) {
                updatable.update(deltaTime);
            }

            // Render the final scene
            this.renderer.render(this.scene, this.camera);
        });
    }
}