import * as THREE from 'three';
import waterVert from '../shaders/water/water.vert';
import waterFrag from '../shaders/water/water.frag';

/**
 * Represents the physical water surface.
 * Handles the high-resolution grid geometry and custom shader material.
 */
export default class WaterMesh {
    /**
     * @param {number} size - Spatial dimensions of the water plane.
     * @param {number} resolution - Vertex count along one edge (matches GPGPU resolution ideally).
     */
    constructor(size = 10, resolution = 512) {
        this.size = size;
        this.resolution = resolution;

        this._setupGeometry();
        this._setupMaterial();
        this._setupMesh();
    }

    _setupGeometry() {
        // High density plane for vertex displacement mapping
        this.geometry = new THREE.PlaneGeometry(
            this.size,
            this.size,
            this.resolution - 1,
            this.resolution - 1
        );

        // Rotate to lie perfectly flat on the XZ plane
        this.geometry.rotateX(-Math.PI / 2);
    }

    _setupMaterial() {
        this.material = new THREE.ShaderMaterial({
            vertexShader: waterVert,
            fragmentShader: waterFrag,
            uniforms: {
                tHeightMap: { value: null },
                tNormalMap: { value: null },
                tTiles: { value: null },
                tSky: { value: null },
                poolSize: { value: this.size },
                poolDepth: { value: 4.0 },
                waterAttenuation: { value: new THREE.Vector3(0.8, 0.2, 0.1) },
                reflectivity: { value: 0.1 },
                ior: { value: 1.333 }
            },
            side: THREE.DoubleSide,
            extensions: {
                derivatives: true
            }
        });
    }

    _setupMesh() {
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        // Frustum culling disabled because vertices are displaced in the shader;
        // Three.js CPU bounding box won't match the GPU displaced geometry.
        this.mesh.frustumCulled = false;
    }

    /**
     * Synchronizes simulation textures with the rendering pipeline.
     * @param {THREE.Texture} heightTexture
     * @param {THREE.Texture} normalTexture
     */
    updateTextures(heightTexture, normalTexture) {
        this.material.uniforms.tHeightMap.value = heightTexture;
        this.material.uniforms.tNormalMap.value = normalTexture;
    }

    /**
     * Returns the finalized THREE.Mesh to be added to the scene.
     * @returns {THREE.Mesh}
     */
    getMesh() {
        return this.mesh;
    }
}