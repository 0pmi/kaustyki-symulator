import * as THREE from 'three';
import Engine from './Engine.js';
import GPGPUManager from '../physics/GPGPUManager.js';
import WaterMesh from '../graphics/WaterMesh.js';
import Environment from '../graphics/Environment.js';

/**
 * High-level orchestrator that connects the WebGL engine, the GPGPU physics pipeline,
 * and the scene graphics meshes. Handles user input routing for the 3D environment.
 */
export default class SimulationApp {
    /**
     * @param {HTMLDivElement} container - The DOM element hosting the 3D viewport.
     */
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.container.appendChild(this.canvas);

        this.engine = new Engine(this.canvas);

        this._initPipeline();
        this._initResizeHandler();
        this._initInteractions();
        this._triggerInitialRipples();
    }

    _initPipeline() {
        const gpgpuResolution = 512;
        this.gpgpu = new GPGPUManager(this.engine.renderer, gpgpuResolution);
        this.water = new WaterMesh(10, gpgpuResolution);

        this.environment = new Environment(this.engine.scene, 10);

        this.engine.scene.add(this.water.getMesh());

        // Bind the simulation and rendering loop updates
        this.engine.addUpdatable({
            update: () => {
                this.gpgpu.update();
                this.water.updateTextures(this.gpgpu.getHeightTexture(), this.gpgpu.getNormalTexture());
            }
        });
    }

    _initResizeHandler() {
        const resize = () => {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            this.engine.camera.aspect = width / height;
            this.engine.camera.updateProjectionMatrix();
            this.engine.renderer.setSize(width, height);
        };

        resize();
        window.addEventListener('resize', resize);
    }

    _initInteractions() {
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.isPointerDown = false;

        const handlePointer = (event) => {
            const rect = this.container.getBoundingClientRect();
            this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.pointer, this.engine.camera);
            const intersects = this.raycaster.intersectObject(this.water.getMesh());

            if (intersects.length > 0 && (this.isPointerDown || event.type === 'pointerdown')) {
                const hit = intersects[0];
                if (hit.uv) {
                    const dropRadius = 0.03;
                    const dropStrength = 0.15;
                    this.gpgpu.addDrop(hit.uv.x, hit.uv.y, dropRadius, dropStrength);
                }
            }
        };

        this.container.addEventListener('pointerdown', (e) => {
            this.isPointerDown = true;
            handlePointer(e);
        });

        this.container.addEventListener('pointermove', handlePointer);

        window.addEventListener('pointerup', () => {
            this.isPointerDown = false;
        });
    }

    _triggerInitialRipples() {
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                this.gpgpu.addDrop(Math.random(), Math.random(), 0.04, 0.2);
            }, i * 200);
        }
    }

    /**
     * Starts the execution of the rendering and physics loop.
     */
    start() {
        this.engine.start();
    }
}