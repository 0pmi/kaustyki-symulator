import * as THREE from 'three';

/**
 * Represents a physical sphere with PBR materials and a custom shader
 * extension for underwater optics, including volumetric attenuation and caustic projection.
 */
export default class SphereMesh {
    /**
     * @param {number} radius - The physical radius of the sphere.
     */
    constructor(radius = 0.5) {
        this.radius = radius;

        // Wrapped in a Group to maintain structural compatibility with external
        // logic that expects an encapsulation layer (e.g., coordinate offsets).
        this.mesh = new THREE.Group();
        this.mesh.position.set(0, 0, 0);

        this._createMesh();
    }

    /**
     * Initializes the geometry, PBR materials, and injects custom GLSL chunks.
     * @private
     */
    _createMesh() {
        const geometry = new THREE.SphereGeometry(this.radius, 64, 64);

        const textureLoader = new THREE.TextureLoader();
        const diffuseMap = textureLoader.load('./textures/ball_diff.jpg');
        const normalMap = textureLoader.load('./textures/ball_normal.jpg');
        const roughnessMap = textureLoader.load('./textures/ball_rough.jpg');

        // Diffuse color maps require sRGB color space for correct physical rendering
        diffuseMap.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.MeshStandardMaterial({
            map: diffuseMap,
            normalMap: normalMap,
            roughnessMap: roughnessMap,
            metalness: 0.1
        });

        material.normalScale.set(1.0, 1.0);

        const sphere = new THREE.Mesh(geometry, material);
        sphere.castShadow = false;
        sphere.receiveShadow = true;

        // Shared uniforms for the water optics integration
        sphere.material.userData.waterUniforms = {
            waterAttenuation: { value: new THREE.Vector3(0.8, 0.2, 0.1) },
            tCaustics: { value: null },
            tHeightMap: { value: null },
            lightDir: { value: new THREE.Vector3(0, 1, 0) },
            poolDepth: { value: 4.0 },
            poolSize: { value: 10.0 }
        };

        sphere.material.onBeforeCompile = (shader) => {
            shader.uniforms.waterAttenuation = sphere.material.userData.waterUniforms.waterAttenuation;
            shader.uniforms.tCaustics = sphere.material.userData.waterUniforms.tCaustics;
            shader.uniforms.tHeightMap = sphere.material.userData.waterUniforms.tHeightMap;
            shader.uniforms.lightDir = sphere.material.userData.waterUniforms.lightDir;
            shader.uniforms.poolDepth = sphere.material.userData.waterUniforms.poolDepth;
            shader.uniforms.poolSize = sphere.material.userData.waterUniforms.poolSize;

            // Expose world-space position and normals to the fragment shader
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
                varying vec3 vWorldPosBall;
                varying vec3 vWorldNormalBall;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                `#include <worldpos_vertex>
                vWorldPosBall = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vWorldNormalBall = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
                uniform vec3 waterAttenuation;
                uniform sampler2D tCaustics;
                uniform sampler2D tHeightMap;
                uniform vec3 lightDir;
                uniform float poolDepth;
                uniform float poolSize;
                varying vec3 vWorldPosBall;
                varying vec3 vWorldNormalBall;`
            );

            // Inject optical computations before final dithering
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
                
                // Map world coordinates to the [0, 1] UV space of the pool heightmap
                vec2 waveUv = vec2(vWorldPosBall.x, -vWorldPosBall.z) / poolSize + 0.5;
                float currentWaveHeight = 0.0;
                
                if (waveUv.x >= 0.0 && waveUv.x <= 1.0 && waveUv.y >= 0.0 && waveUv.y <= 1.0) {
                    currentWaveHeight = texture2D(tHeightMap, waveUv).r;
                }

                // Apply underwater effects only if the fragment is strictly below the dynamic wave surface
                if (vWorldPosBall.y < currentWaveHeight) {
                    float depth = currentWaveHeight - vWorldPosBall.y;
                    
                    // Caustic projection: trace the refracted light vector from the pool floor back to the sphere
                    vec3 refractedDir = refract(normalize(lightDir), vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
                    float tProj = 0.0;
                    if (refractedDir.y < -0.001) {
                        tProj = (-poolDepth - vWorldPosBall.y) / refractedDir.y; 
                    }
                    
                    vec3 projectedPos = vWorldPosBall + refractedDir * tProj;
                    vec2 causticUv = vec2(projectedPos.x, -projectedPos.z) / (poolSize * 1.5) + 0.5;
                    
                    // Smooth fade near the UV boundaries to prevent clamping artifacts
                    float fadeU = smoothstep(0.0, 0.02, causticUv.x) * (1.0 - smoothstep(0.98, 1.0, causticUv.x));
                    float fadeV = smoothstep(0.0, 0.02, causticUv.y) * (1.0 - smoothstep(0.98, 1.0, causticUv.y));
                    float edgeFade = fadeU * fadeV;

                    if (causticUv.x >= 0.0 && causticUv.x <= 1.0 && causticUv.y >= 0.0 && causticUv.y <= 1.0) {
                        // Directional mask ensuring caustics only hit the sunlit side of the geometry
                        float causticMask = max(0.0, dot(normalize(vWorldNormalBall), normalize(-lightDir)));
                        vec3 causticLight = texture2D(tCaustics, causticUv).rgb * edgeFade;
                        
                        gl_FragColor.rgb += causticLight * gl_FragColor.rgb * causticMask * 4.0;
                    }

                    // Volumetric light absorption (Beer-Lambert law approximation)
                    vec3 attenuation = exp(-waterAttenuation * depth * 2.5);
                    gl_FragColor.rgb *= attenuation;
                }
                `
            );
        };

        this.mesh.add(sphere);
    }

    /**
     * Returns the root object of the sphere.
     * @returns {THREE.Group}
     */
    getMesh() {
        return this.mesh;
    }

    /**
     * Returns the positional vector of the mesh.
     * @returns {THREE.Vector3}
     */
    getPosition() {
        return this.mesh.position;
    }
}