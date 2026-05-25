import * as THREE from 'three';
import causticsVert from '../shaders/caustics/caustics.vert';
import causticsFrag from '../shaders/caustics/caustics.frag';

/**
 * Generates dynamic caustics textures using forward vertex projection.
 */
export default class CausticsGenerator {
    constructor(renderer, poolSize = 10, resolution = 1024) {
        this.renderer = renderer;
        this.poolSize = poolSize;
        this.resolution = resolution;

        this._setupRenderTarget();
        this._setupScene();
    }

    _setupRenderTarget() {
        this.renderTarget = new THREE.WebGLRenderTarget(this.resolution, this.resolution, {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            generateMipmaps: false,
            depthBuffer: false
        });
    }

    _setupScene() {
        this.scene = new THREE.Scene();

        const expandedSize = this.poolSize * 1.5;
        const camHalf = expandedSize * 0.5;
        this.camera = new THREE.OrthographicCamera(-camHalf, camHalf, camHalf, -camHalf, 0, 100);
        this.camera.position.set(0, 10, 0);
        this.camera.up.set(0, 0, -1);
        this.camera.lookAt(0, 0, 0);

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
     * Executes the caustics projection pass.
     * @param {THREE.Texture} heightMap
     * @param {THREE.Texture} normalMap
     * @param {THREE.Vector3} lightDirection
     */
    update(heightMap, normalMap, lightDirection) {
        this.material.uniforms.tHeightMap.value = heightMap;
        this.material.uniforms.tNormalMap.value = normalMap;
        this.material.uniforms.lightDir.value.copy(lightDirection).normalize();

        const currentRenderTarget = this.renderer.getRenderTarget();
        const currentAutoClear = this.renderer.autoClear;

        // Render to the internal FBO with a black clear color (additive base)
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.setClearColor(0x000000, 1);
        this.renderer.clear();

        this.renderer.autoClear = false;

        this.material.uniforms.iorOffset.value = -0.015;
        this.material.uniforms.channelMask.value.set(1.0, 0.0, 0.0);
        this.renderer.render(this.scene, this.camera);

        this.material.uniforms.iorOffset.value = 0.0;
        this.material.uniforms.channelMask.value.set(0.0, 1.0, 0.0);
        this.renderer.render(this.scene, this.camera);

        this.material.uniforms.iorOffset.value = 0.015;
        this.material.uniforms.channelMask.value.set(0.0, 0.0, 1.0);
        this.renderer.render(this.scene, this.camera);

        this.renderer.autoClear = currentAutoClear;
        this.renderer.setRenderTarget(currentRenderTarget);
    }

    getTexture() {
        return this.renderTarget.texture;
    }
}