import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/**
 * Manages the static 3D environment, handles asynchronous PBR texture loading,
 * configures texture wrapping, and sets up the HDR environment lighting.
 */
export default class Environment {
    /**
     * @param {THREE.Scene} scene - The main application scene.
     * @param {THREE.WebGLRenderer} renderer - The WebGL renderer (needed for hardware capabilities).
     * @param {number} poolSize - Spatial dimensions of the pool floor.
     * @param {number} poolDepth - Depth of the pool to accurately calculate attenuation and shadows.
     */
    constructor(scene, renderer, poolSize = 10, poolDepth = 4.0) {
        this.scene = scene;
        this.renderer = renderer;
        this.poolSize = poolSize;
        this.poolDepth = poolDepth;

        this._setupLighting();
        this._setupPool();
        this._loadAssets();
    }

    /**
     * Configures the global illumination and the main directional sun light.
     * @private
     */
    _setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
        this.scene.add(ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
        this.sunLight.castShadow = true;

        /* PERFORMANCE NOTE: Shadow map resolution is the primary performance bottleneck here.
           Drop this to 1024 or 512 for a massive framerate boost on lower-end mobile devices. */
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;

        const bound = this.poolSize * 1.15;
        this.sunLight.shadow.camera.left = -bound;
        this.sunLight.shadow.camera.right = bound;
        this.sunLight.shadow.camera.top = bound;
        this.sunLight.shadow.camera.bottom = -bound;

        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 50.0;
        this.sunLight.shadow.bias = -0.001;
        this.sunLight.shadow.normalBias = 0.05;

        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
    }

    /**
     * Updates the sun's position using spherical coordinates.
     * @param {number} elevation - The vertical angle (altitude) of the sun in radians.
     * @param {number} azimuth - The horizontal angle of the sun in radians.
     */
    updateSunPosition(elevation, azimuth) {
        const radius = 20.0;
        const x = radius * Math.cos(elevation) * Math.sin(azimuth);
        const y = radius * Math.sin(elevation);
        const z = radius * Math.cos(elevation) * Math.cos(azimuth);
        this.sunLight.position.set(x, y, z);
    }

    /**
     * Sets the intensity of the primary directional light.
     * @param {number} intensity
     */
    setSunIntensity(intensity) {
        this.sunLight.intensity = intensity;
    }

    /**
     * Constructs the pool geometry and injects optical integration shaders into the standard PBR pipeline.
     * @private
     */
    _setupPool() {
        const rimHeight = 0.5;
        const totalHeight = this.poolDepth + rimHeight;

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
            lightDir: { value: new THREE.Vector3(0, 1, 0) },
            sphereCenter: { value: new THREE.Vector3(0, 100, 0) },
            sphereRadius: { value: 0.5 },
            waterAttenuation: { value: new THREE.Vector3(0.8, 0.2, 0.1) }
        };

