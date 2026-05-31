import * as THREE from 'three';
import waterVert from '../shaders/water/water.vert';
import waterFrag from '../shaders/water/water.frag';

/**
 * Represents the physical water surface.
 * Manages the high-density geometric grid required for vertex displacement
 * and integrates custom optical shaders with Three.js lighting.
 */
export default class WaterMesh {
    /**
     * @param {number} size - Spatial dimensions of the water plane.
     * @param {number} resolution - Vertex count along one edge. Should ideally match the GPGPU texture resolution for 1:1 displacement mapping.
     */
    constructor(size = 10, resolution = 512) {
        this.size = size;
        this.resolution = resolution;

        this._setupGeometry();
        this._setupMaterial();
        this._setupMesh();
    }

    /**
     * @private
     */
    _setupGeometry() {
        // Generates a high-density grid. The sheer number of vertices is necessary
        // because GPGPU height data displaces individual vertices directly in the vertex shader.
        this.geometry = new THREE.PlaneGeometry(
            this.size,
            this.size,
            this.resolution - 1,
            this.resolution - 1
        );

        // Reorient the plane from the default XY coordinate system to the XZ (ground) plane
        this.geometry.rotateX(-Math.PI / 2);
    }

    /**
     * @private
     */
    _setupMaterial() {
        this.material = new THREE.ShaderMaterial({
            vertexShader: waterVert,
            fragmentShader: waterFrag,
            // Merging standard Three.js lighting uniforms allows the custom shader
            // to react natively to Scene lights while processing optical variables.
            uniforms: THREE.UniformsUtils.merge([
                THREE.UniformsLib['lights'],
                {
                    tHeightMap: { value: null },
                    tNormalMap: { value: null },
                    tTiles: { value: null },
                    tSky: { value: null },
                    tCaustics: { value: null },
                    lightDir: { value: new THREE.Vector3(0, 1, 0) },
                    poolSize: { value: this.size },
                    poolDepth: { value: 4.0 },
                    waterAttenuation: { value: new THREE.Vector3(0.8, 0.2, 0.1) },
                    reflectivity: { value: 0.1 },
                    ior: { value: 1.333 },
                    ambientShadowBase: { value: 0.55 },
                    shadowBlurRadius: { value: 3.5 }
                }
            ]),
            lights: true,
            side: THREE.DoubleSide,
            extensions: {
                // Required for dFdx/dFdy functions in the fragment shader
                derivatives: true
            }
        });
    }

    /**
     * @private
     */
    _setupMesh() {
        this.mesh = new THREE.Mesh(this.geometry, this.material);

        // Disabling frustum culling prevents the mesh from arbitrarily disappearing
        // when the camera looks closely at a displaced wave while the original flat bounding box is off-screen.
        this.mesh.frustumCulled = false;

        this.mesh.receiveShadow = true;
        this.mesh.castShadow = false;
    }

    /**
     * Synchronizes the latest fluid simulation state with the rendering pipeline.
     * @param {THREE.Texture} heightTexture - Float texture dictating vertical vertex displacement.
     * @param {THREE.Texture} normalTexture - RGB texture dictating surface normals for light refraction.
     */
    updateTextures(heightTexture, normalTexture) {
        this.material.uniforms.tHeightMap.value = heightTexture;
        this.material.uniforms.tNormalMap.value = normalTexture;
    }

    /**
     * @returns {THREE.Mesh} The finalized water surface entity.
     */
    getMesh() {
        return this.mesh;
    }
}