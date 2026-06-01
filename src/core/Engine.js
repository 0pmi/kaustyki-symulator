import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {Timer} from "three";

/**
 * Core rendering engine responsible for the WebGL pipeline, scene management,
 * and the main requestAnimationFrame loop. Includes an active performance watchdog.
 */
export default class Engine {
    /**
     * Initializes the Three.js environment.
     * @param {HTMLCanvasElement} canvas - The target canvas element.
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        this.timer = new Timer();

        this.updatables = [];

        // Performance Watchdog Configuration
        this.onPerformanceCrash = null; // Callback for SimulationApp
        this.frameCount = 0;
        this.consecutiveSlowFrames = 0;
        this.maxSlowFrames = 5; // Tolerance threshold
        this.watchdogActive = true;

        this._setupCamera();
        this._setupRenderer();
        this._setupControls();
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

        // Enable computation of shadow maps
        this.renderer.shadowMap.enabled = true;

        // Utilize Percentage-Closer Filtering with soft edges for realistic sun shadows
        this.renderer.shadowMap.type = THREE.PCFShadowMap;

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Crucial for photorealistic physical rendering
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    _setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 30;
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
     * Halts the rendering loop unconditionally.
     */
    stop() {
        this.renderer.setAnimationLoop(null);
        this.watchdogActive = false;
    }

    /**
     * Starts the rendering loop with active hardware monitoring.
     */
    start() {
        this.renderer.setAnimationLoop(() => {
            this.timer.update();
            const deltaTime = this.timer.getDelta();

            // ==============================================================
            // PERFORMANCE WATCHDOG (Hardware Overload Prevention)
            // ==============================================================
            if (this.watchdogActive && this.frameCount > 10 && !document.hidden) {
                // If a frame takes between 200ms (5 FPS) and 1000ms.
                // >1000ms is ignored as it usually means the browser tab was backgrounded.
                if (deltaTime > 0.2 && deltaTime < 1.0) {
                    this.consecutiveSlowFrames++;
                    if (this.consecutiveSlowFrames >= this.maxSlowFrames) {
                        console.error("Hardware overload detected. Halting simulation.");
                        this.stop();
                        if (this.onPerformanceCrash) {
                            this.onPerformanceCrash();
                        }
                        return; // Abort this frame
                    }
                } else {
                    // Frame was rendered in time, reset the tolerance counter
                    this.consecutiveSlowFrames = 0;
                }
            }
            this.frameCount++;

            this.controls.update();

            // Update all registered components (e.g., fluid physics, controls)
            for (const updatable of this.updatables) {
                updatable.update(deltaTime);
            }

            // Render the final scene
            this.renderer.render(this.scene, this.camera);
        });
    }
}