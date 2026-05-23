import * as THREE from 'three';
import Engine from './Engine.js';
import GPGPUManager from '../physics/GPGPUManager.js';
import WaterMesh from '../graphics/WaterMesh.js';
import Environment from '../graphics/Environment.js';
import GUI from 'lil-gui';

/**
 * High-level orchestrator connecting the physical pipelines with graphic asset pipelines.
 */
export default class SimulationApp {
    /**
     * @param {HTMLDivElement} container
     */
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.container.appendChild(this.canvas);

        this.engine = new Engine(this.canvas);

        this._initPipeline();
        this._initResizeHandler();
        this._initInteractions();
        this._initGUI();
        this._triggerInitialRipples();
    }

    _initPipeline() {
        const gpgpuResolution = 512;
        this.gpgpu = new GPGPUManager(this.engine.renderer, gpgpuResolution);
        this.water = new WaterMesh(10, gpgpuResolution);

        // Instantiate environment passing both scene and core renderer context
        this.environment = new Environment(this.engine.scene, this.engine.renderer, 10);

        this.engine.scene.add(this.water.getMesh());

        this.engine.addUpdatable({
            update: () => {
                this.gpgpu.update();
                this.water.updateTextures(this.gpgpu.getHeightTexture(), this.gpgpu.getNormalTexture());

                // Inject environmental textures to the shader once loaded asynchronously
                if (this.environment.diffuseMap && this.environment.hdrTexture) {
                    this.water.material.uniforms.tTiles.value = this.environment.diffuseMap;
                    this.water.material.uniforms.tSky.value = this.environment.hdrTexture;
                }
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

        // Performs the raycast and injects forces into the GPGPU simulation
        const castWater = (event, radius, strength) => {
            const rect = this.container.getBoundingClientRect();
            this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.pointer, this.engine.camera);
            const intersects = this.raycaster.intersectObject(this.water.getMesh());

            if (intersects.length > 0) {
                const hit = intersects[0];
                if (hit.uv) {
                    this.gpgpu.addDrop(hit.uv.x, hit.uv.y, radius, strength);
                }
            }
        };

        // Gentle wake on hover (works concurrently with camera dragging)
        this.container.addEventListener('pointermove', (e) => {
            castWater(e, 0.02, 0.02);
        });

        // Large splash on explicit click
        this.container.addEventListener('pointerdown', (e) => {
            castWater(e, 0.04, 0.1);
        });
    }

    _triggerInitialRipples() {
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                this.gpgpu.addDrop(Math.random(), Math.random(), 0.04, 0.02);
            }, i * 200);
        }
    }
    _initGUI() {
        this.gui = new GUI({ title: 'Physics Simulation Parameters' });

        // Define default state
        const physicsParams = {
            ior: 1.333,
            reflectivity: 0.1,
            absorptionR: 0.8,
            absorptionG: 0.2,
            absorptionB: 0.1
        };

        const opticsFolder = this.gui.addFolder('Optical Properties');

        // When sliding IOR, observe how the "weird angle" Snell's window changes
        opticsFolder.add(physicsParams, 'ior', 1.0, 1.6).name('Index of Refraction').onChange((val) => {
            if (this.water && this.water.material) {
                this.water.material.uniforms.ior.value = val;
            }
        });

        opticsFolder.add(physicsParams, 'reflectivity', 0.0, 1.0).name('Sky Reflectivity').onChange((val) => {
            if (this.water && this.water.material) {
                this.water.material.uniforms.reflectivity.value = val;
            }
        });

        // Add volumetric fluid absorption controllers
        const updateAttenuation = () => {
            if (this.water && this.water.material) {
                this.water.material.uniforms.waterAttenuation.value.set(
                    physicsParams.absorptionR,
                    physicsParams.absorptionG,
                    physicsParams.absorptionB
                );
            }
        };

        const volFolder = this.gui.addFolder('Volumetric Absorption');
        volFolder.add(physicsParams, 'absorptionR', 0.0, 2.0).name('Red Absorb').onChange(updateAttenuation);
        volFolder.add(physicsParams, 'absorptionG', 0.0, 2.0).name('Green Absorb').onChange(updateAttenuation);
        volFolder.add(physicsParams, 'absorptionB', 0.0, 2.0).name('Blue Absorb').onChange(updateAttenuation);
    }

    start() {
        this.engine.start();
    }
}