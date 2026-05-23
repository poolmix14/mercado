/**
 * InfinityWall AI — app.js
 * Main application orchestrator — wires all modules together and manages UI
 */

class InfinityWallApp {
  constructor() {
    this.layout    = new MonitorLayout();
    this.ai        = new AIEngine(IWConfig);
    this.generator = new WallpaperGenerator(this.layout, this.ai);
    this.exporter  = new Exporter();
    this.preview   = null;
    this.activeTab = 'setup';
    this.isGenerating = false;

    this._init();
  }

  _init() {
    document.addEventListener('DOMContentLoaded', () => {
      this._initPreview();
      this._bindUI();
      this._loadSavedState();
      this._startParticles();
      this._renderMonitorList();
      this._renderProviderBadge();

      // Add default monitor on first load
      if (this.layout.monitors.length === 0) {
        this.layout.addMonitor({ name: 'Monitor 1', width: 1920, height: 1080 });
        this.layout.addMonitor({ name: 'Monitor 2', width: 1920, height: 1080 });
      }
      this._renderMonitorList();
    });
  }

  // ── Preview Init ──────────────────────────────────────────────────────────

  _initPreview() {
    const container = document.getElementById('preview-container');
    if (!container) return;
    this.preview = new PreviewEngine(this.layout, container);
    this.layout.onChange = (monitors) => {
      this._renderMonitorList();
      this.preview.render();
      this._updateCanvasStats();
    };
  }

  // ── UI Binding ────────────────────────────────────────────────────────────

