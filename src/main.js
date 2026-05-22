import './styles/style.css';

// Localization
import { I18n } from './utils/i18n.js';

// UI Components
import { initLightbox } from './ui/lightbox.js';

// Simulators
import { initSnellSimulation } from './simulators/snell.js';
import { initLensSimulation } from './simulators/lens.js';
import { initCupSimulation } from './simulators/cup.js';
import { initPrismSimulation } from './simulators/prism.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load localization data (Polish by default)
    const i18n = new I18n('pl');
    await i18n.loadTranslations('pl');

    // 2. Initialize UI components
    initLightbox();

    // 3. Initialize 2D canvas simulators
    initSnellSimulation();
    initLensSimulation();
    initCupSimulation();
    initPrismSimulation();
});