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

// Utilities
import { isHardwareAcceleratedWebGLAvailable, renderWebGLFallback } from './utils/webglCheck.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Localization (I18n)
    // Retrieve the user's preferred language from local storage, defaulting to Polish
    const savedLang = localStorage.getItem('appLang') || 'pl';
    const i18n = new I18n(savedLang);

    // Load translation data and initially populate the DOM
    await i18n.loadTranslations(savedLang);

    // 2. Setup Language Switcher UI
    const btnPl = document.getElementById('lang-pl');
    const btnEn = document.getElementById('lang-en');

    // Apply the initial active state to the language toggle buttons
    if (savedLang === 'en') {
        btnEn?.classList.add('active');
        btnPl?.classList.remove('active');
    } else {
        btnPl?.classList.add('active');
        btnEn?.classList.remove('active');
    }

    /**
     * Handles the language switching mechanism.
     * Updates local storage, fetches new translations, and refreshes the UI.
     * @param {string} targetLang - The target language code ('pl' or 'en')
     */
    const switchLanguage = async (targetLang) => {
        if (i18n.lang === targetLang) return; // Prevent redundant network requests and DOM updates

        localStorage.setItem('appLang', targetLang);

        // The loadTranslations method internally handles fetching the JSON and triggering DOM updates
        await i18n.loadTranslations(targetLang);

        // Update active states on the UI buttons
        if (targetLang === 'pl') {
            btnPl?.classList.add('active');
            btnEn?.classList.remove('active');
        } else {
            btnEn?.classList.add('active');
            btnPl?.classList.remove('active');
        }
    };

    // Attach event listeners to the language switch buttons
    btnPl?.addEventListener('click', () => switchLanguage('pl'));
    btnEn?.addEventListener('click', () => switchLanguage('en'));

    // 3. Initialize UI Components and 2D Simulators
    initLightbox();
    initSnellSimulation();
    initLensSimulation();
    initCupSimulation();
    initPrismSimulation();

// 4. Initialize Advanced 3D Caustics and Fluid Simulation Environment
    const container = document.getElementById('three-container');
    if (container) {
        // Hardware acceleration safety gate
        if (!isHardwareAcceleratedWebGLAvailable()) {
            renderWebGLFallback(container);
            i18n.updateDOM();
        } else {
            let app = null;

            // Utilize IntersectionObserver to defer WebGL initialization and halt the render loop when off-screen
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        // The container is entering the viewport (or within the root margin)
                        if (!app) {
                            // Initial intersection: Instantiate the application and pre-warm shaders
                            app = new SimulationApp(container, i18n);
                            app.start();
                        } else {
                            // Subsequent intersections: Resume the main rendering loop
                            app.engine.start();
                        }
                    } else {
                        // The container has exited the viewport
                        if (app && app.engine) {
                            // Halt the requestAnimationFrame loop to conserve GPU/CPU resources
                            app.engine.stop();
                        }
                    }
                });
            }, {
                root: null,          // Observe relative to the browser viewport
                rootMargin: '200px', // Pre-warm threshold to prevent visible stuttering upon scroll arrival
                threshold: 0.0       // Trigger as soon as the margin intersects
            });

            // Commence viewport tracking
            observer.observe(container);
        }
    }
}); // End of DOMContentLoaded listener