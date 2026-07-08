// ============================================================
//  draw-tools.js — freehand drawing overlay module
//  Exports: DRAW_TOOLS, initDrawTools, setActiveTool,
//           setDrawColor, setDrawSize, setDrawOpacity,
//           clearStrokes, undoLastStroke, getOverlayCanvas
// ============================================================

export const DRAW_TOOLS = {
  NONE: 'none',
  pen: 'pen',
  pencil: 'pencil',
  highlighter: 'highlighter',
  blur: 'blur'
};

let overlayCanvas = null;
let overlayCtx = null;
let mainCanvasRef = null;

let activeTool = 'none';
let drawColor = '#ff3b3b';
let drawSize = 6;
let drawOpacity = 1.0;

// undo stack — each entry is an ImageData snapshot taken before a stroke starts
let snapshots = [];
let isDrawing = false;
let lastX = 0, lastY = 0;

// -------------------------------------------------------
//  Init
// -------------------------------------------------------
export function initDrawTools(mainCanvas) {
  mainCanvasRef = mainCanvas;

  overlayCanvas = document.createElement('canvas');
  overlayCanvas.id = 'drawOverlay';
  overlayCanvas.width = mainCanvas.width;
  overlayCanvas.height = mainCanvas.height;
  overlayCanvas.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;' +
    'pointer-events:none;border-radius:inherit;cursor:crosshair;' +
    'touch-action:none;';

  const parent = mainCanvas.parentElement;
  if (getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }
  parent.appendChild(overlayCanvas);

  overlayCtx = overlayCanvas.getContext('2d');

  overlayCanvas.addEventListener('mousedown', _onDown);
  overlayCanvas.addEventListener('mousemove', _onMove);
  window.addEventListener('mouseup', _onUp);
  overlayCanvas.addEventListener('touchstart', _onDown, { passive: false });
  overlayCanvas.addEventListener('touchmove', _onMove, { passive: false });
  window.addEventListener('touchend', _onUp);

  // Bridge for non-module code (download compositing)
  window.MemeGenie_DRAW_OVERLAY = overlayCanvas;
  window.MEMEFORGE_DRAW_OVERLAY = overlayCanvas;

  return overlayCanvas;
}

export function getOverlayCanvas() { return overlayCanvas; }

// -------------------------------------------------------
//  Public setters
// -------------------------------------------------------
export function isDrawToolActive() { return activeTool !== 'none'; }

export function setActiveTool(tool) {
  activeTool = tool || 'none';
  if (!overlayCanvas) return;
  const active = isDrawToolActive();
  overlayCanvas.style.pointerEvents = active ? 'auto' : 'none';
  overlayCanvas.style.cursor = active ? 'crosshair' : 'default';
}

export function setDrawColor(hex) { drawColor = hex; }
export function setDrawSize(px) { drawSize = Math.max(1, px); }
export function setDrawOpacity(val) { drawOpacity = Math.min(1, Math.max(0, val)); }

// -------------------------------------------------------
//  Undo / Clear
// -------------------------------------------------------
export function undoLastStroke() {
  if (!snapshots.length) return;
  overlayCtx.putImageData(snapshots.pop(), 0, 0);
}

export function clearStrokes() {
  snapshots = [];
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// -------------------------------------------------------
//  Event handlers
// -------------------------------------------------------
function _getPos(evt) {
  const rect = overlayCanvas.getBoundingClientRect();
  const scaleX = overlayCanvas.width / rect.width;
  const scaleY = overlayCanvas.height / rect.height;
  const src = evt.touches ? evt.touches[0] : evt;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top) * scaleY
  };
}

function _onDown(evt) {
  evt.preventDefault();
  evt.stopPropagation();
  isDrawing = true;
  snapshots.push(overlayCtx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height));
  const pos = _getPos(evt);
  lastX = pos.x;
  lastY = pos.y;
  if (activeTool === 'blur') {
    _applyBlur(pos.x, pos.y);
  } else {
    _paintDot(pos.x, pos.y);
  }
}

