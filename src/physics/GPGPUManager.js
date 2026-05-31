import * as THREE from 'three';
import fullscreenVert from '../shaders/simulation/fullscreen.vert';
import updateFrag from '../shaders/simulation/update.frag';
import normalFrag from '../shaders/simulation/normal.frag';
import dropFrag from '../shaders/simulation/drop.frag';

/**
 * Manages GPGPU (General-Purpose computing on Graphics Processing Units) fluid simulation.
 * Utilizes a ping-pong Frame Buffer Object (FBO) technique to solve the 2D wave equation
 * entirely on the GPU, avoiding CPU-to-GPU memory transfer bottlenecks.
 */
export default class GPGPUManager {
    /**
     * @param {THREE.WebGLRenderer} renderer - The active WebGL context.
     * @param {number} resolution - Texture resolution for the simulation grid.
     * Higher values increase wave detail but scale computationally at O(N^2).
     */
    constructor(renderer, resolution = 512) {
        this.renderer = renderer;
        this.resolution = resolution;

        this._setupScene();
        this._setupRenderTargets();
        this._setupMaterials();
    }

    /**
     * Sets up a dedicated off-screen rendering environment.
     * Uses a full-screen quad (plane) and an orthographic camera mapping exactly to
     * Normalized Device Coordinates ([-1, 1]), ensuring a 1:1 pixel-to-texel mapping.
     * @private
     */
    _setupScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this.scene.add(this.mesh);
    }

    /**
     * Initializes the ping-pong buffer pairs required for iterative simulations.
     * WebGL cannot read and write to the same texture simultaneously.
     * @private
     */
    _setupRenderTargets() {
        const options = {
            width: this.resolution,
            height: this.resolution,
            format: THREE.RGBAFormat,
            // HalfFloat (16-bit) provides sufficient precision for physical height data
            // preventing the terracing/stair-stepping artifacts seen with 8-bit textures,
            // while requiring half the VRAM bandwidth of full 32-bit floats.
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false,
            // ClampToEdge prevents wave energy from wrapping around to the opposite side of the pool
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping
        };

        this.targetA = new THREE.WebGLRenderTarget(this.resolution, this.resolution, options);
        this.targetB = this.targetA.clone();

        // Final output target used by the rendering pipeline for refraction and lighting
        this.normalTarget = this.targetA.clone();

        this.readBuffer = this.targetA;
        this.writeBuffer = this.targetB;
    }

    /**
     * Compiles the simulation shaders.
     * @private
     */
    _setupMaterials() {
        // Delta represents the size of a single texel in UV space [0, 1].
        // Crucial for finite difference calculations (dFdx/dFdy) in the wave equation.
        const delta = new THREE.Vector2(1.0 / this.resolution, 1.0 / this.resolution);

        this.updateMaterial = new THREE.ShaderMaterial({
            vertexShader: fullscreenVert,
            fragmentShader: updateFrag,
            uniforms: {
                tHeightMap: { value: null },
                delta: { value: delta },
                damping: { value: 0.995 }, // Energy loss per frame. 1.0 = perpetual motion.
                sphereCenter: { value: new THREE.Vector3(0, 100, 0) },
                sphereRadius: { value: 0.5 },
                poolSize: { value: 10.0 }
            },
            depthWrite: false,
            depthTest: false
        });

        this.normalMaterial = new THREE.ShaderMaterial({
            vertexShader: fullscreenVert,
            fragmentShader: normalFrag,
            uniforms: {
                tHeightMap: { value: null },
                delta: { value: delta }
            }
        });

        this.dropMaterial = new THREE.ShaderMaterial({
            vertexShader: fullscreenVert,
            fragmentShader: dropFrag,
            uniforms: {
                tHeightMap: { value: null },
                center: { value: new THREE.Vector2() },
                radius: { value: 0.05 },
                strength: { value: 0.0 }
            }
        });
    }

    /**
     * Orchestrates a single GPU computation pass.
     * @param {THREE.ShaderMaterial} material - The computation shader to run.
     * @param {THREE.WebGLRenderTarget} target - The destination texture.
     * @private
     */
    _renderPass(material, target) {
        this.mesh.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
    }

    /**
     * Injects kinetic energy (a droplet) into the wave system.
     * @param {number} x - Normalized X impact coordinate [0, 1].
     * @param {number} y - Normalized Y impact coordinate [0, 1].
     * @param {number} radius - Spread radius of the impact force.
     * @param {number} strength - Amplitude of the vertical displacement.
     */
    addDrop(x, y, radius, strength) {
        this.dropMaterial.uniforms.tHeightMap.value = this.readBuffer.texture;
        this.dropMaterial.uniforms.center.value.set(x, y);
        this.dropMaterial.uniforms.radius.value = radius;
        this.dropMaterial.uniforms.strength.value = strength;

        this._renderPass(this.dropMaterial, this.writeBuffer);
        this._swapBuffers();
    }

    /**
     * Advances the fluid dynamics simulation by one discrete timestep.
     * @param {THREE.Vector3|null} [spherePos=null] - World-space position of the interacting physics object.
     * @param {number} [sphereRadius=0.5] - Radius of the interacting object.
     */
    update(spherePos = null, sphereRadius = 0.5) {
        if (spherePos) {
            this.updateMaterial.uniforms.sphereCenter.value.copy(spherePos);
            this.updateMaterial.uniforms.sphereRadius.value = sphereRadius;
        } else {
            // Move the sphere safely out of bounds if no position is provided
            this.updateMaterial.uniforms.sphereCenter.value.set(0, 100, 0);
        }

        // Pass 1: Solve wave equation propagation
        this.updateMaterial.uniforms.tHeightMap.value = this.readBuffer.texture;
        this._renderPass(this.updateMaterial, this.writeBuffer);
        this._swapBuffers();

        // Pass 2: Calculate surface normals for the new heights
        // Required for lighting and caustics refraction in external renderers
        this.normalMaterial.uniforms.tHeightMap.value = this.readBuffer.texture;
        this._renderPass(this.normalMaterial, this.normalTarget);
    }

    /**
     * Reverses the roles of the read and write buffers, preparing for the next iteration.
     * @private
     */
    _swapBuffers() {
        const temp = this.readBuffer;
        this.readBuffer = this.writeBuffer;
        this.writeBuffer = temp;
    }

    /**
     * Exposes the computed RGB normal map.
     * @returns {THREE.Texture}
     */
    getNormalTexture() {
        return this.normalTarget.texture;
    }

    /**
     * Exposes the raw floating-point height map.
     * @returns {THREE.Texture}
     */
    getHeightTexture() {
        return this.readBuffer.texture;
    }
}