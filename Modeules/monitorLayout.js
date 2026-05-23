/**
 * InfinityWall AI — modules/monitorLayout.js
 * Handles monitor configuration, layout grid, drag-and-drop, and canvas calculation
 */

class MonitorLayout {
  constructor() {
    this.monitors = [];
    this.nextId    = 1;
    this.onChange  = null; // callback
    this._dragState = null;

    this.COMMON_RESOLUTIONS = [
      '1280x720',
      '1366x768',
      '1440x900',
      '1600x900',
      '1920x1080',
      '1920x1200',
      '2560x1080',
      '2560x1440',
      '3440x1440',
      '3840x1080',
      '3840x2160',
      '5120x1440',
    ];
  }

  // ── Monitor CRUD ─────────────────────────────────────────────────────────

  addMonitor(opts = {}) {
    const id = this.nextId++;
    const monitor = {
      id,
      name:        opts.name        || `Monitor ${id}`,
      width:       opts.width       || 1920,
      height:      opts.height      || 1080,
      orientation: opts.orientation || 'horizontal',
      posX:        opts.posX        || (this.monitors.length * 220),
      posY:        opts.posY        || 0,
      bezel:       opts.bezel       || 8,
      enabled:     true,
    };
    this.monitors.push(monitor);
    this._notify();
    return monitor;
  }

  removeMonitor(id) {
    this.monitors = this.monitors.filter(m => m.id !== id);
    this._notify();
  }

  updateMonitor(id, patch) {
    const m = this.getMonitor(id);
    if (!m) return;

    // Handle orientation change BEFORE merging patch
    if (patch.orientation && patch.orientation !== m.orientation) {
      // Always store: width = landscape-width (larger), height = landscape-height (smaller)
      // Then getMonitorDimensions() swaps them visually for vertical
      const landscape = Math.max(m.width, m.height);
      const portrait  = Math.min(m.width, m.height);
      m.width  = landscape;
      m.height = portrait;
    }

    Object.assign(m, patch);
    this._notify();
  }

  getMonitor(id) {
    return this.monitors.find(m => m.id === id);
  }

  // ── Canvas Calculation ────────────────────────────────────────────────────

  /**
   * Returns bounding box (pixels) for the entire virtual canvas
   * based on monitor positions and sizes, using a given preview scale.
   */
  getCanvasBounds(scale = 1) {
    if (this.monitors.length === 0) return { width: 0, height: 0, minX: 0, minY: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const m of this.monitors) {
      const w = m.orientation === 'vertical' ? m.height : m.width;
      const h = m.orientation === 'vertical' ? m.width  : m.height;
      minX = Math.min(minX, m.posX);
      minY = Math.min(minY, m.posY);
      maxX = Math.max(maxX, m.posX + w);
      maxY = Math.max(maxY, m.posY + h);
    }

    return {
      minX,
      minY,
      width:  (maxX - minX) * scale,
      height: (maxY - minY) * scale,
      rawWidth:  maxX - minX,
      rawHeight: maxY - minY,
    };
  }

  /**
   * Returns the effective VISUAL pixel dimensions of a monitor in the preview.
   * Always stores width=landscape, height=portrait internally.
   * Vertical orientation swaps them so the preview shows a tall rectangle.
   */
  getMonitorDimensions(monitor) {
    const landscape = Math.max(monitor.width, monitor.height);
    const portrait  = Math.min(monitor.width, monitor.height);
    if (monitor.orientation === 'vertical') {
      return { width: portrait, height: landscape };
    }
    return { width: landscape, height: portrait };
  }

  /**
   * For each monitor, returns the crop rect in the global canvas coordinates.
   * This tells the exporter exactly which region of the full panoramic image
   * belongs to each monitor.
   */
  getCropRects() {
    if (this.monitors.length === 0) return [];
    const bounds = this.getCanvasBounds();

    return this.monitors.map(m => {
      const { width, height } = this.getMonitorDimensions(m);
      return {
        id:      m.id,
        name:    m.name,
        x:       m.posX - bounds.minX,
        y:       m.posY - bounds.minY,
        width,
        height,
        monitorWidth:  m.width,
        monitorHeight: m.height,
        orientation:   m.orientation,
      };
    });
  }

  // ── Auto-arrange ──────────────────────────────────────────────────────────

  autoArrangeHorizontal() {
    // Find the tallest monitor to use as baseline for vertical centering
    const maxH = Math.max(...this.monitors.map(m => this.getMonitorDimensions(m).height));
    let x = 0;
    for (const m of this.monitors) {
      const { width, height } = this.getMonitorDimensions(m);
      m.posX = x;
      m.posY = Math.round((maxH - height) / 2); // vertically center shorter monitors
      x += width + m.bezel;
    }
    this._notify();
  }

  autoArrangeGrid() {
    const cols = Math.ceil(Math.sqrt(this.monitors.length));
    let x = 0, y = 0, rowH = 0, col = 0;
    for (const m of this.monitors) {
      m.posX = x;
      m.posY = y;
      const { width, height } = this.getMonitorDimensions(m);
      rowH = Math.max(rowH, height + m.bezel);
      x   += width + m.bezel;
      col++;
      if (col >= cols) {
        col = 0;
        x   = 0;
        y  += rowH;
        rowH = 0;
      }
    }
    this._notify();
  }

  // ── Presets ───────────────────────────────────────────────────────────────

  savePreset(name) {
    const presets = this._loadPresets();
    presets[name] = {
      monitors: JSON.parse(JSON.stringify(this.monitors)),
      nextId:   this.nextId,
    };
    localStorage.setItem('iw_presets', JSON.stringify(presets));
    return name;
  }

  loadPreset(name) {
    const presets = this._loadPresets();
    if (!presets[name]) return false;
    this.monitors = presets[name].monitors;
    this.nextId   = presets[name].nextId;
    this._notify();
    return true;
  }

  deletePreset(name) {
    const presets = this._loadPresets();
    delete presets[name];
    localStorage.setItem('iw_presets', JSON.stringify(presets));
  }

  listPresets() {
    return Object.keys(this._loadPresets());
  }

  _loadPresets() {
    try {
      return JSON.parse(localStorage.getItem('iw_presets') || '{}');
    } catch(e) { return {}; }
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON() {
    return JSON.stringify({ monitors: this.monitors, nextId: this.nextId });
  }

  fromJSON(json) {
    try {
      const d = JSON.parse(json);
      this.monitors = d.monitors;
      this.nextId   = d.nextId;
      this._notify();
    } catch(e) { console.error('MonitorLayout.fromJSON error', e); }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _notify() {
    if (typeof this.onChange === 'function') this.onChange(this.monitors);
  }

  parseResolution(str) {
    const [w, h] = str.split('x').map(Number);
    return { width: w || 1920, height: h || 1080 };
  }
}

window.MonitorLayout = MonitorLayout;
