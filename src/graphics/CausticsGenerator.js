import * as THREE from 'three';
import causticsVert from '../shaders/caustics/caustics.vert';
import causticsFrag from '../shaders/caustics/caustics.frag';

/**
 * Generates dynamic caustics textures using forward vertex projection.
 * It refracts a dense grid of vertices through the simulated water surface
 * and accumulates their density on a 2D plane to simulate light focusing.
 */
export default class CausticsGenerator {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {number} poolSize - Spatial dimensions of the projection target.
     * @param {number} resolution - Texture resolution for the baked caustics map.
     */
    constructor(renderer, poolSize = 10, resolution = 1024) {
        this.renderer = renderer;
        this.poolSize = poolSize;
        this.resolution = resolution;

        this._setupRenderTarget();
        this._setupScene();
    }

    /**
     * @private
     */
    _setupRenderTarget() {
        // HalfFloatType is crucial here: it provides enough precision to accumulate
        // massive amounts of overlapping light intensity (HDR) without the severe
        // memory bandwidth overhead of full 32-bit floats.
        this.renderTarget = new THREE.WebGLRenderTarget(this.resolution, this.resolution, {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            generateMipmaps: false,
            depthBuffer: false
        });
    }

    /**
     * @private
     */
    _setupScene() {
        this.scene = new THREE.Scene();

        // The caustics map needs to cover an area slightly larger than the pool
        // to capture refracted rays bending outwards.
        const expandedSize = this.poolSize * 1.5;
        const camHalf = expandedSize * 0.5;

        // Orthographic projection natively captures the flattened 2D distribution of the refracted vertices.
        this.camera = new THREE.OrthographicCamera(-camHalf, camHalf, camHalf, -camHalf, 0, 100);
        this.camera.position.set(0, 10, 0);
        this.camera.up.set(0, 0, -1);
        this.camera.lookAt(0, 0, 0);

        // Dense mesh. Each vertex acts as an individual photon/light ray.
        const geometry = new THREE.PlaneGeometry(expandedSize, expandedSize, 767, 767);

        this.material = new THREE.ShaderMaterial({
            vertexShader: causticsVert,
            fragmentShader: causticsFrag,
            uniforms: {
                tHeightMap: { value: null },
                tNormalMap: { value: null },
                lightDir: { value: new THREE.Vector3(0, 1, 0) },
                poolSize: { value: this.poolSize },
                poolDepth: { value: 4.0 },
                ior: { value: 1.333 },
                iorOffset: { value: 0.0 },
                channelMask: { value: new THREE.Vector3(1, 1, 1) },
                causticsIntensity: { value: 0.15 }
            },
            // Additive blending is the core mathematical trick for caustics projection.
            // Where vertices overlap (light focuses), their fragment outputs sum up, creating bright spots.
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
            extensions: {
                derivatives: true
            }
        });

        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.frustumCulled = false;

        this.scene.add(mesh);
    }

    /**
     * Executes the caustics projection pass. To simulate chromatic aberration,
     * the geometry is rendered three consecutive times with slightly altered Indices of Refraction (IOR).
     * * @param {THREE.Texture} heightMap
     * @param {THREE.Texture} normalMap
     * @param {THREE.Vector3} lightDirection
     */
    update(heightMap, normalMap, lightDirection) {
        this.material.uniforms.tHeightMap.value = heightMap;
        this.material.uniforms.tNormalMap.value = normalMap;
        this.material.uniforms.lightDir.value.copy(lightDirection).normalize();

        const currentRenderTarget = this.renderer.getRenderTarget();
        const currentAutoClear = this.renderer.autoClear;

        // Render to the internal FBO with a black clear color (establishing the additive base)
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.setClearColor(0x000000, 1);
        this.renderer.clear();

        // Disable autoClear so subsequent RGB passes accumulate on top of each other
        this.renderer.autoClear = false;

        // Pass 1: Red channel (lower IOR)
        this.material.uniforms.iorOffset.value = -0.015;
        this.material.uniforms.channelMask.value.set(1.0, 0.0, 0.0);
        this.renderer.render(this.scene, this.camera);

        // Pass 2: Green channel (base IOR)
        this.material.uniforms.iorOffset.value = 0.0;
        this.material.uniforms.channelMask.value.set(0.0, 1.0, 0.0);
        this.renderer.render(this.scene, this.camera);

        // Pass 3: Blue channel (higher IOR)
        this.material.uniforms.iorOffset.value = 0.015;
        this.material.uniforms.channelMask.value.set(0.0, 0.0, 1.0);
        this.renderer.render(this.scene, this.camera);

        // Restore external engine state
        this.renderer.autoClear = currentAutoClear;
        this.renderer.setRenderTarget(currentRenderTarget);
    }

    /**
     * @returns {THREE.Texture} The generated HDR caustics texture map.
     */
    getTexture() {
        return this.renderTarget.texture;
    }
}