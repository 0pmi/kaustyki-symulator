import * as THREE from 'three';

/**
 * Manages the static 3D environment including the pool geometry,
 * physical lighting, and background skybox/HDRI.
 */
export default class Environment {
    /**
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {number} poolSize - Dimensions of the pool floor.
     */
    constructor(scene, poolSize = 10) {
        this.scene = scene;
        this.poolSize = poolSize;

        this._setupLighting();
        this._setupPool();
    }

    _setupLighting() {
        // 1. Ambient Light (Base illumination for shadowed areas)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        // 2. Main Directional Light (The Sun) - Crucial for caustics and specular highlights
        this.sunLight = new THREE.DirectionalLight(0xffffff, 2.5);

        // Position the sun at a specific angle to cast interesting refractions
        this.sunLight.position.set(-5, 10, 5);
        this.sunLight.target.position.set(0, 0, 0);

        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
    }

    _setupPool() {
        // Floor geometry
        const floorGeo = new THREE.PlaneGeometry(this.poolSize, this.poolSize);
        floorGeo.rotateX(-Math.PI / 2); // Lay flat on the XZ plane

        // Standard material - we will replace this with a custom shader later
        // to receive the projected caustics, or load PBR textures into it.
        this.floorMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.8,
            metalness: 0.1
        });

        this.floorMesh = new THREE.Mesh(floorGeo, this.floorMaterial);

        // Shift floor slightly down to give depth to the pool
        this.floorMesh.position.y = -2.0;

        this.scene.add(this.floorMesh);
    }

    /**
     * Utility to load PBR texture maps later.
     */
    async loadPBRTextures(textureLoader, paths) {
        // Implementation for loading baseColor, normal, and roughness maps
        // will be added once the assets are available in the public folder.
    }

    /**
     * Returns the sun's directional vector for external shader calculations.
     * @returns {THREE.Vector3} Normalized light direction.
     */
    getLightDirection() {
        return new THREE.Vector3()
            .subVectors(this.sunLight.target.position, this.sunLight.position)
            .normalize();
    }
}