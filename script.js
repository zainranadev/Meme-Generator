(function () {
    const FONT_FAMILIES = [
        'Anton',
        'Impact',
        'Bebas Neue',
        'Oswald',
        'Archivo Black',
        'Poppins',
        'Inter',
        'Montserrat',
        'Roboto Condensed',
        'Bangers',
        'Luckiest Guy',
        'Permanent Marker',
        'Caveat',
        'Shrikhand',
        'Anton SC',
        'Passion One',
        'Fjalla One',
        'JetBrains Mono',
        'Playfair Display',
        'Rubik Mono One'
    ];

    const canvas = document.getElementById('memeCanvas');
    const ctx = canvas.getContext('2d');
    const emptyHint = document.getElementById('emptyHint');

    let baseImage = null;
    let layers = []; // {id, type:'text'|'emoji', text, x, y, fontSize, color, bold, stroke, caps, rotation}
    let selectedId = null;
    let idCounter = 1;

    let filters = { grayscale: 0, invert: 0, brightness: 100, contrast: 100 };

    const CANVAS_SIZE = 600;

    // ---------- Rendering ----------
    function render() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.filter = `grayscale(${filters.grayscale}%) invert(${filters.invert}%) brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;

        if (baseImage) {
            drawImageCover(baseImage);
        } else {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // subtle grid to indicate blank canvas
            ctx.strokeStyle = '#232323';
            ctx.lineWidth = 1;
            for (let i = 0; i < canvas.width; i += 30) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
            }
            for (let j = 0; j < canvas.height; j += 30) {
                ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke();
            }
        }

        ctx.filter = 'none';

        layers.forEach(layer => drawLayer(layer));

        emptyHint.style.display = (baseImage || layers.length) ? 'none' : 'block';
    }

    function drawImageCover(img) {
        const cw = canvas.width, ch = canvas.height;
        const ir = img.width / img.height;
        const cr = cw / ch;
        let sx, sy, sw, sh;
        if (ir > cr) {
            sh = img.height; sw = sh * cr;
            sx = (img.width - sw) / 2; sy = 0;
        } else {
            sw = img.width; sh = sw / cr;
            sx = 0; sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    }

    function drawLayer(layer) {
        ctx.save();
        ctx.translate(layer.x, layer.y);
        ctx.rotate(layer.rotation * Math.PI / 180);

        const displayText = layer.caps ? layer.text.toUpperCase() : layer.text;
        const fontFamily = layer.type === 'emoji' ? 'sans-serif' : `'${layer.fontFamily || 'Anton'}', sans-serif`;
        ctx.font = `${layer.bold ? '700' : '400'} ${layer.fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lines = displayText.split('\n');
        const lineHeight = layer.fontSize * 1.05;
        const totalH = lines.length * lineHeight;

        lines.forEach((line, i) => {
            const ly = -totalH / 2 + lineHeight / 2 + i * lineHeight;
            if (layer.type !== 'emoji' && layer.stroke) {
                ctx.lineWidth = Math.max(2, layer.fontSize / 14);
                ctx.strokeStyle = '#000000';
                ctx.lineJoin = 'round';
                ctx.miterLimit = 2;
                ctx.strokeText(line, 0, ly);
            }
            ctx.fillStyle = layer.color;
            ctx.fillText(line, 0, ly);
        });

        // selection box
        if (layer.id === selectedId) {
            const metrics = lines.map(l => ctx.measureText(l).width);
            const w = Math.max(...metrics, 20) + 20;
            const h = totalH + 16;
            ctx.strokeStyle = '#ffffff';
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-w / 2, -h / 2, w, h);
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    function layerBounds(layer) {
        ctx.save();
        ctx.font = `${layer.bold ? '700' : '400'} ${layer.fontSize}px '${layer.fontFamily || 'Anton'}', sans-serif`;
        const displayText = layer.caps ? layer.text.toUpperCase() : layer.text;
        const lines = displayText.split('\n');
        const widths = lines.map(l => ctx.measureText(l).width);
        const w = Math.max(...widths, 20) + 20;
        const h = lines.length * layer.fontSize * 1.05 + 16;
        ctx.restore();
        return { w, h };
    }

    function hitTest(px, py) {
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            const { w, h } = layerBounds(layer);
            // simple rotation-aware hit test: transform point into layer space
            const dx = px - layer.x, dy = py - layer.y;
            const rad = -layer.rotation * Math.PI / 180;
            const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
            const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
            if (Math.abs(rx) <= w / 2 && Math.abs(ry) <= h / 2) {
                return layer;
            }
        }
        return null;
    }

    // ---------- Layer creation ----------
    function addTextLayer(text, x, y, fontSize) {
        const layer = {
            id: idCounter++,
            type: 'text',
            text,
            x, y,
            fontSize: fontSize || 46,
            fontFamily: 'Anton',
            color: '#ffffff',
            bold: false,
            stroke: true,
            caps: true,
            rotation: 0
        };
        layers.push(layer);
        selectLayer(layer.id);
        render();
        refreshLayerList();
    }

    function addEmojiLayer(emoji) {
        const layer = {
            id: idCounter++,
            type: 'emoji',
            text: emoji,
            x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2,
            fontSize: 64,
            color: '#ffffff',
            bold: false,
            stroke: false,
            caps: false,
            rotation: 0
        };
        layers.push(layer);
        selectLayer(layer.id);
        render();
        refreshLayerList();
    }

    function deleteLayer(id) {
        layers = layers.filter(l => l.id !== id);
        if (selectedId === id) selectedId = null;
        render();
        refreshLayerList();
    }

    function selectLayer(id) {
        selectedId = id;
        render();
        refreshLayerList();
        syncEditor();
    }

    // ---------- UI: layer list ----------
    const layerList = document.getElementById('layerList');
    function refreshLayerList() {
        if (layers.length === 0) {
            layerList.innerHTML = '<div class="no-layers">No layers yet.<br>Add text or a sticker to get started.</div>';
            document.getElementById('selectedEditor').style.display = 'none';
            return;
        }
        layerList.innerHTML = '';
        layers.forEach(layer => {
            const item = document.createElement('div');
            item.className = 'layer-item' + (layer.id === selectedId ? ' selected' : '');
            item.innerHTML = `
        <div class="layer-item-top">
          <span class="layer-name">${layer.type === 'emoji' ? '🏷 Sticker' : '✎ Text'} #${layer.id}</span>
          <button class="layer-del" data-id="${layer.id}">✕</button>
        </div>
        <div class="layer-preview">${(layer.text || '').replace(/\n/g, ' ') || '(empty)'}</div>
      `;
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('layer-del')) return;
                selectLayer(layer.id);
            });
            item.querySelector('.layer-del').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteLayer(layer.id);
            });
            layerList.appendChild(item);
        });
        document.getElementById('selectedEditor').style.display = selectedId !== null ? 'block' : 'none';
    }

    // ---------- Editor sync ----------
    const editContent = document.getElementById('editContent');
    const fontSizeRange = document.getElementById('fontSizeRange');
    const fontSizeVal = document.getElementById('fontSizeVal');
    const rotationRange = document.getElementById('rotationRange');
    const rotationVal = document.getElementById('rotationVal');
    const customColor = document.getElementById('customColor');
    const toggleBold = document.getElementById('toggleBold');
    const toggleStroke = document.getElementById('toggleStroke');
    const toggleCaps = document.getElementById('toggleCaps');
    const colorSwatches = document.getElementById('colorSwatches');
    const fontFamilySelect = document.getElementById('fontFamilySelect');

    // Populate font family dropdown with live font previews
    FONT_FAMILIES.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        opt.style.fontFamily = `'${f}', sans-serif`;
        fontFamilySelect.appendChild(opt);
    });
    fontFamilySelect.addEventListener('change', () => {
        const layer = getSelected(); if (!layer) return;
        layer.fontFamily = fontFamilySelect.value;
        render(); syncEditor();
    });

    const PALETTE = [
        // grayscale
        '#ffffff', '#e5e5e5', '#d4d4d4', '#b5b5b5', '#8a8a8a', '#5c5c5c', '#2e2e2e', '#000000',
        // reds
        '#ff3b3b', '#e01e37', '#b0000f', '#7a0d0d',
        // oranges
        '#ff8c3d', '#f0691f', '#d9541a', '#b0430f',
        // yellows
        '#fff176', '#ffd93d', '#ffb800', '#e6a400',
        // greens
        '#b6ff5c', '#7ed957', '#3fae44', '#1e6b2e', '#0d3b13',
        // teals / cyans
        '#5cf0e0', '#26c6c2', '#0e8f8c', '#065450',
        // blues
        '#5cb8ff', '#3080f0', '#1a56b0', '#0d2f66',
        // purples
        '#c98cff', '#9c4dff', '#6a1fbd', '#3d0e6e',
        // pinks / magentas
        '#ff8cd9', '#ff4dc4', '#e0189a', '#99005c',
        // browns / earth tones
        '#c9a066', '#a5713e', '#7a4a24', '#4d2e14',
        // pastels (for a softer meme style)
        '#ffe0e0', '#fff3d6', '#e0ffe0', '#d6f5ff', '#e6d6ff', '#ffd6ec',
        // metallics / accents
        '#ffd700', '#c0c0c0', '#cd7f32'
    ];
    // Expose palette for the draw-tools module script
    window.MemeGenie_PALETTE = PALETTE;
    window.MEMEFORGE_PALETTE = PALETTE;
    PALETTE.forEach(c => {
        const sw = document.createElement('div');
        sw.className = 'swatch';
        sw.style.background = c;
        sw.dataset.color = c;
        sw.addEventListener('click', () => {
            const layer = getSelected();
            if (!layer) return;
            layer.color = c;
            render(); refreshLayerList(); syncEditor();
        });
        colorSwatches.appendChild(sw);
    });

    function getSelected() { return layers.find(l => l.id === selectedId); }

    function syncEditor() {
        const layer = getSelected();
        const toolbarControls = document.getElementById('toolbarColorControls');
        const toolbarPlaceholder = document.getElementById('toolbarColorPlaceholder');
        const hexVal = document.getElementById('customColorHex');

        if (!layer) {
            document.getElementById('selectedEditor').style.display = 'none';
            if (toolbarControls) toolbarControls.style.display = 'none';
            if (toolbarPlaceholder) toolbarPlaceholder.style.display = 'block';
            return;
        }
        document.getElementById('selectedEditor').style.display = 'block';
        if (toolbarControls) toolbarControls.style.display = 'block';
        if (toolbarPlaceholder) toolbarPlaceholder.style.display = 'none';

        editContent.value = layer.text;
        fontSizeRange.value = layer.fontSize;
        fontSizeVal.textContent = layer.fontSize + 'px';
        rotationRange.value = layer.rotation;
        rotationVal.textContent = layer.rotation + '°';

        const colVal = layer.color.length === 7 ? layer.color : '#ffffff';
        customColor.value = colVal;
        if (hexVal) hexVal.textContent = colVal.toUpperCase();

        toggleBold.classList.toggle('active', layer.bold);
        toggleStroke.classList.toggle('active', layer.stroke);
        toggleCaps.classList.toggle('active', layer.caps);
        fontFamilySelect.value = layer.fontFamily || 'Anton';
        fontFamilySelect.style.fontFamily = `'${layer.fontFamily || 'Anton'}', sans-serif`;
        [...colorSwatches.children].forEach(sw => {
            sw.classList.toggle('active', sw.dataset.color === layer.color);
        });
    }

    editContent.addEventListener('input', () => {
        const layer = getSelected(); if (!layer) return;
        layer.text = editContent.value;
        render(); refreshLayerList();
    });
    fontSizeRange.addEventListener('input', () => {
        const layer = getSelected(); if (!layer) return;
        layer.fontSize = parseInt(fontSizeRange.value);
        fontSizeVal.textContent = layer.fontSize + 'px';
        render();
    });
    rotationRange.addEventListener('input', () => {
        const layer = getSelected(); if (!layer) return;
        layer.rotation = parseInt(rotationRange.value);
        rotationVal.textContent = layer.rotation + '°';
        render();
    });
    customColor.addEventListener('input', () => {
        const layer = getSelected(); if (!layer) return;
        layer.color = customColor.value;
        render(); syncEditor();
    });
    toggleBold.addEventListener('click', () => {
        const layer = getSelected(); if (!layer) return;
        layer.bold = !layer.bold; render(); syncEditor();
    });
    toggleStroke.addEventListener('click', () => {
        const layer = getSelected(); if (!layer) return;
        layer.stroke = !layer.stroke; render(); syncEditor();
    });
    toggleCaps.addEventListener('click', () => {
        const layer = getSelected(); if (!layer) return;
        layer.caps = !layer.caps; render(); syncEditor();
    });

    // ---------- Canvas drag ----------
    let dragging = null, dragOffset = { x: 0, y: 0 };

    function getCanvasPos(evt) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
        const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function pointerDown(evt) {
        const pos = getCanvasPos(evt);
        const hit = hitTest(pos.x, pos.y);
        if (hit) {
            dragging = hit;
            dragOffset.x = pos.x - hit.x;
            dragOffset.y = pos.y - hit.y;
            selectLayer(hit.id);
            canvas.classList.add('dragging');
        } else {
            selectedId = null;
            render(); refreshLayerList();
        }
    }
    function pointerMove(evt) {
        if (!dragging) return;
        const pos = getCanvasPos(evt);
        dragging.x = Math.min(Math.max(pos.x - dragOffset.x, 0), canvas.width);
        dragging.y = Math.min(Math.max(pos.y - dragOffset.y, 0), canvas.height);
        render();
    }
    function pointerUp() {
        dragging = null;
        canvas.classList.remove('dragging');
    }

    canvas.addEventListener('mousedown', pointerDown);
    canvas.addEventListener('mousemove', pointerMove);
    window.addEventListener('mouseup', pointerUp);
    canvas.addEventListener('touchstart', pointerDown, { passive: true });
    canvas.addEventListener('touchmove', pointerMove, { passive: true });
    window.addEventListener('touchend', pointerUp);

    // ---------- Image upload ----------
    const fileInput = document.getElementById('fileInput');
    document.getElementById('uploadBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => { baseImage = img; render(); };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('blankCanvasBtn').addEventListener('click', () => {
        baseImage = null; render();
    });

    document.getElementById('clearAllBtn').addEventListener('click', () => {
        baseImage = null;
        layers = [];
        selectedId = null;
        filters = { grayscale: 0, invert: 0, brightness: 100, contrast: 100 };
        syncFilterUI();
        render(); refreshLayerList();
    });

    // ---------- Quick text ----------
    document.getElementById('addTopBtn').addEventListener('click', () => {
        addTextLayer('TOP TEXT', CANVAS_SIZE / 2, 60, 48);
    });
    document.getElementById('addBottomBtn').addEventListener('click', () => {
        addTextLayer('BOTTOM TEXT', CANVAS_SIZE / 2, CANVAS_SIZE - 60, 48);
    });
    document.getElementById('addCustomTextBtn').addEventListener('click', () => {
        addTextLayer('New text', CANVAS_SIZE / 2, CANVAS_SIZE / 2, 40);
    });

    const SURPRISE_LINES = [
        "WHEN THE\nCODE FINALLY WORKS",
        "NOBODY:\nABSOLUTELY NOBODY:",
        "ME EXPLAINING\nWHY IT'S NOT A BUG",
        "THAT ONE\nFRIEND, THOUGH",
        "MONDAY\nHAS ENTERED THE CHAT",
        "PLOT TWIST:\nIT WAS A SEMICOLON"
    ];
    document.getElementById('surpriseBtn').addEventListener('click', () => {
        const line = SURPRISE_LINES[Math.floor(Math.random() * SURPRISE_LINES.length)];
        addTextLayer(line, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 40);
    });

    // ---------- Emoji grid ----------
    const EMOJIS = ['😂', '💀', '🔥', '😭', '👀', '💯', '🤡', '😎', '🫠', '🥶', '🤔', '🙌', '😳', '⚡', '🖤', '🩶'];
    const emojiGrid = document.getElementById('emojiGrid');
    EMOJIS.forEach(e => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = e;
        btn.addEventListener('click', () => addEmojiLayer(e));
        emojiGrid.appendChild(btn);
    });

    // ---------- Filters ----------
    const grayscaleRange = document.getElementById('grayscaleRange');
    const invertRange = document.getElementById('invertRange');
    const brightnessRange = document.getElementById('brightnessRange');
    const contrastRange = document.getElementById('contrastRange');

    function syncFilterUI() {
        grayscaleRange.value = filters.grayscale;
        invertRange.value = filters.invert;
        brightnessRange.value = filters.brightness;
        contrastRange.value = filters.contrast;
        document.getElementById('grayscaleVal').textContent = filters.grayscale + '%';
        document.getElementById('invertVal').textContent = filters.invert + '%';
        document.getElementById('brightnessVal').textContent = filters.brightness + '%';
        document.getElementById('contrastVal').textContent = filters.contrast + '%';
    }

    grayscaleRange.addEventListener('input', () => { filters.grayscale = +grayscaleRange.value; syncFilterUI(); render(); });
    invertRange.addEventListener('input', () => { filters.invert = +invertRange.value; syncFilterUI(); render(); });
    brightnessRange.addEventListener('input', () => { filters.brightness = +brightnessRange.value; syncFilterUI(); render(); });
    contrastRange.addEventListener('input', () => { filters.contrast = +contrastRange.value; syncFilterUI(); render(); });

    document.getElementById('fullGrayBtn').addEventListener('click', () => {
        filters = { grayscale: 100, invert: 0, brightness: 105, contrast: 115 };
        syncFilterUI(); render();
    });
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
        filters = { grayscale: 0, invert: 0, brightness: 100, contrast: 100 };
        syncFilterUI(); render();
    });

    // ---------- Download ----------
    document.getElementById('downloadBtn').addEventListener('click', () => {
        const prevSelected = selectedId;
        selectedId = null; // hide selection box for export
        render();
        const link = document.createElement('a');
        link.download = 'MemeGenie-export.png';

        // Composite the draw overlay (if any) onto the exported image
        const overlay = document.getElementById('drawOverlay');
        if (overlay) {
            const tmp = document.createElement('canvas');
            tmp.width = canvas.width;
            tmp.height = canvas.height;
            const tctx = tmp.getContext('2d');
            tctx.drawImage(canvas, 0, 0);
            tctx.drawImage(overlay, 0, 0);
            link.href = tmp.toDataURL('image/png');
        } else {
            link.href = canvas.toDataURL('image/png');
        }

        link.click();
        selectedId = prevSelected;
        render();
    });

    // ---------- Init ----------
    // Preload all font families so canvas renders correctly
    Promise.all(
        FONT_FAMILIES.map(f => document.fonts.load(`400 46px '${f}'`).catch(() => { }))
    ).then(render).catch(render);
    syncFilterUI();
    render();
})();



const tabs = document.querySelectorAll(".toolbar-tab");

const contents = document.querySelectorAll(".tab-content");

tabs.forEach(tab => {

    tab.addEventListener("click", () => {

        tabs.forEach(t => t.classList.remove("active"));

        contents.forEach(c => c.classList.remove("active"));

        tab.classList.add("active");

        document
            .getElementById(tab.dataset.tab)
            .classList.add("active");

    });

});