function _onMove(evt) {
  if (!isDrawing) return;
  evt.preventDefault();
  const pos = _getPos(evt);
  if (activeTool === 'blur') {
    _applyBlur(pos.x, pos.y);
  } else {
    _paintLine(lastX, lastY, pos.x, pos.y);
  }
  lastX = pos.x;
  lastY = pos.y;
}

function _onUp() { isDrawing = false; }

// -------------------------------------------------------
//  Drawing primitives
// -------------------------------------------------------
function _applyStyle(ctx) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';

  switch (activeTool) {
    case 'pen':
      ctx.globalAlpha = drawOpacity;
      ctx.strokeStyle = drawColor;
      ctx.fillStyle = drawColor;
      ctx.lineWidth = drawSize;
      break;
    case 'pencil':
      ctx.globalAlpha = Math.min(drawOpacity * 0.55, 0.55);
      ctx.strokeStyle = drawColor;
      ctx.fillStyle = drawColor;
      ctx.lineWidth = Math.max(1, drawSize * 0.55);
      break;
    case 'highlighter':
      ctx.globalAlpha = Math.min(drawOpacity * 0.38, 0.38);
      ctx.strokeStyle = drawColor;
      ctx.fillStyle = drawColor;
      ctx.lineWidth = drawSize * 3;
      ctx.lineCap = 'square';
      break;
    default:
      ctx.globalAlpha = drawOpacity;
      ctx.strokeStyle = drawColor;
      ctx.fillStyle = drawColor;
      ctx.lineWidth = drawSize;
  }
}

function _paintDot(x, y) {
  overlayCtx.save();
  _applyStyle(overlayCtx);
  const r = overlayCtx.lineWidth / 2;
  overlayCtx.beginPath();
  overlayCtx.arc(x, y, Math.max(r, 0.5), 0, Math.PI * 2);
  overlayCtx.fill();
  overlayCtx.restore();
}

function _paintLine(x1, y1, x2, y2) {
  overlayCtx.save();
  _applyStyle(overlayCtx);
  overlayCtx.beginPath();
  overlayCtx.moveTo(x1, y1);
  overlayCtx.lineTo(x2, y2);
  overlayCtx.stroke();
  overlayCtx.restore();
}

/**
 * Mosaic/pixelate censor brush.
 * Composites main canvas + overlay, downscales then upscales
 * the region without smoothing, clips to a circle, and stamps
 * the result back onto the overlay.
 */
function _applyBlur(cx, cy) {
  const r = drawSize * 3;
  const pixSize = Math.max(4, Math.floor(drawSize / 1.5));

  const sx = Math.max(0, Math.floor(cx - r));
  const sy = Math.max(0, Math.floor(cy - r));
  const sw = Math.min(overlayCanvas.width - sx, Math.ceil(r * 2));
  const sh = Math.min(overlayCanvas.height - sy, Math.ceil(r * 2));
  if (sw <= 0 || sh <= 0) return;

  const tmp = _offscreen(sw, sh);
  const tctx = tmp.ctx;
  tctx.drawImage(mainCanvasRef, sx, sy, sw, sh, 0, 0, sw, sh);
  tctx.drawImage(overlayCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const pixW = Math.max(1, Math.ceil(sw / pixSize));
  const pixH = Math.max(1, Math.ceil(sh / pixSize));
  const small = _offscreen(pixW, pixH);
  small.ctx.imageSmoothingEnabled = true;
  small.ctx.drawImage(tmp.el, 0, 0, pixW, pixH);

  tctx.clearRect(0, 0, sw, sh);
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(small.el, 0, 0, sw, sh);

  overlayCtx.save();
  overlayCtx.beginPath();
  overlayCtx.arc(cx, cy, r, 0, Math.PI * 2);
  overlayCtx.clip();
  overlayCtx.globalAlpha = Math.min(drawOpacity * 0.95, 1);
  overlayCtx.drawImage(tmp.el, 0, 0, sw, sh, sx, sy, sw, sh);
  overlayCtx.restore();
}

function _offscreen(w, h) {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return { el, ctx: el.getContext('2d') };
}
