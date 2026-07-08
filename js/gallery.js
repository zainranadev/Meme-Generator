/**
 * MemGenie — Gallery UI Controller
 * Handles loading placeholders, grid card rendering, and hover events.
 */
(function () {
    // Keep reference to the DOM gallery container
    let galleryContainer = null;

    /**
     * Renders skeleton loading cards inside the gallery container.
     * @param {number} count Number of skeletons to render.
     */
    function renderSkeletons(count = 12) {
        if (!galleryContainer) return;
        galleryContainer.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const card = document.createElement('div');
            card.className = 'template-card skeleton';
            card.innerHTML = `
                <div class="skeleton-thumb"></div>
                <div class="skeleton-text"></div>
            `;
            galleryContainer.appendChild(card);
        }
    }

    /**
     * Renders template cards in the gallery grid.
     * @param {Array} templates Array of template data objects.
     */
    function renderTemplates(templates) {
        if (!galleryContainer) return;
        galleryContainer.innerHTML = '';

        if (templates.length === 0) {
            galleryContainer.innerHTML = '<div class="no-results">No templates found</div>';
            return;
        }

        templates.forEach(t => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.dataset.id = t.id;
            card.setAttribute('title', t.name);
            card.innerHTML = `
                <div class="template-thumbnail-wrapper">
                    <img src="${t.image}" alt="${t.name}" class="template-thumbnail" loading="lazy">
                </div>
                <div class="template-name">${t.name}</div>
            `;
            galleryContainer.appendChild(card);
        });
    }

    /**
     * Initializes the gallery elements and starts the template load.
     */
    async function initGallery() {
        galleryContainer = document.getElementById('templatesGallery');
        if (!galleryContainer) {
            console.warn('Templates gallery container (#templatesGallery) not found.');
            return;
        }

        // 1. Show skeletons immediately
        renderSkeletons(12);

        // 2. Fetch templates through templates service (wrapped in a small delay to showcase skeleton transition)
        try {
            // Fetch templates
            const templates = await window.MemeTemplates.loadTemplates();
            // Render actual templates
            renderTemplates(templates);
        } catch (err) {
            console.error('Failed to load templates in gallery:', err);
            galleryContainer.innerHTML = '<div class="no-results">Failed to load templates.</div>';
        }
    }

    // Initialize when DOM content is fully loaded
    document.addEventListener('DOMContentLoaded', initGallery);
})();
