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

    const PALETTE = [
        '#ffffff', '#e5e5e5', '#d4d4d4', '#b5b5b5', '#8a8a8a', '#5c5c5c', '#2e2e2e', '#000000',
        '#ff3b3b', '#e01e37', '#b0000f', '#7a0d0d',
        '#ff8c3d', '#f0691f', '#d9541a', '#b0430f',
        '#fff176', '#ffd93d', '#ffb800', '#e6a400',
        '#b6ff5c', '#7ed957', '#3fae44', '#1e6b2e', '#0d3b13',
        '#5cf0e0', '#26c6c2', '#0e8f8c', '#065450',
        '#5cb8ff', '#3080f0', '#1a56b0', '#0d2f66',
        '#c98cff', '#9c4dff', '#6a1fbd', '#3d0e6e',
        '#ff8cd9', '#ff4dc4', '#e0189a', '#99005c',
        '#c9a066', '#a5713e', '#7a4a24', '#4d2e14',
        '#ffe0e0', '#fff3d6', '#e0ffe0', '#d6f5ff', '#e6d6ff', '#ffd6ec',
        '#ffd700', '#c0c0c0', '#cd7f32'
    ];

    const canvas = document.getElementById('memeCanvas');
    const ctx = canvas.getContext('2d');
    const emptyHint = document.getElementById('emptyHint');

    let baseVideo = null;
    let layers = []; // {id, type:'text'|'emoji', text, x, y, fontSize, fontFamily, color, bold, stroke, caps, rotation}
    let selectedId = null;
    let idCounter = 1;

    let filters = { grayscale: 0, invert: 0, brightness: 100, contrast: 100 };

    let trimStart = 0;
    let trimEnd = 0;
    let isPlaying = false;
    let isExporting = false;

    // Offscreen canvas for draw overlay
    const drawCanvas = document.createElement('canvas');
    drawCanvas.width = canvas.width;
    drawCanvas.height = canvas.height;
    const drawCtx = drawCanvas.getContext('2d');

    let activeTool = 'none'; // 'pen', 'pencil', 'highlighter', 'blur'
    let drawColor = '#ff3b3b';
    let drawSize = 6;
    let drawOpacity = 1.0;
    let drawSnapshots = [];
    let isDrawing = false;
    let lastX = 0, lastY = 0;

    // Hidden video element
    const videoEl = document.createElement('video');
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    videoEl.muted = false;

    // ---------- Drawing logic on the offscreen canvas ----------
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

    function applyBrushStyle(c) {
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.filter = 'none';
        c.globalCompositeOperation = 'source-over';

        switch (activeTool) {
            case 'pen':
                c.globalAlpha = drawOpacity;
                c.strokeStyle = drawColor;
                c.fillStyle = drawColor;
                c.lineWidth = drawSize;
                break;
            case 'pencil':
                c.globalAlpha = Math.min(drawOpacity * 0.55, 0.55);
                c.strokeStyle = drawColor;
                c.fillStyle = drawColor;
                c.lineWidth = Math.max(1, drawSize * 0.55);
                break;
            case 'highlighter':
                c.globalAlpha = Math.min(drawOpacity * 0.38, 0.38);
                c.strokeStyle = drawColor;
                c.fillStyle = drawColor;
                c.lineWidth = drawSize * 3;
                c.lineCap = 'square';
                break;
            default:
                c.globalAlpha = drawOpacity;
                c.strokeStyle = drawColor;
                c.fillStyle = drawColor;
                c.lineWidth = drawSize;
        }
    }

    function drawDot(x, y) {
        drawCtx.save();
        applyBrushStyle(drawCtx);
        const r = drawCtx.lineWidth / 2;
        drawCtx.beginPath();
        drawCtx.arc(x, y, Math.max(r, 0.5), 0, Math.PI * 2);
        drawCtx.fill();
        drawCtx.restore();
    }

    function drawLine(x1, y1, x2, y2) {
        drawCtx.save();
        applyBrushStyle(drawCtx);
        drawCtx.beginPath();
        drawCtx.moveTo(x1, y1);
        drawCtx.lineTo(x2, y2);
        drawCtx.stroke();
        drawCtx.restore();
    }

    function applyBlurFilter(cx, cy) {
        const r = drawSize * 3;
        const pixSize = Math.max(4, Math.floor(drawSize / 1.5));
        const sx = Math.max(0, Math.floor(cx - r));
        const sy = Math.max(0, Math.floor(cy - r));
        const sw = Math.min(canvas.width - sx, Math.ceil(r * 2));
        const sh = Math.min(canvas.height - sy, Math.ceil(r * 2));
        if (sw <= 0 || sh <= 0) return;

        // Build temporary canvas with video + layers + drawing
        const tmp = document.createElement('canvas');
        tmp.width = sw;
        tmp.height = sh;
        const tctx = tmp.getContext('2d');

        // Draw current state from main canvas
        tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        // Downscale
        const pixW = Math.max(1, Math.ceil(sw / pixSize));
        const pixH = Math.max(1, Math.ceil(sh / pixSize));
        const small = document.createElement('canvas');
        small.width = pixW;
        small.height = pixH;
        const sctx = small.getContext('2d');
        sctx.imageSmoothingEnabled = true;
        sctx.drawImage(tmp, 0, 0, pixW, pixH);

        // Upscale
        tctx.clearRect(0, 0, sw, sh);
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(small, 0, 0, sw, sh);

        // Draw clipped back to offscreen drawCanvas
        drawCtx.save();
        drawCtx.beginPath();
        drawCtx.arc(cx, cy, r, 0, Math.PI * 2);
        drawCtx.clip();
        drawCtx.globalAlpha = Math.min(drawOpacity * 0.95, 1);
        drawCtx.drawImage(tmp, 0, 0, sw, sh, sx, sy, sw, sh);
        drawCtx.restore();
    }

    function saveDrawSnapshot() {
        drawSnapshots.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    }

    // ---------- Rendering ----------
    function render() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Filters applied to base track
        ctx.filter = `grayscale(${filters.grayscale}%) invert(${filters.invert}%) brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;

        if (baseVideo) {
            drawVideoCover(videoEl);
        } else {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // grid
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

        // Draw normal layers
        layers.forEach(layer => drawLayer(layer));

        // Draw the static drawing overlay on top
        ctx.drawImage(drawCanvas, 0, 0);

        emptyHint.style.display = (baseVideo || layers.length) ? 'none' : 'block';
    }

    function drawVideoCover(video) {
        const cw = canvas.width, ch = canvas.height;
        const vr = video.videoWidth / video.videoHeight;
        const cr = cw / ch;
        let sx, sy, sw, sh;
        if (vr > cr) {
            sh = video.videoHeight; sw = sh * cr;
            sx = (video.videoWidth - sw) / 2; sy = 0;
        } else {
            sw = video.videoWidth; sh = sw / cr;
            sx = 0; sy = (video.videoHeight - sh) / 2;
        }
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
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

    // ---------- Layer hit test ----------
    function hitTest(px, py) {
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            const { w, h } = layerBounds(layer);
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
            fontSize: fontSize || 32,
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
            x: canvas.width / 2, y: canvas.height / 2,
            fontSize: 48,
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

    // ---------- Canvas drag & draw dispatch ----------
    let dragging = null, dragOffset = { x: 0, y: 0 };

    function pointerDown(evt) {
        const pos = getCanvasPos(evt);

        if (activeTool !== 'none') {
            isDrawing = true;
            saveDrawSnapshot();
            lastX = pos.x;
            lastY = pos.y;
            if (activeTool === 'blur') {
                applyBlurFilter(pos.x, pos.y);
            } else {
                drawDot(pos.x, pos.y);
            }
            render();
            return;
        }

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
        const pos = getCanvasPos(evt);

        if (activeTool !== 'none') {
            if (!isDrawing) return;
            if (activeTool === 'blur') {
                applyBlurFilter(pos.x, pos.y);
            } else {
                drawLine(lastX, lastY, pos.x, pos.y);
            }
            lastX = pos.x;
            lastY = pos.y;
            render();
            return;
        }

        if (!dragging) return;
        dragging.x = Math.min(Math.max(pos.x - dragOffset.x, 0), canvas.width);
        dragging.y = Math.min(Math.max(pos.y - dragOffset.y, 0), canvas.height);
        render();
    }

    function pointerUp() {
        isDrawing = false;
        dragging = null;
        canvas.classList.remove('dragging');
    }

    canvas.addEventListener('mousedown', pointerDown);
    canvas.addEventListener('mousemove', pointerMove);
    window.addEventListener('mouseup', pointerUp);
    canvas.addEventListener('touchstart', pointerDown, { passive: false });
    canvas.addEventListener('touchmove', pointerMove, { passive: false });
    window.addEventListener('touchend', pointerUp);

    // ---------- Draw controls panel wiring ----------
    const drawSwatchContainer = document.getElementById('drawColorSwatches');
    let activeDrawHex = PALETTE[8]; // default red
    
    PALETTE.slice(0, 16).forEach(hex => {
        const sw = document.createElement('div');
        sw.className = 'swatch' + (hex === activeDrawHex ? ' active' : '');
        sw.style.background = hex;
        sw.addEventListener('click', () => {
            drawSwatchContainer.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            drawColor = hex;
            activeDrawHex = hex;
        });
        drawSwatchContainer.appendChild(sw);
    });

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const wasActive = btn.classList.contains('active');
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            if (wasActive) {
                activeTool = 'none';
            } else {
                btn.classList.add('active');
                activeTool = btn.dataset.tool;
            }
        });
    });

    document.getElementById('brushSizeRange').addEventListener('input', e => {
        drawSize = Number(e.target.value);
        document.getElementById('brushSizeVal').textContent = e.target.value + 'px';
    });

    document.getElementById('brushOpacityRange').addEventListener('input', e => {
        drawOpacity = Number(e.target.value) / 100;
        document.getElementById('brushOpacityVal').textContent = e.target.value + '%';
    });

    document.getElementById('undoStrokeBtn').addEventListener('click', () => {
        if (!drawSnapshots.length) return;
        drawCtx.putImageData(drawSnapshots.pop(), 0, 0);
        render();
    });

    document.getElementById('clearStrokesBtn').addEventListener('click', () => {
        drawSnapshots = [];
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        render();
    });

    // ---------- Video setup & playback loops ----------
    const playPauseBtn = document.getElementById('playPauseBtn');
    const muteBtn = document.getElementById('muteBtn');
    const timeDisplay = document.getElementById('timeDisplay');
    const seekBar = document.getElementById('seekBar');
    const trimStartRange = document.getElementById('trimStartRange');
    const trimEndRange = document.getElementById('trimEndRange');
    const trimTrackFill = document.getElementById('trimTrackFill');
    const trimValues = document.getElementById('trimValues');

    function formatTime(s) {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    videoEl.addEventListener('loadedmetadata', () => {
        baseVideo = videoEl;
        trimStart = 0;
        trimEnd = videoEl.duration;

        seekBar.max = videoEl.duration;
        trimStartRange.max = videoEl.duration;
        trimEndRange.max = videoEl.duration;
        trimStartRange.value = 0;
        trimEndRange.value = videoEl.duration;

        updatePlaybackTimeUI();
        updateTrimUI();
        render();
    });

    videoEl.addEventListener('timeupdate', () => {
        if (isExporting) return;
        if (videoEl.currentTime < trimStart) {
            videoEl.currentTime = trimStart;
        }
        if (videoEl.currentTime >= trimEnd) {
            videoEl.currentTime = trimStart;
            if (videoEl.paused) {
                isPlaying = false;
                playPauseBtn.textContent = '▶';
            }
        }
        seekBar.value = videoEl.currentTime;
        updatePlaybackTimeUI();
    });

    function updatePlaybackTimeUI() {
        timeDisplay.textContent = formatTime(videoEl.currentTime) + ' / ' + formatTime(videoEl.duration || 0);
    }

    function updateTrimUI() {
        const dur = videoEl.duration || 1;
        const sp = (trimStart / dur) * 100;
        const ep = (trimEnd / dur) * 100;
        trimTrackFill.style.left = sp + '%';
        trimTrackFill.style.width = (ep - sp) + '%';
        trimValues.textContent = trimStart.toFixed(1) + 's - ' + trimEnd.toFixed(1) + 's';
    }

    playPauseBtn.addEventListener('click', () => {
        if (!baseVideo) return;
        if (videoEl.paused) {
            videoEl.play();
            playPauseBtn.textContent = '⏸';
            isPlaying = true;
        } else {
            videoEl.pause();
            playPauseBtn.textContent = '▶';
            isPlaying = false;
        }
    });

    document.getElementById('rewindBtn').addEventListener('click', () => {
        if (!baseVideo) return;
        videoEl.currentTime = Math.max(trimStart, videoEl.currentTime - 5);
    });

    seekBar.addEventListener('input', () => {
        if (!baseVideo) return;
        videoEl.currentTime = Number(seekBar.value);
        updatePlaybackTimeUI();
        render();
    });

    muteBtn.addEventListener('click', () => {
        videoEl.muted = !videoEl.muted;
        muteBtn.textContent = videoEl.muted ? '🔇' : '🔊';
    });

    trimStartRange.addEventListener('input', () => {
        if (!baseVideo) return;
        const val = Number(trimStartRange.value);
        if (val >= trimEnd - 0.5) {
            trimStartRange.value = trimEnd - 0.5;
            trimStart = trimEnd - 0.5;
        } else {
            trimStart = val;
        }
        if (videoEl.currentTime < trimStart) {
            videoEl.currentTime = trimStart;
        }
        updateTrimUI();
        render();
    });

    trimEndRange.addEventListener('input', () => {
        if (!baseVideo) return;
        const val = Number(trimEndRange.value);
        if (val <= trimStart + 0.5) {
            trimEndRange.value = trimStart + 0.5;
            trimEnd = trimStart + 0.5;
        } else {
            trimEnd = val;
        }
        if (videoEl.currentTime > trimEnd) {
            videoEl.currentTime = trimStart;
        }
        updateTrimUI();
        render();
    });

    // High frequency tick loop for live rendering
    function tick() {
        if (baseVideo && !videoEl.paused && !videoEl.ended && !isExporting) {
            render();
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // ---------- Image / Video Upload ----------
    const fileInput = document.getElementById('fileInput');
    document.getElementById('uploadBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        videoEl.src = url;
        videoEl.load();
    });

    document.getElementById('clearAllBtn').addEventListener('click', () => {
        baseVideo = null;
        videoEl.src = '';
        layers = [];
        selectedId = null;
        filters = { grayscale: 0, invert: 0, brightness: 100, contrast: 100 };
        drawSnapshots = [];
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        syncFilterUI();
        render();
        refreshLayerList();
    });

    // ---------- Quick Text Toggles ----------
    document.getElementById('addTopBtn').addEventListener('click', () => {
        addTextLayer('TOP TEXT', canvas.width / 2, 45, 32);
    });
    document.getElementById('addBottomBtn').addEventListener('click', () => {
        addTextLayer('BOTTOM TEXT', canvas.width / 2, canvas.height - 45, 32);
    });
    document.getElementById('addCustomTextBtn').addEventListener('click', () => {
        addTextLayer('New text', canvas.width / 2, canvas.height / 2, 28);
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
        addTextLayer(line, canvas.width / 2, canvas.height / 2, 28);
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

    // ---------- Filter Handlers ----------
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

    // ---------- WebM Exporter via MediaRecorder ----------
    const downloadBtn = document.getElementById('downloadBtn');
    const exportProgress = document.getElementById('exportProgress');

    downloadBtn.addEventListener('click', () => {
        if (!baseVideo) {
            alert('Please upload a video first.');
            return;
        }

        // Setup exporting state
        isExporting = true;
        videoEl.pause();
        playPauseBtn.textContent = '▶';
        isPlaying = false;
        
        // Hide selection box
        const prevSelected = selectedId;
        selectedId = null;

        videoEl.currentTime = trimStart;
        
        // Capture canvas stream at 30 fps
        const stream = canvas.captureStream(30);

        // Capture audio from video element if possible
        try {
            const videoStream = videoEl.captureStream ? videoEl.captureStream() : (videoEl.mozCaptureStream ? videoEl.mozCaptureStream() : null);
            if (videoStream) {
                const audioTracks = videoStream.getAudioTracks();
                audioTracks.forEach(track => stream.addTrack(track));
            }
        } catch (e) {
            console.warn('Audio track capture failed or unsupported:', e);
        }

        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

        const chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = 'memeforge-video-export.webm';
            link.href = url;
            link.click();

            // Reset UI state
            isExporting = false;
            exportProgress.style.display = 'none';
            selectedId = prevSelected;
            render();
        };

        exportProgress.style.display = 'block';
        exportProgress.textContent = 'Processing: 0%';

        // Start recorder
        recorder.start();

        // Start playback
        videoEl.play();

        // Hook into time updates manually for export rendering & progress checks
        function checkExportProgress() {
            if (!isExporting) return;
            render();

            const duration = trimEnd - trimStart;
            const elapsed = videoEl.currentTime - trimStart;
            const pct = Math.max(0, Math.min(100, Math.floor((elapsed / duration) * 100)));
            exportProgress.textContent = `Processing: ${pct}%`;

            if (videoEl.currentTime >= trimEnd || videoEl.ended) {
                recorder.stop();
                videoEl.pause();
            } else {
                requestAnimationFrame(checkExportProgress);
            }
        }

        requestAnimationFrame(checkExportProgress);
    });

    // ---------- Init ----------
    Promise.all(
        FONT_FAMILIES.map(f => document.fonts.load(`400 46px '${f}'`).catch(() => {}))
    ).then(render).catch(render);

    syncFilterUI();
    render();
})();
