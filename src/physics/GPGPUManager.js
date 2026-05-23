import * as THREE from 'three';
import fullscreenVert from '../shaders/simulation/fullscreen.vert';
import updateFrag from '../shaders/simulation/update.frag';
import normalFrag from '../shaders/simulation/normal.frag';
import dropFrag from '../shaders/simulation/drop.frag';

/**
 * Manages FBO Ping-Pong computation for the fluid simulation.
 */
export default class GPGPUManager {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {number} resolution - Grid resolution (e.g., 256 or 512 for optimal bounds)
     */
    constructor(renderer, resolution = 512) {
        this.renderer = renderer;
        this.resolution = resolution;

        this._setupScene();
        this._setupRenderTargets();
        this._setupMaterials();
    }

    _setupScene() {
        this.scene = new THREE.Scene();
        // Orthographic camera covering the normalized [-1, 1] NDC space
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this.scene.add(this.mesh);
    }

    _setupRenderTargets() {
        const options = {
            width: this.resolution,
            height: this.resolution,
            format: THREE.RGBAFormat,
            // HalfFloat is standard for GPGPU positional/height data to save VRAM
            // while providing adequate precision.
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping
        };

        // Ping-pong targets for the wave equation
        this.targetA = new THREE.WebGLRenderTarget(this.resolution, this.resolution, options);
        this.targetB = this.targetA.clone();

        // Target for the computed normals
        this.normalTarget = this.targetA.clone();

        this.readBuffer = this.targetA;
        this.writeBuffer = this.targetB;
    }

    _setupMaterials() {
        const delta = new THREE.Vector2(1.0 / this.resolution, 1.0 / this.resolution);

        this.updateMaterial = new THREE.ShaderMaterial({
            vertexShader: fullscreenVert,
            fragmentShader: updateFrag,
            uniforms: {
                tHeightMap: { value: null },
                delta: { value: delta },
                damping: { value: 0.995 } // Simulated fluid viscosity
            }
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
     * Executes a render pass onto a specified WebGLRenderTarget.
     * @param {THREE.ShaderMaterial} material
     * @param {THREE.WebGLRenderTarget} target
     */
    _renderPass(material, target) {
        this.mesh.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
    }

    /**
     * Injects a droplet force into the simulation.
     * @param {number} x - Normalized X coordinate [0, 1]
     * @param {number} y - Normalized Y coordinate [0, 1]
     * @param {number} radius - Radius of the drop impact
     * @param {number} strength - Amplitude force of the drop
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
     * Steps the simulation forward by one iteration.
     */
    update() {
        // 1. Compute Wave Equation
        this.updateMaterial.uniforms.tHeightMap.value = this.readBuffer.texture;
        this._renderPass(this.updateMaterial, this.writeBuffer);
        this._swapBuffers();

        // 2. Compute Normals based on the newly updated height map
        this.normalMaterial.uniforms.tHeightMap.value = this.readBuffer.texture;
        this._renderPass(this.normalMaterial, this.normalTarget);
    }

    _swapBuffers() {
        const temp = this.readBuffer;
        this.readBuffer = this.writeBuffer;
        this.writeBuffer = temp;
    }

    /**
     * Exposes the computed normal map for rendering.
     * @returns {THREE.Texture}
     */
    getNormalTexture() {
        return this.normalTarget.texture;
    }

    /**
     * Exposes the current height map for rendering.
     * @returns {THREE.Texture}
     */
    getHeightTexture() {
        return this.readBuffer.texture;
    }
}