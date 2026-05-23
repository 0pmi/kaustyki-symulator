import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/**
 * Manages the static 3D environment, handles asynchronous PBR texture loading,
 * configures texture wrapping, and sets up the HDR environment map.
 */
export default class Environment {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.WebGLRenderer} renderer
     * @param {number} poolSize - Spatial dimensions of the pool floor.
     */
    constructor(scene, renderer, poolSize = 10) {
        this.scene = scene;
        this.renderer = renderer;
        this.poolSize = poolSize;

        this._setupLighting();
        this._setupPool();
        this._loadAssets();
    }

    _setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
        this.sunLight.position.set(-5, 12, 5);
        this.sunLight.target.position.set(0, 0, 0);

        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
    }

    _setupPool() {
        const poolDepth = 4.0;
        const rimHeight = 0.5; // Extension above the water surface
        const totalHeight = poolDepth + rimHeight;
        const boxGeo = new THREE.BoxGeometry(this.poolSize, totalHeight, this.poolSize);

        this.floorMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.5,
            side: THREE.BackSide
        });

        // Intercept standard shader compilation to inject volumetric fluid physics
        this.floorMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.waterAttenuation = { value: new THREE.Vector3(0.8, 0.2, 0.1) };

            // 1. Extract world position in the vertex shader
            shader.vertexShader = `
                varying vec3 vWorldPos;
                ${shader.vertexShader}
            `.replace(
                `#include <worldpos_vertex>`,
                `#include <worldpos_vertex>
                 vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
            );

            // 2. Compute Beer-Lambert absorption in the fragment shader
            shader.fragmentShader = `
                uniform vec3 waterAttenuation;
                varying vec3 vWorldPos;
                ${shader.fragmentShader}
            `.replace(
                `#include <colorspace_fragment>`,
                `
                // Evaluate physical bounds of the fluid volume
                if (vWorldPos.y < 0.0) {
                    vec3 camPos = cameraPosition;
                    float pathLength = 0.0;
                    
                    if (camPos.y > 0.0) {
                        // Camera is in the air. Calculate distance from water surface intersection to the wall.
                        vec3 dir = vWorldPos - camPos;
                        float t = (0.0 - camPos.y) / dir.y; 
                        vec3 surfaceHit = camPos + dir * t;
                        pathLength = distance(surfaceHit, vWorldPos);
                    } else {
                        // Camera is submerged. Calculate distance from camera directly to the wall.
                        pathLength = distance(camPos, vWorldPos);
                    }

                    // Apply exponential decay based on traversal distance through the medium
                    vec3 transmission = exp(-waterAttenuation * pathLength * 0.25);
                    gl_FragColor.rgb *= transmission;
                }
                
                #include <colorspace_fragment>
                `
            );
        };

        const invisibleMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const materials = [
            this.floorMaterial, // 0: Right
            this.floorMaterial, // 1: Left
            invisibleMaterial,  // 2: Up
            this.floorMaterial, // 3: Down
            this.floorMaterial, // 4: Forward
            this.floorMaterial  // 5: Back
        ];
        this.floorMesh = new THREE.Mesh(boxGeo, materials);
        this.floorMesh.position.y = (rimHeight - poolDepth) / 2.0;

        this.scene.add(this.floorMesh);
    }

    _loadAssets() {
        const textureLoader = new THREE.TextureLoader();
        const textureBaseUrl = './textures/';

        const diffuseMap = textureLoader.load(`${textureBaseUrl}tiles_01_diff_1k.jpg`);
        const normalMap = textureLoader.load(`${textureBaseUrl}tiles_01_nor_gl_1k.jpg`);
        const roughnessMap = textureLoader.load(`${textureBaseUrl}tiles_01_rough_1k.jpg`);

        const textures = [diffuseMap, normalMap, roughnessMap];
        const tileRepeat = 4.0;

        for (const tex of textures) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(tileRepeat, tileRepeat);
            if (tex === diffuseMap) tex.colorSpace = THREE.SRGBColorSpace;
        }

        this.floorMaterial.map = diffuseMap;
        this.floorMaterial.normalMap = normalMap;
        this.floorMaterial.normalScale.set(1.0, 1.0);
        this.floorMaterial.roughnessMap = roughnessMap;
        this.floorMaterial.needsUpdate = true;

        // Expose the diffuse map for the water shader raytracing
        this.diffuseMap = diffuseMap;

        const hdrLoader = new HDRLoader();
        hdrLoader.load(`${textureBaseUrl}sky.hdr`, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.background = texture;
            this.scene.environment = texture;
            this.scene.backgroundIntensity = 0.5;

            // Expose the HDR sky map for the water shader reflections
            this.hdrTexture = texture;
        }, undefined, (error) => {
            console.error("Environment: Failed to load HDR map.", error);
        });
    }

    /**
     * Returns the normalized directional light vector.
     * @returns {THREE.Vector3}
     */
    getLightDirection() {
        return new THREE.Vector3()
            .subVectors(this.sunLight.target.position, this.sunLight.position)
            .normalize();
    }
}