        this.floorMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.tCaustics = this.floorMaterial.userData.causticsUniforms.tCaustics;
            shader.uniforms.poolSize = this.floorMaterial.userData.causticsUniforms.poolSize;
            shader.uniforms.lightDir = this.floorMaterial.userData.causticsUniforms.lightDir;
            shader.uniforms.sphereCenter = this.floorMaterial.userData.causticsUniforms.sphereCenter;
            shader.uniforms.sphereRadius = this.floorMaterial.userData.causticsUniforms.sphereRadius;
            shader.uniforms.waterAttenuation = this.floorMaterial.userData.causticsUniforms.waterAttenuation;

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
                uniform vec3 sphereCenter;
                uniform float sphereRadius;
                uniform vec3 waterAttenuation;
                varying vec3 vWorldPos;`
            );


            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
                
                vec3 refractedDir = refract(normalize(lightDir), vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
                
                /* 1. CAUSTICS PROJECTION */
                float tProj = 0.0;
                if (refractedDir.y < -0.001) {
                    tProj = (-${this.poolDepth.toFixed(2)} - vWorldPos.y) / refractedDir.y; 
                }
                vec3 projectedPos = vWorldPos + refractedDir * tProj;
                vec2 causticUv = vec2(projectedPos.x, -projectedPos.z) / (poolSize * 1.5) + 0.5;
                
                float fadeU = smoothstep(0.0, 0.02, causticUv.x) * (1.0 - smoothstep(0.98, 1.0, causticUv.x));
                float fadeV = smoothstep(0.0, 0.02, causticUv.y) * (1.0 - smoothstep(0.98, 1.0, causticUv.y));
                float edgeFade = fadeU * fadeV;
                
                /* 2. EDGE SHADOW MASKING */
                float tShadow = (0.5 - vWorldPos.y) / max(-lightDir.y, 0.0001);
                vec2 pXZ = vWorldPos.xz - lightDir.xz * tShadow;
                float shadowX = 1.0 - smoothstep(poolSize * 0.5 - 0.05, poolSize * 0.5 + 0.05, abs(pXZ.x));
                float shadowZ = 1.0 - smoothstep(poolSize * 0.5 - 0.05, poolSize * 0.5 + 0.05, abs(pXZ.y));
                float rimShadow = shadowX * shadowZ;
                
                /* 3. ANALYTICAL SPHERE SHADOW */
                vec3 L2 = normalize(lightDir);
                vec3 refractedLight2 = refract(L2, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
                
                float tToSurf = -vWorldPos.y / max(-refractedLight2.y, 0.0001);
                vec3 surfPos = vWorldPos - refractedLight2 * tToSurf;
                
                vec3 v1 = sphereCenter - vWorldPos;
                vec3 dir1 = normalize(-refractedLight2);
                float t1 = clamp(dot(v1, dir1), 0.0, length(surfPos - vWorldPos));
                float dist1 = length(v1 - t1 * dir1);
                
                vec3 v2 = sphereCenter - surfPos;
                vec3 dir2 = normalize(-L2);
                float t2 = max(0.0, dot(v2, dir2));
                float dist2 = length(v2 - t2 * dir2);
                
                float minDist = min(dist1, dist2);
                float ballShadow = smoothstep(sphereRadius * 0.8, sphereRadius * 1.2, minDist);
                
                float finalShadow = min(rimShadow, ballShadow);
                
                /* Apply caustics only to submerged areas and within valid UV bounds */
                if(causticUv.x >= 0.0 && causticUv.x <= 1.0 && causticUv.y >= 0.0 && causticUv.y <= 1.0 && vWorldPos.y <= 0.1) {
                    vec3 causticLight = texture2D(tCaustics, causticUv).rgb * edgeFade * finalShadow; 
                    gl_FragColor.rgb += causticLight * gl_FragColor.rgb * 1.5;
                }

                /* 4. VOLUMETRIC ATTENUATION */
                if (vWorldPos.y < 0.0) {
                    float depth = abs(vWorldPos.y); 
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
            invisibleMaterial,  // 2: Up (Removed to open the pool)
            this.floorMaterial, // 3: Down
            this.floorMaterial, // 4: Front
            this.floorMaterial  // 5: Back
        ];

        this.floorMesh = new THREE.Mesh(boxGeo, materials);
        this.floorMesh.position.y = (rimHeight - this.poolDepth) / 2.0;
        this.floorMesh.castShadow = true;
        this.floorMesh.receiveShadow = true;

        this.scene.add(this.floorMesh);
    }

    /**
     * Calculates the required sun elevation and azimuth based on the camera's world position,
     * ensuring the sun always faces the viewer.
     * @param {THREE.Vector3} position - The camera position.
     * @returns {Object} Extracted elevation and azimuth limits.
     */
    updateSunFromPosition(position) {
        const radius = position.length();
        if (radius === 0) return { elevation: Math.PI / 2, azimuth: 0 };

        const elevation = Math.asin(position.y / radius);
        const azimuth = Math.atan2(position.x, position.z);

        const clampedElevation = Math.max(0.1, Math.min(Math.PI / 2, elevation));

        this.updateSunPosition(clampedElevation, azimuth);

        return { elevation: clampedElevation, azimuth };
    }

    /**
     * Loads physical textures and environment maps, applying anisotropic filtering for clarity at grazing angles.
     * @private
     */
    _loadAssets() {
        const textureLoader = new THREE.TextureLoader();
        const textureBaseUrl = './textures/';

        const diffuseMap = textureLoader.load(`${textureBaseUrl}pool_tiles/tiles_01_diff_1k.jpg`);
        const normalMap = textureLoader.load(`${textureBaseUrl}pool_tiles/tiles_01_nor_gl_1k.jpg`);
        const roughnessMap = textureLoader.load(`${textureBaseUrl}pool_tiles/tiles_01_rough_1k.jpg`);

        const tileRepeat = 4;

        const maxAnisotropy = Math.max(1, this.renderer.capabilities.getMaxAnisotropy());

        const textures = [diffuseMap, normalMap, roughnessMap];

        for (const tex of textures) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(tileRepeat, tileRepeat);

            tex.anisotropy = maxAnisotropy;

            if (tex === diffuseMap) tex.colorSpace = THREE.SRGBColorSpace;
        }

        this.floorMaterial.map = diffuseMap;
        this.floorMaterial.normalMap = normalMap;
        this.floorMaterial.normalScale.set(1.0, 1.0);
        this.floorMaterial.roughnessMap = roughnessMap;
        this.floorMaterial.needsUpdate = true;

        this.diffuseMap = diffuseMap;

        const hdrLoader = new HDRLoader();
        hdrLoader.load(`${textureBaseUrl}background/sky.hdr`, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.background = texture;
            this.scene.environment = texture;
            this.scene.backgroundIntensity = 0.5;
            this.hdrTexture = texture;
        });
    }

    /**
     * Retrieves the normalized vector representing the direction of the sunlight.
     * @returns {THREE.Vector3}
     */
    getLightDirection() {
        return new THREE.Vector3()
            .subVectors(this.sunLight.target.position, this.sunLight.position)
            .normalize();
    }
}