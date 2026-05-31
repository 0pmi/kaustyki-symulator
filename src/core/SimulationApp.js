import * as THREE from "three";
import Engine from "./Engine.js";
import GPGPUManager from "../physics/GPGPUManager.js";
import WaterMesh from "../graphics/WaterMesh.js";
import Environment from "../graphics/Environment.js";
import GUI from 'lil-gui';
import CausticsGenerator from "../graphics/CausticsGenerator.js";
import SphereMesh from "../graphics/SphereMesh.js";

/**
 * High-level orchestrator responsible for synchronizing the physical
 * simulation pipelines with the graphic asset rendering pipelines.
 */
export default class SimulationApp {
    /**
     * @param {HTMLDivElement} container - DOM element to host the canvas.
     * @param {Object} i18n - Localization instance for GUI translations.
     */
    constructor(container, i18n) {
        this.container = container;
        this.i18n = i18n;
        this.canvas = document.createElement('canvas');
        this.container.appendChild(this.canvas);

        this.engine = new Engine(this.canvas);

        // Global environmental dimensions
        this.poolSize = 10.0;
        this.poolDepth = 4.0;
        this.isPaused = false;

        // 3D vector physics state for the interactive sphere
        this.spherePhysics = {
            isDragging: false,
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
            gravityEnabled: true
        };
        this.lastDragPos = null;

        this._initPipeline();
        this._initResizeHandler();
        this._initInteractions();
        this._initGUI();
        this._triggerInitialRipples();
    }

