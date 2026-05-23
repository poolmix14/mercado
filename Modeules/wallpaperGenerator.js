/**
 * InfinityWall AI — modules/wallpaperGenerator.js
 * Orchestrates full-canvas generation, slicing, and result management
 */

class WallpaperGenerator {
  constructor(layout, aiEngine) {
    this.layout    = layout;
    this.ai        = aiEngine;
    this.generated = null; // { panoramic: dataURL, slices: [{id, name, dataURL, width, height}] }
    this.onUpdate  = null;
  }

  // ── Main Generation ────────────────────────────────────────────────────────

  async generate({ prompt, style, quality, referenceImage, onProgress }) {
    const monitors = this.layout.monitors.filter(m => m.enabled);
    if (monitors.length === 0) throw new Error('Add at least one monitor before generating.');

    const bounds = this.layout.getCanvasBounds();
    const preset = IWConfig.qualityPresets[quality] || IWConfig.qualityPresets['4k'];

    // Scale canvas to target quality
    const scale = preset.multiplier;
    const totalW = Math.round(bounds.rawWidth  * scale);
    const totalH = Math.round(bounds.rawHeight * scale);

    onProgress?.({ stage: `Canvas: ${totalW}×${totalH}`, pct: 5 });

    // Generate panoramic
    const panoramic = await this.ai.generatePanoramic({
      prompt,
      style,
      width:  totalW,
      height: totalH,
      referenceImage,
      onProgress,
    });

    onProgress?.({ stage: 'Slicing into monitor wallpapers...', pct: 85 });

    // Slice into per-monitor images
    const slices = await this._slicePanoramic(panoramic, totalW, totalH, scale);

    this.generated = { panoramic, slices, totalW, totalH, prompt, style, quality, ts: Date.now() };

    // Save to history
    this._addToHistory(this.generated);

    onProgress?.({ stage: 'Generation complete!', pct: 100 });

    this.onUpdate?.(this.generated);
    return this.generated;
  }

  // ── Slicing Engine ─────────────────────────────────────────────────────────

  async _slicePanoramic(panoramicUrl, totalW, totalH, scale) {
    const img    = await this._loadImage(panoramicUrl);
    const cropRects = this.layout.getCropRects();
    const slices = [];

    for (const rect of cropRects) {
      const c   = document.createElement('canvas');
      c.width   = rect.width;
      c.height  = rect.height;
      const ctx = c.getContext('2d');

      // Scale crop coords to generated image size
      const sx = Math.round(rect.x     * scale);
      const sy = Math.round(rect.y     * scale);
      const sw = Math.round(rect.width * scale);
      const sh = Math.round(rect.height * scale);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // If monitor is vertical, rotate the slice
      if (rect.orientation === 'vertical') {
        const rotW = rect.height;
        const rotH = rect.width;
        c.width  = rotW;
        c.height = rotH;
        ctx.save();
        ctx.translate(rotW / 2, rotH / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, sx, sy, sw, sh, -rotH / 2, -rotW / 2, rotH, rotW);
        ctx.restore();
      } else {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, rect.width, rect.height);
      }

      slices.push({
        id:       rect.id,
        name:     rect.name,
        dataURL:  c.toDataURL('image/png', 1.0),
        width:    c.width,
        height:   c.height,
        orientation: rect.orientation,
      });
    }

    return slices;
  }

  // ── History ────────────────────────────────────────────────────────────────

  _addToHistory(result) {
    if (!IWConfig.settings.saveHistory) return;
    try {
      const history = this._loadHistory();
      const entry   = {
        ts:      result.ts,
        prompt:  result.prompt,
        style:   result.style,
        quality: result.quality,
        totalW:  result.totalW,
        totalH:  result.totalH,
        // Store only a small thumbnail for history
        thumb:   this._makeThumbnail(result.panoramic, 320, 180),
      };
      history.unshift(entry);
      const maxH = IWConfig.settings.maxHistoryItems;
      if (history.length > maxH) history.splice(maxH);
      localStorage.setItem('iw_history', JSON.stringify(history));
    } catch(e) { /* Storage full, skip */ }
  }

  _loadHistory() {
    try {
      return JSON.parse(localStorage.getItem('iw_history') || '[]');
    } catch(e) { return []; }
  }

  _makeThumbnail(dataURL, w, h) {
    try {
      const img = new Image();
      img.src   = dataURL;
      const c   = document.createElement('canvas');
      c.width   = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.6);
    } catch(e) { return ''; }
  }

  // ── Upscale slice ──────────────────────────────────────────────────────────

  async upscaleSlice(slice, targetW, targetH) {
    const img = await this._loadImage(slice.dataURL);
    const c   = document.createElement('canvas');
    c.width   = targetW;
    c.height  = targetH;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return c.toDataURL('image/png', 1.0);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  _loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload  = () => res(img);
      img.onerror = () => rej(new Error('Image load failed'));
      img.src     = src;
    });
  }
}

window.WallpaperGenerator = WallpaperGenerator;
