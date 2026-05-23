/**
 * InfinityWall AI — modules/preview.js
 * Renders an interactive multi-monitor preview with drag-and-drop repositioning
 */

class PreviewEngine {
  constructor(layout, containerEl) {
    this.layout    = layout;
    this.container = containerEl;
    this.canvas    = null;
    this.ctx       = null;
    this.scale     = 0.12;
    this.panoramic = null;   // current generated image
    this.dragging  = null;
    this.offset    = { x: 0, y: 0 };
    this._init();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  _init() {
    this.canvas           = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.canvas.style.cssText = 'display:block;margin:auto;cursor:grab;border-radius:12px;';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._bindEvents();
    this.layout.onChange = () => this.render();
    this.render();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const monitors = this.layout.monitors;
    if (monitors.length === 0) {
      this._drawEmpty();
      return;
    }

    const bounds = this.layout.getCanvasBounds(this.scale);
    const pad    = 40;
    const cw     = Math.max(bounds.width  + pad * 2, 600);
    const ch     = Math.max(bounds.height + pad * 2, 260);

    this.canvas.width  = cw;
    this.canvas.height = ch;

    const ctx    = this.ctx;
    const minX   = bounds.minX;
    const minY   = bounds.minY;
    const s      = this.scale;

    // Background
    const bg = ctx.createLinearGradient(0, 0, cw, ch);
    bg.addColorStop(0,   '#08090f');
    bg.addColorStop(0.5, '#0d1021');
    bg.addColorStop(1,   '#0a0b14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    // Draw grid
    this._drawGrid(ctx, cw, ch);

    // Draw panoramic behind monitors (if exists)
    if (this.panoramic) {
      this._drawPanoramicBg(ctx, bounds, pad, minX, minY, s);
    }

    // Draw monitors
    for (const m of monitors) {
      this._drawMonitor(ctx, m, minX, minY, s, pad);
    }

    // Legend
    this._drawLegend(ctx, monitors.length, bounds);
  }

  _drawEmpty() {
    this.canvas.width  = 600;
    this.canvas.height = 260;
    const ctx = this.ctx;
    ctx.fillStyle = '#08090f';
    ctx.fillRect(0, 0, 600, 260);
    this._drawGrid(ctx, 600, 260);

    ctx.fillStyle    = '#ffffff18';
    ctx.font         = '600 16px "Orbitron", monospace';
    ctx.textAlign    = 'center';
    ctx.fillText('ADD MONITORS TO SEE PREVIEW', 300, 130);

    ctx.fillStyle = '#ffffff0a';
    ctx.font      = '13px monospace';
    ctx.fillText('Click "Add Monitor" to begin your setup', 300, 158);
  }

  _drawGrid(ctx, cw, ch) {
    ctx.strokeStyle = '#ffffff07';
    ctx.lineWidth   = 1;
    const gSize     = 30;
    for (let x = 0; x < cw; x += gSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
    }
    for (let y = 0; y < ch; y += gSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
    }
  }

  _drawPanoramicBg(ctx, bounds, pad, minX, minY, s) {
    try {
      const img = this._getPanoImage();
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(img, pad, pad, bounds.width, bounds.height);
      ctx.globalAlpha = 1;
      ctx.restore();
    } catch(e) {}
  }

  _getPanoImage() {
    if (!this._cachedPanoImg && this.panoramic) {
      const img   = new Image();
      img.src     = this.panoramic;
      img.onload  = () => { this._cachedPanoImg = img; this.render(); };
      return null;
    }
    return this._cachedPanoImg || null;
  }

  _drawMonitor(ctx, m, minX, minY, s, pad) {
    const { width: mw, height: mh } = this.layout.getMonitorDimensions(m);
    const x  = (m.posX - minX) * s + pad;
    const y  = (m.posY - minY) * s + pad;
    const w  = mw * s;
    const h  = mh * s;
    const bz = m.bezel * s;

    // Outer glow
    ctx.shadowColor   = m._hover ? '#00f0ff' : '#7b3fff66';
    ctx.shadowBlur    = m._hover ? 22 : 14;

    // Bezel (frame)
    ctx.fillStyle = m._hover ? '#1a2040' : '#111420';
    this._roundRect(ctx, x, y, w, h, 6);
    ctx.fill();

    // Screen area
    if (this.panoramic && this._cachedPanoImg) {
      this._drawPanoSlice(ctx, m, x + bz, y + bz, w - bz * 2, h - bz * 2, minX, minY, s);
    } else {
      const grad = ctx.createLinearGradient(x + bz, y + bz, x + w - bz, y + h - bz);
      grad.addColorStop(0,   '#0c1035');
      grad.addColorStop(0.4, '#181235');
      grad.addColorStop(1,   '#0a0c20');
      ctx.fillStyle = grad;
      this._roundRect(ctx, x + bz, y + bz, w - bz * 2, h - bz * 2, 3);
      ctx.fill();

      // Placeholder crosshair
      ctx.strokeStyle = '#ffffff12';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(x + bz, y + bz); ctx.lineTo(x + w - bz, y + h - bz);
      ctx.moveTo(x + w - bz, y + bz); ctx.lineTo(x + bz, y + h - bz);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // Neon border
    ctx.strokeStyle = m._hover ? '#00f0ff' : '#7b3fff';
    ctx.lineWidth   = m._hover ? 2 : 1;
    this._roundRect(ctx, x, y, w, h, 6);
    ctx.stroke();

    // Label
    ctx.fillStyle  = '#ffffffcc';
    ctx.font       = `bold ${Math.max(9, Math.min(13, w * 0.1))}px "Orbitron", monospace`;
    ctx.textAlign  = 'center';
    ctx.shadowColor = 'transparent';

    const label    = `${m.name}`;
    const sublabel = `${mw}×${mh}`;
    const lx       = x + w / 2;
    const ly       = y + h / 2 - 8;

    ctx.fillText(label,    lx, ly);
    ctx.fillStyle = '#aaaaff88';
    ctx.font      = `${Math.max(8, Math.min(10, w * 0.08))}px monospace`;
    ctx.fillText(sublabel, lx, ly + 16);

    // Orientation icon
    ctx.fillStyle = '#ffffff44';
    ctx.font      = '10px monospace';
    ctx.fillText(m.orientation === 'vertical' ? '↕ V' : '↔ H', lx, y + h - 8);
  }

  _drawPanoSlice(ctx, m, sx, sy, sw, sh, minX, minY, s) {
    try {
      const img       = this._cachedPanoImg;
      const { width: mw, height: mh } = this.layout.getMonitorDimensions(m);
      const bounds    = this.layout.getCanvasBounds(1);
      const scaleX    = img.naturalWidth  / bounds.rawWidth;
      const scaleY    = img.naturalHeight / bounds.rawHeight;
      const cropX     = (m.posX - minX) * scaleX;
      const cropY     = (m.posY - minY) * scaleY;
      const cropW     = mw * scaleX;
      const cropH     = mh * scaleY;

      if (m.orientation === 'vertical') {
        ctx.save();
        ctx.translate(sx + sw / 2, sy + sh / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, cropX, cropY, cropW, cropH, -sh / 2, -sw / 2, sh, sw);
        ctx.restore();
      } else {
        ctx.drawImage(img, cropX, cropY, cropW, cropH, sx, sy, sw, sh);
      }
    } catch(e) {}
  }

  _drawLegend(ctx, count, bounds) {
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#ffffff22';
    ctx.font        = '10px monospace';
    ctx.textAlign   = 'left';
    ctx.fillText(`${count} monitor${count !== 1 ? 's' : ''} · ${Math.round(bounds.rawWidth)}×${Math.round(bounds.rawHeight)}px canvas`, 10, this.canvas.height - 10);
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Drag and Drop ─────────────────────────────────────────────────────────

  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown',  e => this._onMouseDown(e));
    c.addEventListener('mousemove',  e => this._onMouseMove(e));
    c.addEventListener('mouseup',    e => this._onMouseUp(e));
    c.addEventListener('mouseleave', e => this._onMouseUp(e));

    c.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    c.addEventListener('touchmove',  e => this._onTouchMove(e),  { passive: false });
    c.addEventListener('touchend',   e => this._onMouseUp(e));
  }

  _clientPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _monitorAt(cx, cy) {
    const bounds = this.layout.getCanvasBounds(this.scale);
    const minX   = bounds.minX;
    const minY   = bounds.minY;
    const s      = this.scale;
    const pad    = 40;

    for (let i = this.layout.monitors.length - 1; i >= 0; i--) {
      const m  = this.layout.monitors[i];
      const { width: mw, height: mh } = this.layout.getMonitorDimensions(m);
      const mx = (m.posX - minX) * s + pad;
      const my = (m.posY - minY) * s + pad;
      const mwS = mw * s;
      const mhS = mh * s;
      if (cx >= mx && cx <= mx + mwS && cy >= my && cy <= my + mhS) return m;
    }
    return null;
  }

  _onMouseDown(e) {
    const { x, y } = this._clientPos(e);
    const m = this._monitorAt(x, y);
    if (!m) return;
    this.dragging = m;
    this.canvas.style.cursor = 'grabbing';

    const bounds = this.layout.getCanvasBounds(this.scale);
    const mx = (m.posX - bounds.minX) * this.scale + 40;
    const my = (m.posY - bounds.minY) * this.scale + 40;
    this.offset = { x: x - mx, y: y - my };
  }

  _onMouseMove(e) {
    const { x, y } = this._clientPos(e);

    // Hover detection
    for (const m of this.layout.monitors) m._hover = false;
    const hovered = this._monitorAt(x, y);
    if (hovered) { hovered._hover = true; this.canvas.style.cursor = this.dragging ? 'grabbing' : 'grab'; }
    else this.canvas.style.cursor = 'default';

    if (!this.dragging) { this.render(); return; }

    const bounds = this.layout.getCanvasBounds(this.scale);
    const newX = Math.round(((x - this.offset.x - 40) / this.scale + bounds.minX) / 10) * 10;
    const newY = Math.round(((y - this.offset.y - 40) / this.scale + bounds.minY) / 10) * 10;

    this.layout.updateMonitor(this.dragging.id, { posX: newX, posY: newY });
  }

  _onMouseUp() {
    this.dragging = null;
    this.canvas.style.cursor = 'grab';
  }

  _onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    this._onMouseDown({ clientX: t.clientX, clientY: t.clientY });
  }

  _onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    this._onMouseMove({ clientX: t.clientX, clientY: t.clientY });
  }

  // ── Public ────────────────────────────────────────────────────────────────

  setPanoramic(dataURL) {
    this.panoramic     = dataURL;
    this._cachedPanoImg = null;
    this._getPanoImage(); // trigger load
  }

  setScale(s) {
    this.scale = s;
    this.render();
  }
}

window.PreviewEngine = PreviewEngine;