    /**
     * Initializes all core rendering and simulation subsystems, establishing
     * the primary update loop that binds physics to graphics.
     * @private
     */
    _initPipeline() {
        // GPGPU Resolution directly correlates to the fidelity of the wave simulation.
        // 256 offers a highly optimized balance for web platforms.
        const gpgpuResolution = 256;

        this.gpgpu = new GPGPUManager(this.engine.renderer, gpgpuResolution);
        this.water = new WaterMesh(this.poolSize, gpgpuResolution);
        this.environment = new Environment(this.engine.scene, this.engine.renderer, this.poolSize, this.poolDepth);
        this.caustics = new CausticsGenerator(this.engine.renderer, this.poolSize, 512);

        this.sphere = new SphereMesh(0.8);

        this.engine.scene.add(this.sphere.getMesh());
        this.engine.scene.add(this.water.getMesh());

        // Tracks the sphere's previous position to calculate displacement vectors for the fluid solver
        this.oldBallPos = new THREE.Vector3(0, 100, 0);

        this.engine.addUpdatable({
            update: (deltaTime) => {
                deltaTime = Math.min(deltaTime, 0.05);
                const radius = this.sphere ? this.sphere.radius : 0.8;
                const halfSize = this.poolSize * 0.5;
                const poolDepth = this.poolDepth;
                const floorY = -poolDepth;

                // Process physical interactions only if the simulation is active
                if (!this.isPaused) {

                    // Calculate instantaneous velocity via numerical differentiation while the user drags the sphere.
                    // This preserves momentum allowing the user to "throw" the object upon release.
                    if (this.sphere && this.spherePhysics.isDragging) {
                        const currentPos = this.sphere.getPosition();
                        if (!this.lastDragPos) {
                            this.lastDragPos = currentPos.clone();
                        }

                        this.spherePhysics.velocityX = (currentPos.x - this.lastDragPos.x) / Math.max(0.0001, deltaTime);
                        this.spherePhysics.velocityY = (currentPos.y - this.lastDragPos.y) / Math.max(0.0001, deltaTime);
                        this.spherePhysics.velocityZ = (currentPos.z - this.lastDragPos.z) / Math.max(0.0001, deltaTime);

                        // Clamp drag velocity to prevent physics explosions when moving the mouse too erratically
                        const currentSpeed = Math.sqrt(
                            this.spherePhysics.velocityX ** 2 +
                            this.spherePhysics.velocityY ** 2 +
                            this.spherePhysics.velocityZ ** 2
                        );
                        const maxSpeed = 15.0;

                        if (currentSpeed > maxSpeed) {
                            const scale = maxSpeed / currentSpeed;
                            this.spherePhysics.velocityX *= scale;
                            this.spherePhysics.velocityY *= scale;
                            this.spherePhysics.velocityZ *= scale;
                        }
                        this.lastDragPos.copy(currentPos);
                    }

                    // Apply rigid-body dynamics: Gravity, linear Archimedes' buoyancy, and fluid drag
                    if (this.sphere && !this.spherePhysics.isDragging && this.spherePhysics.gravityEnabled) {
                        const gravity = -9.81;
                        let buoyancy = 0;
                        let dragY = 0;
                        let dragXZ = 0;

                        const depth = 0.0 - this.sphere.getPosition().y;

                        // Submersion check
                        if (depth > -radius) {
                            const buoyancyFactor = this._sphereParams && this._sphereParams.buoyancy !== undefined ? this._sphereParams.buoyancy : 20.0;
                            // Linear approximation of submerged volume for buoyancy
                            buoyancy = Math.max(0, depth + radius) * buoyancyFactor;
                            dragY = this.spherePhysics.velocityY * -3.0;
                            dragXZ = -2.0;
                        }

                        const accelerationY = gravity + buoyancy + dragY;
                        this.spherePhysics.velocityY += accelerationY * deltaTime;

                        // Apply lateral hydrodynamic drag
                        if (depth > -radius) {
                            this.spherePhysics.velocityX += this.spherePhysics.velocityX * dragXZ * deltaTime;
                            this.spherePhysics.velocityZ += this.spherePhysics.velocityZ * dragXZ * deltaTime;
                        }

                        // Integrate velocity into position
                        this.sphere.getPosition().x += this.spherePhysics.velocityX * deltaTime;
                        this.sphere.getPosition().y += this.spherePhysics.velocityY * deltaTime;
                        this.sphere.getPosition().z += this.spherePhysics.velocityZ * deltaTime;

                        // Resolve collisions with pool boundaries (elastic bounds)
                        const bounceElasticity = 0.5;
                        const ballPos = this.sphere.getPosition();

                        if (ballPos.x < -halfSize + radius) {
                            ballPos.x = -halfSize + radius;
                            this.spherePhysics.velocityX *= -bounceElasticity;
                        } else if (ballPos.x > halfSize - radius) {
                            ballPos.x = halfSize - radius;
                            this.spherePhysics.velocityX *= -bounceElasticity;
                        }

                        if (ballPos.z < -halfSize + radius) {
                            ballPos.z = -halfSize + radius;
                            this.spherePhysics.velocityZ *= -bounceElasticity;
                        } else if (ballPos.z > halfSize - radius) {
                            ballPos.z = halfSize - radius;
                            this.spherePhysics.velocityZ *= -bounceElasticity;
                        }

                        if (ballPos.y < floorY + radius) {
                            ballPos.y = floorY + radius;
                            this.spherePhysics.velocityY *= -0.25;
                            this.spherePhysics.velocityX *= 0.7;
                            this.spherePhysics.velocityZ *= 0.7;
                        }
                    }

                    const ballPos = this.sphere ? this.sphere.getPosition() : new THREE.Vector3(0, 100, 0);

                    // Feed the displacement coordinates to the GPGPU fluid solver
                    if (this.gpgpu.updateMaterial) {
                        if (!this.gpgpu.updateMaterial.uniforms.oldSphereCenter) {
                            this.gpgpu.updateMaterial.uniforms.oldSphereCenter = { value: new THREE.Vector3() };
                        }
                        this.gpgpu.updateMaterial.uniforms.oldSphereCenter.value.copy(this.oldBallPos);
                    }

                    // To lessen the wave impact amplitude of the sphere, multiply radius here (e.g., radius * 0.5)
                    this.gpgpu.update(ballPos, radius);
                    this.oldBallPos.copy(ballPos);

                } else {
                    // Safety lock: Keep tracking the position while paused to prevent the solver
                    // from calculating a teleportation displacement when unpaused.
                    const ballPos = this.sphere ? this.sphere.getPosition() : new THREE.Vector3();
                    this.oldBallPos.copy(ballPos);
                }

                // ==============================================================
                // GRAPHICS & OPTICS PIPELINE (Runs independently of simulation state)
                // ==============================================================

                const ballPos = this.sphere ? this.sphere.getPosition() : new THREE.Vector3(0, 100, 0);
                const ballRad = this.sphere ? this.sphere.radius : 0.8;

                // Extract texture and world transformation matrix from the physical model.
                // The inverted matrix allows the underwater analytical raytracer to perfectly
                // align the underwater mirage with the real geometry above the surface.
                if (!this.water.material.uniforms.tSphereTex) {
                    this.water.material.uniforms.tSphereTex = { value: null };
                    this.water.material.uniforms.hasSphereTex = { value: 0 };
                    this.water.material.uniforms.sphereMatrixInv = { value: new THREE.Matrix4() };
                }

                if (this.sphere && this.sphere.getMesh()) {
                    this.sphere.getMesh().traverse((child) => {
                        if (child.isMesh && child.material.map) {
                            if (this.water.material.uniforms.hasSphereTex.value === 0) {
                                this.water.material.uniforms.tSphereTex.value = child.material.map;
                                this.water.material.uniforms.hasSphereTex.value = 1;
                            }
                            this.water.material.uniforms.sphereMatrixInv.value.copy(child.matrixWorld).invert();
                        }
                    });
                }

                // Retrieve updated height and normal maps from the FBO ping-pong cycle
                const heightMap = this.gpgpu.getHeightTexture ? this.gpgpu.getHeightTexture() : this.gpgpu.readBuffer.texture;
                const normalMap = this.gpgpu.getNormalTexture ? this.gpgpu.getNormalTexture() : this.gpgpu.normalTarget.texture;

                // Dispatch simulation data to the main water surface material
                this.water.updateTextures(heightMap, normalMap);

                if (this.environment.diffuseMap) {
                    this.water.material.uniforms.tTiles.value = this.environment.diffuseMap;
                }
                if (this.environment.hdrTexture) {
                    this.water.material.uniforms.tSky.value = this.environment.hdrTexture;
                }

                // Execute the caustics mapping pass based on the new fluid normals
                const lightDir = this.environment.getLightDirection();
                this.caustics.update(heightMap, normalMap, lightDir);
                const causticsTex = this.caustics.getTexture();

                // Supply optics data back to the water surface for rendering submerged objects
                if (this.water.material.uniforms.tCaustics) {
                    this.water.material.uniforms.tCaustics.value = causticsTex;
                    this.water.material.uniforms.lightDir.value.copy(lightDir);

                    if (!this.water.material.uniforms.sphereCenter) {
                        this.water.material.uniforms.sphereCenter = { value: new THREE.Vector3() };
                        this.water.material.uniforms.sphereRadius = { value: ballRad };
                    }
                    this.water.material.uniforms.sphereCenter.value.copy(ballPos);
                    this.water.material.uniforms.sphereRadius.value = ballRad;
                }

                // Project accumulated caustics and analytical shadows onto the static pool environment
                if (this.environment.floorMaterial.userData.causticsUniforms) {
                    this.environment.floorMaterial.userData.causticsUniforms.tCaustics.value = causticsTex;
                    this.environment.floorMaterial.userData.causticsUniforms.lightDir.value.copy(lightDir);
                    this.environment.floorMaterial.userData.causticsUniforms.sphereCenter.value.copy(ballPos);
                    this.environment.floorMaterial.userData.causticsUniforms.sphereRadius.value = ballRad;
                }

                // Inject environmental simulation data into the dynamic sphere's custom PBR shader
                if (this.sphere && this.sphere.getMesh()) {
                    this.sphere.getMesh().traverse((child) => {
                        if (child.isMesh && child.material.userData.waterUniforms) {
                            child.material.userData.waterUniforms.tCaustics.value = causticsTex;
                            child.material.userData.waterUniforms.tHeightMap.value = heightMap;
                            child.material.userData.waterUniforms.lightDir.value.copy(lightDir);
                            child.material.userData.waterUniforms.poolDepth.value = this.poolDepth;
                            child.material.userData.waterUniforms.poolSize.value = this.environment.poolSize || 10.0;
                        }
                    });
                }
            }
        });
    }

