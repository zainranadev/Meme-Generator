/**
 * MemGenie — Template Library Data Manager
 * Manages loading templates from JSON, favorites persistence, and queries.
 */
(function () {
    class TemplateLibrary {
        constructor() {
            this.templates = [];
        }

        /**
         * Loads templates from the templates.json file.
         * @returns {Promise<Array>} Resolves to the array of templates.
         */
        async loadTemplates() {
            try {
                const response = await fetch('data/templates.json');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                this.templates = await response.json();
                
                // Initialize favorites from localStorage
                this.syncFavoritesFromStorage();
                
                return this.templates;
            } catch (error) {
                console.error('Error loading template library:', error);
                return [];
            }
        }

        /**
         * Returns all templates.
         * @returns {Array}
         */
        getAll() {
            return this.templates;
        }

        /**
         * Finds a template by its ID.
         * @param {number|string} id 
         * @returns {Object|undefined}
         */
        getById(id) {
            const numericId = parseInt(id, 10);
            return this.templates.find(t => t.id === numericId);
        }

        /**
         * Returns templates filtered by category.
         * @param {string} category 
         * @returns {Array}
         */
        getByCategory(category) {
            if (!category || category === 'All' || category.toLowerCase() === 'all') {
                return this.getAll();
            }
            return this.templates.filter(t => t.category.toLowerCase() === category.toLowerCase());
        }

        /**
         * Syncs favorite status of templates using localStorage keys.
         */
        syncFavoritesFromStorage() {
            try {
                const storedFavorites = JSON.parse(localStorage.getItem('memegenie_favorites') || '[]');
                const favSet = new Set(storedFavorites.map(id => parseInt(id, 10)));
                this.templates.forEach(t => {
                    t.favorite = favSet.has(t.id);
                });
            } catch (e) {
                console.error('Failed to sync favorites from localStorage:', e);
            }
        }
    }

    // Expose the instantiated library instance globally
    window.MemeTemplates = new TemplateLibrary();
})();