  _bindUI() {
    // Tab navigation
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
    });

    // Monitor controls
    document.getElementById('btn-add-monitor')?.addEventListener('click', () => this._addMonitor());
    document.getElementById('btn-arrange-h')?.addEventListener('click', () => {
      this.layout.autoArrangeHorizontal();
      this._showToast('Monitors arranged horizontally');
    });
    document.getElementById('btn-arrange-grid')?.addEventListener('click', () => {
      this.layout.autoArrangeGrid();
      this._showToast('Monitors arranged in grid');
    });

    // Preset management
    document.getElementById('btn-save-preset')?.addEventListener('click', () => this._savePreset());
    document.getElementById('btn-load-preset')?.addEventListener('click', () => this._showPresetModal());

    // Generation
    document.getElementById('btn-generate')?.addEventListener('click', () => this._generate());
    document.getElementById('btn-clear-prompt')?.addEventListener('click', () => {
      document.getElementById('prompt-input').value = '';
    });

    // Style presets
    this._renderStylePresets();

    // Image upload (reference)
    const dropZone = document.getElementById('image-drop-zone');
    const fileInput = document.getElementById('ref-image-input');
    if (dropZone) {
      dropZone.addEventListener('click', () => fileInput?.click());
      dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) this._loadReferenceImage(file);
      });
    }
    fileInput?.addEventListener('change', e => {
      if (e.target.files[0]) this._loadReferenceImage(e.target.files[0]);
    });

    // Export
    document.getElementById('btn-download-zip')?.addEventListener('click', () => this._downloadZIP());

    // Settings
    document.getElementById('btn-open-settings')?.addEventListener('click', () => this._showSettingsModal());
    document.getElementById('btn-save-settings')?.addEventListener('click', () => this._saveSettings());

    // Provider selector
    document.querySelectorAll('[data-provider]').forEach(btn => {
      btn.addEventListener('click', () => {
        IWConfig.activeProvider = btn.dataset.provider;
        document.querySelectorAll('[data-provider]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderProviderBadge();
        localStorage.setItem('iw_provider', IWConfig.activeProvider);
      });
    });

    // Quality selector
    document.querySelectorAll('[data-quality]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-quality]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Prompt enhance toggle
    document.getElementById('toggle-enhance')?.addEventListener('change', e => {
      IWConfig.settings.autoEnhancePrompts = e.target.checked;
    });

    // Preview scale slider
    document.getElementById('preview-scale')?.addEventListener('input', e => {
      this.preview?.setScale(parseFloat(e.target.value));
    });

    // History tab
    document.getElementById('btn-show-history')?.addEventListener('click', () => this._renderHistory());

    // Keyboard shortcut: Ctrl+Enter to generate
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') this._generate();
    });

    // Modal close
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
      el.addEventListener('click', () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('open')));
    });
  }

  // ── Tab Switching ─────────────────────────────────────────────────────────

  _switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tab);
    });
    if (tab === 'history') this._renderHistory();
    if (tab === 'results' && this.generator.generated) this._renderResults();
  }

  // ── Monitor Management ─────────────────────────────────────────────────────

  _addMonitor() {
    const count = this.layout.monitors.length + 1;
    if (count > IWConfig.settings.maxMonitors) {
      this._showToast(`Maximum ${IWConfig.settings.maxMonitors} monitors allowed`, 'warn');
      return;
    }
    const lastM = this.layout.monitors[this.layout.monitors.length - 1];
    const posX  = lastM ? lastM.posX + (lastM.orientation === 'vertical' ? lastM.height : lastM.width) + 20 : 0;
    this.layout.addMonitor({ name: `Monitor ${count}`, posX });
    this._renderMonitorList();
    this._showToast(`Monitor ${count} added`);
  }

  _renderMonitorList() {
    const container = document.getElementById('monitor-list');
    if (!container) return;
    container.innerHTML = '';

    if (this.layout.monitors.length === 0) {
      container.innerHTML = `<div class="empty-state">No monitors added yet.<br>Click "Add Monitor" to start.</div>`;
      return;
    }

    this.layout.monitors.forEach(m => {
      const card = document.createElement('div');
      card.className = 'monitor-card';
      card.innerHTML = `
        <div class="monitor-card-header">
          <div class="monitor-icon">${m.orientation === 'vertical' ? '▯' : '▭'}</div>
          <input class="monitor-name-input" value="${m.name}" data-id="${m.id}" title="Click to rename" />
          <button class="btn-icon btn-delete-monitor" data-id="${m.id}" title="Remove monitor">✕</button>
        </div>
        <div class="monitor-card-body">
          <div class="field-group">
            <label>Resolution</label>
            <select class="monitor-res" data-id="${m.id}">
              ${this.layout.COMMON_RESOLUTIONS.map(r => {
                const [rw, rh] = r.split('x').map(Number);
                const landscape = Math.max(m.width, m.height);
                const portrait  = Math.min(m.width, m.height);
                const selected  = (Math.max(rw,rh) === landscape && Math.min(rw,rh) === portrait);
                return `<option value="${r}" ${selected ? 'selected' : ''}>${r}</option>`;
              }).join('')}
              <option value="custom">Custom...</option>
            </select>
          </div>
          <div class="field-group">
            <label>Orientation</label>
            <div class="orient-toggle">
              <button class="orient-btn ${m.orientation === 'horizontal' ? 'active' : ''}" data-id="${m.id}" data-orient="horizontal">↔ Horizontal</button>
              <button class="orient-btn ${m.orientation === 'vertical'   ? 'active' : ''}" data-id="${m.id}" data-orient="vertical">↕ Vertical</button>
            </div>
          </div>
          <div class="monitor-dims">${this.layout.getMonitorDimensions(m).width} × ${this.layout.getMonitorDimensions(m).height} px · ${m.orientation}</div>
        </div>
      `;
      container.appendChild(card);
    });

    // Bind card events
    container.querySelectorAll('.monitor-name-input').forEach(inp => {
      inp.addEventListener('change', e => {
        this.layout.updateMonitor(+e.target.dataset.id, { name: e.target.value });
      });
    });

    container.querySelectorAll('.btn-delete-monitor').forEach(btn => {
      btn.addEventListener('click', e => {
        this.layout.removeMonitor(+e.currentTarget.dataset.id);
        this._renderMonitorList();
        this._showToast('Monitor removed');
      });
    });

    container.querySelectorAll('.monitor-res').forEach(sel => {
      sel.addEventListener('change', e => {
        const val = e.target.value;
        let rawW, rawH;
        if (val === 'custom') {
          const custom = prompt('Enter resolution (e.g. 2560x1080):');
          if (!custom) return;
          const parsed = this.layout.parseResolution(custom);
          rawW = parsed.width; rawH = parsed.height;
        } else {
          const parsed = this.layout.parseResolution(val);
          rawW = parsed.width; rawH = parsed.height;
        }
        // Always store as landscape (larger = width)
        const width  = Math.max(rawW, rawH);
        const height = Math.min(rawW, rawH);
        this.layout.updateMonitor(+e.target.dataset.id, { width, height });
        this._renderMonitorList();
      });
    });

    container.querySelectorAll('.orient-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = +e.currentTarget.dataset.id;
        const orient = e.currentTarget.dataset.orient;
        this.layout.updateMonitor(id, { orientation: orient });
        this._renderMonitorList();
      });
    });

    this._updateCanvasStats();
  }

  _updateCanvasStats() {
    const bounds = this.layout.getCanvasBounds();
    const el = document.getElementById('canvas-stats');
    if (el) {
      el.textContent = this.layout.monitors.length > 0
        ? `Total canvas: ${Math.round(bounds.rawWidth)} × ${Math.round(bounds.rawHeight)} px — ${this.layout.monitors.length} monitor${this.layout.monitors.length !== 1 ? 's' : ''}`
        : 'No monitors configured';
    }
  }

  // ── Style Presets ─────────────────────────────────────────────────────────

  _renderStylePresets() {
    const container = document.getElementById('style-presets');
    if (!container) return;
    container.innerHTML = '';
    [{ id: '', label: '✨ Auto' }, ...IWConfig.stylePresets].forEach(style => {
      const btn = document.createElement('button');
      btn.className   = `style-chip ${style.id === '' ? 'active' : ''}`;
      btn.textContent = style.label;
      btn.dataset.style = style.id;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.style-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      container.appendChild(btn);
    });
  }

  // ── Generation ────────────────────────────────────────────────────────────

  async _generate() {
    if (this.isGenerating) return;
    const prompt = document.getElementById('prompt-input')?.value?.trim();
    if (!prompt) { this._showToast('Enter a prompt first!', 'warn'); return; }
    if (this.layout.monitors.length === 0) { this._showToast('Add at least one monitor!', 'warn'); return; }

    const style   = document.querySelector('.style-chip.active')?.dataset?.style || '';
    const quality = document.querySelector('[data-quality].active')?.dataset?.quality || '4k';
    const refImg  = this._referenceImageData || null;

    this.isGenerating = true;
    this._setGenerating(true);
    this._switchTab('results');

    try {
      const result = await this.generator.generate({
        prompt, style, quality,
        referenceImage: refImg,
        onProgress: ({ stage, pct }) => this._updateProgress(stage, pct),
      });

      this.preview?.setPanoramic(result.panoramic);
      this._renderResults(result);
      this._showToast('Generation complete! 🎉', 'success');
    } catch(err) {
      this._showToast(`Error: ${err.message}`, 'error');
      this._updateProgress('Generation failed', 0);
      console.error('Generation error:', err);
    } finally {
      this.isGenerating = false;
      this._setGenerating(false);
    }
  }

  _setGenerating(on) {
    const btn = document.getElementById('btn-generate');
    if (!btn) return;
    btn.disabled    = on;
    btn.textContent = on ? '⏳ Generating...' : '⚡ Generate Wallpapers';
    btn.classList.toggle('generating', on);
  }

  _updateProgress(stage, pct) {
    const bar   = document.getElementById('progress-bar');
    const label = document.getElementById('progress-label');
    const wrap  = document.getElementById('progress-wrap');
    if (wrap)  wrap.style.display  = pct > 0 && pct < 100 ? 'block' : (pct === 100 ? 'none' : 'block');
    if (bar)   { bar.style.width = `${pct}%`; bar.setAttribute('aria-valuenow', pct); }
    if (label) label.textContent = stage || '';
  }

  // ── Results Rendering ─────────────────────────────────────────────────────

  _renderResults(result) {
    result = result || this.generator.generated;
    if (!result) return;

    const container = document.getElementById('results-grid');
    if (!container) return;
    container.innerHTML = '';

    // Panoramic card
    const panoCard = document.createElement('div');
    panoCard.className = 'result-card result-panoramic';
    panoCard.innerHTML = `
      <div class="result-label">🌐 Full Panoramic — ${result.totalW}×${result.totalH}</div>
      <img src="${result.panoramic}" class="result-img" alt="Full panoramic wallpaper" />
      <div class="result-actions">
        <button class="btn-secondary" onclick="app.exporter.downloadSlice({dataURL:'${result.panoramic}',name:'panoramic',width:${result.totalW},height:${result.totalH}})">⬇ Download Panoramic</button>
        <button class="btn-primary" id="btn-download-zip">⬇ Download All ZIP</button>
      </div>
    `;
    container.appendChild(panoCard);

    document.getElementById('btn-download-zip')?.addEventListener('click', () => this._downloadZIP());

    // Per-monitor cards
    result.slices.forEach((slice, idx) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <div class="result-label">
          <span class="monitor-badge">${idx + 1}</span>
          ${slice.name} — ${slice.width}×${slice.height}
          <span class="orient-tag">${slice.orientation}</span>
        </div>
        <img src="${slice.dataURL}" class="result-img" alt="${slice.name}" />
        <div class="result-actions">
          <button class="btn-secondary btn-dl-slice" data-idx="${idx}">⬇ Download</button>
        </div>
      `;
      container.appendChild(card);

      card.querySelector('.btn-dl-slice').addEventListener('click', () => {
        this.exporter.downloadSlice(slice);
      });
    });
  }

  // ── Download ZIP ──────────────────────────────────────────────────────────

  async _downloadZIP() {
    const result = this.generator.generated;
    if (!result) { this._showToast('Generate wallpapers first!', 'warn'); return; }

    this._showToast('Preparing ZIP...', 'info');
    try {
      await this.exporter.downloadZIP(result.slices, result.panoramic, ({ pct, stage }) => {
        this._updateProgress(stage || `Packaging... ${pct}%`, pct);
      });
      this._showToast('ZIP downloaded! 🎉', 'success');
    } catch(e) {
      this._showToast(`ZIP error: ${e.message}`, 'error');
    }
  }

  // ── Reference Image ───────────────────────────────────────────────────────

  _loadReferenceImage(file) {
    const reader = new FileReader();
    reader.onload = e => {
      this._referenceImageData = e.target.result;
      const dropZone = document.getElementById('image-drop-zone');
      if (dropZone) {
        dropZone.innerHTML = `
          <img src="${e.target.result}" style="max-height:100px;max-width:100%;border-radius:6px;object-fit:contain;" />
          <div style="font-size:11px;color:#aaa;margin-top:6px;">${file.name}</div>
          <button class="btn-tiny" id="btn-clear-ref">✕ Clear</button>
        `;
        document.getElementById('btn-clear-ref')?.addEventListener('click', ev => {
          ev.stopPropagation();
          this._referenceImageData = null;
          dropZone.innerHTML = this._dropZonePlaceholder();
        });
      }
      this._showToast('Reference image loaded', 'success');
    };
    reader.readAsDataURL(file);
  }

  _dropZonePlaceholder() {
    return `<div class="drop-icon">🖼</div>
    <div>Drop an image here or click to browse</div>
    <div class="drop-sub">JPG, PNG, WebP — used as style reference</div>`;
  }

  // ── Preset Management ─────────────────────────────────────────────────────

  _savePreset() {
    const name = prompt('Preset name:', `Setup ${new Date().toLocaleDateString()}`);
    if (!name) return;
    this.layout.savePreset(name);
    this._showToast(`Preset "${name}" saved`, 'success');
  }

  _showPresetModal() {
    const presets = this.layout.listPresets();
    const modal   = document.getElementById('modal-presets');
    const list    = document.getElementById('preset-list');
    if (!modal || !list) return;

    list.innerHTML = presets.length === 0
      ? '<div class="empty-state">No presets saved yet</div>'
      : presets.map(p => `
          <div class="preset-item">
            <span>${p}</span>
            <div>
              <button class="btn-tiny btn-load-preset" data-name="${p}">Load</button>
              <button class="btn-tiny btn-del-preset"  data-name="${p}">✕</button>
            </div>
          </div>`).join('');

    list.querySelectorAll('.btn-load-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        this.layout.loadPreset(btn.dataset.name);
        modal.classList.remove('open');
        this._showToast(`Preset "${btn.dataset.name}" loaded`);
      });
    });

    list.querySelectorAll('.btn-del-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        this.layout.deletePreset(btn.dataset.name);
        this._showPresetModal();
      });
    });

    modal.classList.add('open');
  }

  // ── Settings Modal ────────────────────────────────────────────────────────

  _showSettingsModal() {
    const modal = document.getElementById('modal-settings');
    if (!modal) return;

    // Fill API key fields
    ['openai','stability','leonardo','replicate'].forEach(p => {
      const inp = document.getElementById(`key-${p}`);
      if (inp) inp.value = getApiKey(p);
    });

    // Fill local endpoints
    const cu = document.getElementById('endpoint-comfyui');
    const au = document.getElementById('endpoint-auto1111');
    if (cu) cu.value = IWConfig.localEndpoints.comfyui;
    if (au) au.value = IWConfig.localEndpoints.auto1111;

    modal.classList.add('open');
  }

  _saveSettings() {
    ['openai','stability','leonardo','replicate'].forEach(p => {
      const inp = document.getElementById(`key-${p}`);
      if (inp && inp.value.trim()) saveApiKey(p, inp.value.trim());
    });

    const cu = document.getElementById('endpoint-comfyui');
    const au = document.getElementById('endpoint-auto1111');
    if (cu && cu.value) IWConfig.localEndpoints.comfyui   = cu.value;
    if (au && au.value) IWConfig.localEndpoints.auto1111  = au.value;

    document.getElementById('modal-settings').classList.remove('open');
    this._showToast('Settings saved', 'success');
  }

  // ── Provider Badge ─────────────────────────────────────────────────────────

  _renderProviderBadge() {
    const el = document.getElementById('provider-badge');
    if (!el) return;
    const p = IWConfig.providers[IWConfig.activeProvider];
    el.textContent = p ? `${p.icon} ${p.name}` : IWConfig.activeProvider;

    document.querySelectorAll('[data-provider]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.provider === IWConfig.activeProvider);
    });
  }

  // ── History ───────────────────────────────────────────────────────────────

  _renderHistory() {
    const container = document.getElementById('history-grid');
    if (!container) return;
    const history = this.generator._loadHistory();
    container.innerHTML = '';

    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state">No generation history yet.<br>Generate your first wallpaper!</div>';
      return;
    }

    history.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'history-card';
      const date = new Date(entry.ts).toLocaleString();
      card.innerHTML = `
        ${entry.thumb ? `<img src="${entry.thumb}" class="history-thumb" alt="thumb" />` : '<div class="history-thumb-empty">🖼</div>'}
        <div class="history-info">
          <div class="history-prompt">${entry.prompt?.slice(0, 80)}${entry.prompt?.length > 80 ? '…' : ''}</div>
          <div class="history-meta">${date} · ${entry.quality?.toUpperCase() || ''} · ${entry.totalW}×${entry.totalH}</div>
          <button class="btn-tiny" onclick="document.getElementById('prompt-input').value='${entry.prompt?.replace(/'/g, "\\'")}'; app._switchTab('generate');">Reuse Prompt</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // ── Saved State ───────────────────────────────────────────────────────────

  _loadSavedState() {
    // Restore provider
    const savedProvider = localStorage.getItem('iw_provider');
    if (savedProvider && IWConfig.providers[savedProvider]) {
      IWConfig.activeProvider = savedProvider;
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  _startParticles() {
    if (!IWConfig.settings.animateParticles) return;
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const particles = [];

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        a: Math.random() * 0.5 + 0.1,
        color: Math.random() > 0.5 ? '#7b3fff' : '#00f0ff',
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(p.a * 255).toString(16).padStart(2, '0');
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
      }
      requestAnimationFrame(draw);
    };
    draw();
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  _showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { info: 'ℹ', success: '✓', warn: '⚠', error: '✕' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const app = new InfinityWallApp();
window.app = app;