    /**
     * Ensures the WebGL viewport remains synchronized with the DOM container dimensions.
     * @private
     */
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

    /**
     * Configures raycasting for interactive fluid disruption and physical object manipulation.
     * @private
     */
    _initInteractions() {
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        this.dragPlane = new THREE.Plane();
        this.dragOffset = new THREE.Vector3();

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

        window.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 'l') {
                const cameraPosition = this.engine.camera.position;
                const coords = this.environment.updateSunFromPosition(cameraPosition);
                if (this._elevationController && this._azimuthController) {
                    this._lightParams.elevation = coords.elevation;
                    this._lightParams.azimuth = coords.azimuth;
                    this._elevationController.updateDisplay();
                    this._azimuthController.updateDisplay();
                }
            }
            if (event.key.toLowerCase() === 'g') {
                this.spherePhysics.gravityEnabled = !this.spherePhysics.gravityEnabled;
                this.spherePhysics.velocityX = 0;
                this.spherePhysics.velocityY = 0;
                this.spherePhysics.velocityZ = 0;
            }
            if (event.key.toLowerCase() === 'p') {
                this.isPaused = !this.isPaused;
            }
        });

        this.container.addEventListener('pointermove', (e) => {
            if (this.spherePhysics.isDragging) {
                const rect = this.container.getBoundingClientRect();
                this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                this.raycaster.setFromCamera(this.pointer, this.engine.camera);

                const intersection = new THREE.Vector3();
                if (this.raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
                    const newPos = intersection.sub(this.dragOffset);

                    // Restrict object movement within the physical bounds of the environment
                    const radius = this.sphere.radius;
                    const halfSize = this.poolSize * 0.5;
                    const poolDepth = this.poolDepth;
                    const floorY = -poolDepth;

                    newPos.x = Math.max(-halfSize + radius, Math.min(halfSize - radius, newPos.x));
                    newPos.z = Math.max(-halfSize + radius, Math.min(halfSize - radius, newPos.z));
                    newPos.y = Math.max(floorY + radius, newPos.y);

                    this.sphere.getPosition().copy(newPos);

                    if (this._sphereParams) {
                        this._sphereParams.x = this.sphere.getPosition().x;
                        this._sphereParams.z = this.sphere.getPosition().z;
                        if (this.gui) {
                            this.gui.controllersRecursive().forEach(c => {
                                if(c.property === 'x' || c.property === 'z') c.updateDisplay();
                            });
                        }
                    }
                }
                return;
            }
            castWater(e, 0.02, 0.02);
        });

        window.addEventListener('pointerup', () => {
            if (this.spherePhysics.isDragging) {
                this.spherePhysics.isDragging = false;
                this.lastDragPos = null;
                this.engine.controls.enabled = true;
            }
        });

        this.container.addEventListener('pointerdown', (e) => {
            const rect = this.container.getBoundingClientRect();
            this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera(this.pointer, this.engine.camera);

            if (this.sphere) {
                const sphereIntersects = this.raycaster.intersectObject(this.sphere.getMesh(), true);
                if (sphereIntersects.length > 0) {
                    this.spherePhysics.isDragging = true;
                    this.spherePhysics.velocityX = 0;
                    this.spherePhysics.velocityY = 0;
                    this.spherePhysics.velocityZ = 0;
                    this.lastDragPos = this.sphere.getPosition().clone();

                    this.engine.controls.enabled = false;

                    const cameraDir = new THREE.Vector3();
                    this.engine.camera.getWorldDirection(cameraDir);
                    this.dragPlane.setFromNormalAndCoplanarPoint(cameraDir.negate(), this.sphere.getPosition());

                    this.raycaster.ray.intersectPlane(this.dragPlane, this.dragOffset);
                    this.dragOffset.sub(this.sphere.getPosition());
                    return;
                }
            }
            castWater(e, 0.04, 0.1);
        });
    }

    /**
     * Injects synthetic disruptions into the fluid solver upon initialization
     * to demonstrate reactivity without requiring user input.
     * @private
     */
    _triggerInitialRipples() {
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                this.gpgpu.addDrop(Math.random(), Math.random(), 0.04, 0.02);
            }, i * 200);
        }
    }

    /**
     * Initializes the debugging and configuration interface.
     * @private
     */
    _initGUI() {
        const t = (key) => this.i18n ? this.i18n.t(key) : key;
        const actions = {
            syncLight: () => {
                const coords = this.environment.updateSunFromPosition(this.engine.camera.position);
                this._lightParams.elevation = coords.elevation;
                this._lightParams.azimuth = coords.azimuth;
                if (this._elevationController) this._elevationController.updateDisplay();
                if (this._azimuthController) this._azimuthController.updateDisplay();
            },
            toggleGravity: () => {
                this.spherePhysics.gravityEnabled = !this.spherePhysics.gravityEnabled;
                this.spherePhysics.velocityX = 0;
                this.spherePhysics.velocityY = 0;
                this.spherePhysics.velocityZ = 0;
            },
            togglePause: () => {
                this.isPaused = !this.isPaused;
            }
        };

        this.gui = new GUI({ title: t('gpu.guiTitle') });

        this._lightParams = {
            elevation: Math.PI / 4,
            azimuth: Math.PI / 4,
            intensity: 3.0,
            ambientShadowBase: 0.55,
            shadowBlurRadius: 3.5,
            causticsIntensity: 0.15
        };

        const lightFolder = this.gui.addFolder(t('gpu.lightFolder'));
        lightFolder.add(this._lightParams, 'ambientShadowBase', 0.0, 1.0)
            .name(t('gpu.ambientShadow'))
            .onChange((val) => {
                if (this.water && this.water.material) {
                    this.water.material.uniforms.ambientShadowBase.value = val;
                }
            });

        const updateLighting = () => {
            this.environment.updateSunPosition(this._lightParams.elevation, this._lightParams.azimuth);
            this.environment.setSunIntensity(this._lightParams.intensity);
        };

        this._elevationController = lightFolder.add(this._lightParams, 'elevation', 0.1, Math.PI / 2)
            .name(t('gpu.sunElev'))
            .onChange(updateLighting);

        this._azimuthController = lightFolder.add(this._lightParams, 'azimuth', -Math.PI, Math.PI)
            .name(t('gpu.sunAzim'))
            .onChange(updateLighting);

        lightFolder.add(this._lightParams, 'intensity', 0.0, 10.0)
            .name(t('gpu.sunInt'))
            .onChange(updateLighting);
        lightFolder.add(actions, 'syncLight').name(t('gpu.btnLight'));
        updateLighting();

        const physicsParams = {
            ior: 1.333,
            reflectivity: 0.1,
            absorptionR: 0.8,
            absorptionG: 0.2,
            absorptionB: 0.1
        };

        const opticsFolder = this.gui.addFolder(t('gpu.opticsFolder'));
        opticsFolder.add(physicsParams, 'ior', 1.0, 1.6)
            .name(t('gpu.ior'))
            .onChange((val) => {
                if (this.water && this.water.material) {
                    this.water.material.uniforms.ior.value = val;
                }
            });

        const updateAttenuation = () => {
            if (this.water && this.water.material) {
                this.water.material.uniforms.waterAttenuation.value.set(
                    physicsParams.absorptionR,
                    physicsParams.absorptionG,
                    physicsParams.absorptionB
                );
            }
            if (this.sphere && this.sphere.getMesh()) {
                this.sphere.getMesh().traverse((child) => {
                    if (child.isMesh && child.material.userData.waterUniforms) {
                        child.material.userData.waterUniforms.waterAttenuation.value.set(
                            physicsParams.absorptionR,
                            physicsParams.absorptionG,
                            physicsParams.absorptionB
                        );
                    }
                });
            }

            if (this.environment && this.environment.floorMaterial && this.environment.floorMaterial.userData.causticsUniforms) {
                this.environment.floorMaterial.userData.causticsUniforms.waterAttenuation.value.set(
                    physicsParams.absorptionR,
                    physicsParams.absorptionG,
                    physicsParams.absorptionB
                );
            }
        };

        const volFolder = this.gui.addFolder(t('gpu.volFolder'));
        volFolder.add(physicsParams, 'absorptionR', 0.0, 2.0).name(t('gpu.absR')).onChange(updateAttenuation);
        volFolder.add(physicsParams, 'absorptionG', 0.0, 2.0).name(t('gpu.absG')).onChange(updateAttenuation);
        volFolder.add(physicsParams, 'absorptionB', 0.0, 2.0).name(t('gpu.absB')).onChange(updateAttenuation);

        const sphereFolder = this.gui.addFolder(t('gpu.sphereFolder'));

        this._sphereParams = {
            buoyancy: 20.0
        };

        sphereFolder.add(this.sphere, 'radius', 0.3, 2.0).name(t('gpu.radius')).onChange((val) => {
            if (this.sphere && this.sphere.getMesh()) {
                this.sphere.getMesh().scale.setScalar(val / 0.8);
            }
        });

        sphereFolder.add(this._sphereParams, 'buoyancy', 0.0, 50.0).name(t('gpu.buoyancy'));
        sphereFolder.add(actions, 'toggleGravity').name(t('gpu.btnGravity'));
        sphereFolder.add(actions, 'togglePause').name(t('gpu.btnPause'));
    }

    /**
     * Ignites the internal rendering loops managed by the Engine component.
     */
    start() {
        this.engine.start();
    }
}