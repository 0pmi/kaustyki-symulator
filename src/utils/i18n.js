export class I18n {
    constructor(defaultLang = 'pl') {
        this.lang = defaultLang;
        this.translations = {};
    }

    async loadTranslations(lang) {
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}locales/${lang}.json`);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            this.translations = await response.json();
            this.lang = lang;
            this.updateDOM();
        } catch (error) {
            console.error(`Failed to load language locale: ${lang}`, error);
        }
    }

    updateDOM() {
        // 1. Inject fetched JSON strings into DOM elements
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            const text = key.split('.').reduce((obj, i) => (obj ? obj[i] : null), this.translations);
            if (text) {
                el.innerHTML = text;
            }
        });

        // 2. Trigger KaTeX rendering after DOM update
        this.renderMath();
    }

    renderMath() {
        // Verify if KaTeX library is loaded and globally available
        if (window.renderMathInElement) {
            try {
                // Apply KaTeX only to elements containing injected text
                document.querySelectorAll('[data-i18n]').forEach(el => {
                    window.renderMathInElement(el, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false}
                        ],
                        // Prevent parser errors from halting script execution
                        throwOnError: false
                    });
                });
            } catch (err) {
                console.error("KaTeX rendering error:", err);
            }
        } else {
            // Retry rendering if KaTeX is still loading
            setTimeout(() => this.renderMath(), 100);
        }
    }
}