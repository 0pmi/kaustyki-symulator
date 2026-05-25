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
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
        this.scene.add(ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 3.0);

        // Enable shadow casting for the primary directional light
        this.sunLight.castShadow = true;

        // Allocate a high-resolution texture to avoid shadow aliasing (staircase artifacts)
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;

        // Define orthographic shadow camera bounds.
        // We multiply the pool bounds by an offset (0.75) to tightly fit the relevant area,
        // maximizing the effective pixel density of the shadow map.
        const bound = this.poolSize * 1.15;
        this.sunLight.shadow.camera.left = -bound;
        this.sunLight.shadow.camera.right = bound;
        this.sunLight.shadow.camera.top = bound;
        this.sunLight.shadow.camera.bottom = -bound;

        // Z-bounds tailored for the scene scale
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 50.0;

        // Apply negative bias to mitigate self-shadowing artifacts (shadow acne)
        this.sunLight.shadow.bias = -0.001;
        this.sunLight.shadow.normalBias = 0.05;

        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
    }

    /**
     * Updates the directional light position via spherical coordinates.
     * Establishes the incident light vector (L) required for caustics projection.
     * * @param {number} elevation - Angle above the XZ horizon plane in radians.
     * @param {number} azimuth - Horizontal rotation angle around the Y-axis in radians.
     */
    updateSunPosition(elevation, azimuth) {
        const radius = 20.0; // Orbit distance from origin

        // Convert spherical coordinates to Cartesian in a Y-Up coordinate system
        const x = radius * Math.cos(elevation) * Math.sin(azimuth);
        const y = radius * Math.sin(elevation);
        const z = radius * Math.cos(elevation) * Math.cos(azimuth);

        this.sunLight.position.set(x, y, z);
    }

    /**
     * Modifies the incident light scalar intensity.
     * @param {number} intensity
     */
    setSunIntensity(intensity) {
        this.sunLight.intensity = intensity;
    }

    _setupPool() {
        const poolDepth = 4.0;
        const rimHeight = 0.5;
        const totalHeight = poolDepth + rimHeight;
        const boxGeo = new THREE.BoxGeometry(this.poolSize, totalHeight, this.poolSize);

        this.floorMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.2,
            metalness: 0.1,
            side: THREE.BackSide
        });

        this.floorMaterial.envMapIntensity = 0.2;

        this.floorMaterial.userData.causticsUniforms = {
            tCaustics: { value: null },
            poolSize: { value: this.poolSize },
            lightDir: { value: new THREE.Vector3(0, 1, 0) }
        };

        this.floorMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.tCaustics = this.floorMaterial.userData.causticsUniforms.tCaustics;
            shader.uniforms.poolSize = this.floorMaterial.userData.causticsUniforms.poolSize;
            shader.uniforms.lightDir = this.floorMaterial.userData.causticsUniforms.lightDir;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
                varying vec3 vWorldPos;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                `#include <worldpos_vertex>
                vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
                uniform sampler2D tCaustics;
                uniform float poolSize;
                uniform vec3 lightDir;
                varying vec3 vWorldPos;`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
                
                vec3 refractedDir = refract(normalize(lightDir), vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
                
                float tProj = 0.0;
                if (refractedDir.y < -0.001) {
                    tProj = (-4.0 - vWorldPos.y) / refractedDir.y; 
                }
                vec3 projectedPos = vWorldPos + refractedDir * tProj;
                
                vec2 causticUv = vec2(projectedPos.x, -projectedPos.z) / (poolSize * 1.5) + 0.5;
                
                float fadeU = smoothstep(0.0, 0.02, causticUv.x) * (1.0 - smoothstep(0.98, 1.0, causticUv.x));
                float fadeV = smoothstep(0.0, 0.02, causticUv.y) * (1.0 - smoothstep(0.98, 1.0, causticUv.y));
                float edgeFade = fadeU * fadeV;
                
                float tShadow = (0.5 - vWorldPos.y) / max(-lightDir.y, 0.0001);
                vec2 pXZ = vWorldPos.xz - lightDir.xz * tShadow;
                float shadowX = 1.0 - smoothstep(poolSize * 0.5 - 0.05, poolSize * 0.5 + 0.05, abs(pXZ.x));
                float shadowZ = 1.0 - smoothstep(poolSize * 0.5 - 0.05, poolSize * 0.5 + 0.05, abs(pXZ.y));
                float rimShadow = shadowX * shadowZ;
                
                if(causticUv.x >= 0.0 && causticUv.x <= 1.0 && causticUv.y >= 0.0 && causticUv.y <= 1.0 && vWorldPos.y <= 0.1) {
                    vec3 causticLight = texture2D(tCaustics, causticUv).rgb * edgeFade * rimShadow; 
                    gl_FragColor.rgb += causticLight * gl_FragColor.rgb * 1.5;
                }

                if (vWorldPos.y < 0.0) {
                    float depth = abs(vWorldPos.y); 
                    vec3 waterAttenuation = vec3(0.8, 0.2, 0.1);
                    vec3 transmission = exp(-waterAttenuation * depth * 0.5); 
                    gl_FragColor.rgb *= transmission;
                }
                `
            );
        };

        const invisibleMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const materials = [
            this.floorMaterial, // 0: Right
            this.floorMaterial, // 1: Left
            invisibleMaterial,  // 2: Up
            this.floorMaterial, // 3: Down
            this.floorMaterial, // 4: Front
            this.floorMaterial  // 5: Back
        ];

        this.floorMesh = new THREE.Mesh(boxGeo, materials);
        this.floorMesh.position.y = (rimHeight - poolDepth) / 2.0;
        this.floorMesh.castShadow = true;
        this.floorMesh.receiveShadow = true;

        this.scene.add(this.floorMesh);
    }
    /**
     * Updates the sun position based on an arbitrary world position vector (e.g., camera position).
     * Derives corresponding spherical angles to keep the UI layer synchronized.
     * @param {THREE.Vector3} position - The target position vector in world space.
     * @returns {{elevation: number, azimuth: number}} Derived spherical coordinates in radians.
     */
    updateSunFromPosition(position) {
        const radius = position.length();
        if (radius === 0) return { elevation: Math.PI / 2, azimuth: 0 };

        // Analytical derivation of spherical coordinates from Cartesian Y-Up system
        const elevation = Math.asin(position.y / radius);
        const azimuth = Math.atan2(position.x, position.z);

        // Enforce boundary constraints for the physical simulation layout
        const clampedElevation = Math.max(0.1, Math.min(Math.PI / 2, elevation));

        this.updateSunPosition(clampedElevation, azimuth);

        return { elevation: clampedElevation, azimuth };
    }

    _loadAssets() {
        const textureLoader = new THREE.TextureLoader();
        const textureBaseUrl = './textures/';

        const diffuseMap = textureLoader.load(`${textureBaseUrl}tiles_01_diff_1k.jpg`);
        const normalMap = textureLoader.load(`${textureBaseUrl}tiles_01_nor_gl_1k.jpg`);
        const roughnessMap = textureLoader.load(`${textureBaseUrl}tiles_01_rough_1k.jpg`);

        const tileRepeat = 4;
        const textures = [diffuseMap, normalMap, roughnessMap];
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

        this.diffuseMap = diffuseMap;

        const hdrLoader = new HDRLoader();
        hdrLoader.load(`${textureBaseUrl}sky.hdr`, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.background = texture;
            this.scene.environment = texture;
            this.scene.backgroundIntensity = 0.5;
            this.hdrTexture = texture;
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