import './styles/style.css';

// Core Subsystems
import SimulationApp from './core/SimulationApp.js';

// Localization
import { I18n } from './utils/i18n.js';

// UI Components
import { initLightbox } from './ui/lightbox.js';

// 2D Canvas Simulators
import { initSnellSimulation } from './simulators/snell.js';
import { initLensSimulation } from './simulators/lens.js';
import { initCupSimulation } from './simulators/cup.js';
import { initPrismSimulation } from './simulators/prism.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load localization data (Polish by default)
    const i18n = new I18n('pl');
    await i18n.loadTranslations('pl');

    // 2. Initialize UI components and 2D simulators
    initLightbox();
    initSnellSimulation();
    initLensSimulation();
    initCupSimulation();
    initPrismSimulation();

    // 3. Initialize Advanced 3D Caustics and Fluid Simulation Environment
    const container = document.getElementById('three-container');
    if (container) {
        const app = new SimulationApp(container);
        app.start();
    }
});