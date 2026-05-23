/**
 * InfinityWall AI — app.js
 * Compatível com Safari iOS / iPhone / iPad
 */

// ── Safe localStorage (Safari private mode bloqueia) ──────────────────────
var safeStorage = {
  _mem: {},
  get: function(k) {
    try { return localStorage.getItem(k); } catch(e) { return this._mem[k] || null; }
  },
  set: function(k, v) {
    try { localStorage.setItem(k, v); } catch(e) { this._mem[k] = v; }
  },
  remove: function(k) {
    try { localStorage.removeItem(k); } catch(e) { delete this._mem[k]; }
  }
};
window.safeStorage = safeStorage;

// Redefine getApiKey / saveApiKey usando safeStorage
window.getApiKey = function(provider) {
  return safeStorage.get('iw_key_' + provider) || '';
};
window.saveApiKey = function(provider, key) {
  safeStorage.set('iw_key_' + provider, key);
  IWConfig.apiKeys[provider] = key;
};

// ── App Principal ──────────────────────────────────────────────────────────
function InfinityWallApp() {
  this.layout       = new MonitorLayout();
  this.ai           = new AIEngine(IWConfig);
  this.generator    = new WallpaperGenerator(this.layout, this.ai);
  this.exporter     = new Exporter();
  this.preview      = null;
  this.activeTab    = 'setup';
  this.isGenerating = false;
  this._referenceImageData = null;

  var self = this;
  // Safari-safe: checar se DOM já carregou
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { self._boot(); });
  } else {
    // DOM já pronto (scripts no final do body)
    setTimeout(function() { self._boot(); }, 0);
  }
}

InfinityWallApp.prototype._boot = function() {
  this._initPreview();
  this._bindUI();
  this._loadSavedState();
  this._startParticles();

  if (this.layout.monitors.length === 0) {
    this.layout.addMonitor({ name: 'Monitor 1', width: 1920, height: 1080 });
    this.layout.addMonitor({ name: 'Monitor 2', width: 1920, height: 1080 });
  }
  this._renderMonitorList();
  this._renderProviderBadge();
};

// ── Preview ────────────────────────────────────────────────────────────────
InfinityWallApp.prototype._initPreview = function() {
  var container = document.getElementById('preview-container');
  if (!container) return;
  this.preview = new PreviewEngine(this.layout, container);
  var self = this;
  this.layout.onChange = function() {
    self._renderMonitorList();
    self.preview.render();
    self._updateCanvasStats();
  };
};

// ── UI Binding ─────────────────────────────────────────────────────────────
InfinityWallApp.prototype._bindUI = function() {
  var self = this;

  // Tab nav
  var tabBtns = document.querySelectorAll('[data-tab]');
  for (var i = 0; i < tabBtns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() { self._switchTab(btn.getAttribute('data-tab')); });
    })(tabBtns[i]);
  }

  // Monitor controls
  var btnAdd = document.getElementById('btn-add-monitor');
  if (btnAdd) btnAdd.addEventListener('click', function() { self._addMonitor(); });

  var btnArH = document.getElementById('btn-arrange-h');
  if (btnArH) btnArH.addEventListener('click', function() {
    self.layout.autoArrangeHorizontal();
    self._showToast('Monitores alinhados horizontalmente');
  });

  var btnArG = document.getElementById('btn-arrange-grid');
  if (btnArG) btnArG.addEventListener('click', function() {
    self.layout.autoArrangeGrid();
    self._showToast('Monitores em grade');
  });

  // Presets
  var btnSaveP = document.getElementById('btn-save-preset');
  if (btnSaveP) btnSaveP.addEventListener('click', function() { self._savePreset(); });

  var btnLoadP = document.getElementById('btn-load-preset');
  if (btnLoadP) btnLoadP.addEventListener('click', function() { self._showPresetModal(); });

  // Generate
  var btnGen = document.getElementById('btn-generate');
  if (btnGen) btnGen.addEventListener('click', function() { self._generate(); });

  var btnClrPrompt = document.getElementById('btn-clear-prompt');
  if (btnClrPrompt) btnClrPrompt.addEventListener('click', function() {
    var el = document.getElementById('prompt-input');
    if (el) el.value = '';
  });

  // Style presets
  this._renderStylePresets();

  // Image upload
  var dropZone  = document.getElementById('image-drop-zone');
  var fileInput = document.getElementById('ref-image-input');
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', function() { fileInput.click(); });
    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function() {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      var file = e.dataTransfer && e.dataTransfer.files[0];
      if (file) self._loadReferenceImage(file);
    });
    fileInput.addEventListener('change', function(e) {
      if (e.target.files && e.target.files[0]) self._loadReferenceImage(e.target.files[0]);
    });
  }

  // Export ZIP
  var btnZip = document.getElementById('btn-download-zip');
  if (btnZip) btnZip.addEventListener('click', function() { self._downloadZIP(); });

  // Settings
  var btnSettings = document.getElementById('btn-open-settings');
  if (btnSettings) btnSettings.addEventListener('click', function() { self._showSettingsModal(); });

  var btnSaveSet = document.getElementById('btn-save-settings');
  if (btnSaveSet) btnSaveSet.addEventListener('click', function() { self._saveSettings(); });

  // Provider selector
  var provBtns = document.querySelectorAll('[data-provider]');
  for (var p = 0; p < provBtns.length; p++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        IWConfig.activeProvider = btn.getAttribute('data-provider');
        var all = document.querySelectorAll('[data-provider]');
        for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
        btn.classList.add('active');
        self._renderProviderBadge();
        safeStorage.set('iw_provider', IWConfig.activeProvider);
      });
    })(provBtns[p]);
  }

  // Quality selector
  var qualBtns = document.querySelectorAll('[data-quality]');
  for (var q = 0; q < qualBtns.length; q++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var all = document.querySelectorAll('[data-quality]');
        for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
        btn.classList.add('active');
      });
    })(qualBtns[q]);
  }

  // Enhance toggle
  var toggleEnh = document.getElementById('toggle-enhance');
  if (toggleEnh) toggleEnh.addEventListener('change', function() {
    IWConfig.settings.autoEnhancePrompts = toggleEnh.checked;
  });

  // Preview scale
  var scaleSlider = document.getElementById('preview-scale');
  if (scaleSlider) scaleSlider.addEventListener('input', function() {
    if (self.preview) self.preview.setScale(parseFloat(scaleSlider.value));
  });

  // History tab
  var btnHistory = document.getElementById('btn-show-history');
  if (btnHistory) btnHistory.addEventListener('click', function() { self._renderHistory(); });

  // Quick preset buttons (Setup tab)
  var presetBtns = document.querySelectorAll('[data-preset]');
  for (var pi = 0; pi < presetBtns.length; pi++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        self._applyQuickPreset(btn.getAttribute('data-preset'));
      });
    })(presetBtns[pi]);
  }

  // Quick prompt chips (Generate tab)
  var qpContainer = document.getElementById('quick-prompts');
  if (qpContainer) {
    var qpBtns = qpContainer.querySelectorAll('[data-qp]');
    for (var qi = 0; qi < qpBtns.length; qi++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var el = document.getElementById('prompt-input');
          if (el) el.value = btn.getAttribute('data-qp');
        });
      })(qpBtns[qi]);
    }
  }

  // Second settings button (inside Generate tab)
  var btnSet2 = document.getElementById('btn-open-settings-2');
  if (btnSet2) btnSet2.addEventListener('click', function() { self._showSettingsModal(); });

  // Clear history button
  var btnClrHist = document.getElementById('btn-clear-history');
  if (btnClrHist) btnClrHist.addEventListener('click', function() {
    if (confirm('Limpar todo o histórico?')) {
      safeStorage.remove('iw_history');
      self._renderHistory();
    }
  });

  // Modal close
  var closeBtns = document.querySelectorAll('.modal-close, .modal-backdrop');
  for (var c = 0; c < closeBtns.length; c++) {
    closeBtns[c].addEventListener('click', function() {
      var modals = document.querySelectorAll('.modal');
      for (var m = 0; m < modals.length; m++) modals[m].classList.remove('open');
    });
  }
};

// ── Tab Switching ──────────────────────────────────────────────────────────
InfinityWallApp.prototype._switchTab = function(tab) {
  this.activeTab = tab;
  var tabBtns = document.querySelectorAll('[data-tab]');
  for (var i = 0; i < tabBtns.length; i++) {
    tabBtns[i].classList.toggle('active', tabBtns[i].getAttribute('data-tab') === tab);
  }
  var panels = document.querySelectorAll('.tab-panel');
  for (var j = 0; j < panels.length; j++) {
    panels[j].classList.toggle('active', panels[j].getAttribute('data-panel') === tab);
  }
  if (tab === 'history') this._renderHistory();
  if (tab === 'results' && this.generator.generated) this._renderResults();
};

// ── Monitor Management ─────────────────────────────────────────────────────
InfinityWallApp.prototype._addMonitor = function() {
  var count = this.layout.monitors.length + 1;
  if (count > IWConfig.settings.maxMonitors) {
    this._showToast('Máximo de ' + IWConfig.settings.maxMonitors + ' monitores', 'warn');
    return;
  }
  var last = this.layout.monitors[this.layout.monitors.length - 1];
  var posX = last ? last.posX + (last.orientation === 'vertical' ? last.height : last.width) + 20 : 0;
  this.layout.addMonitor({ name: 'Monitor ' + count, posX: posX });
  this._showToast('Monitor ' + count + ' adicionado');
};

InfinityWallApp.prototype._renderMonitorList = function() {
  var container = document.getElementById('monitor-list');
  if (!container) return;
  var self = this;
  container.innerHTML = '';

  if (this.layout.monitors.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum monitor adicionado.<br>Clique em "+ Add Monitor".</div>';
    this._updateCanvasStats();
    return;
  }

  for (var idx = 0; idx < this.layout.monitors.length; idx++) {
    (function(m) {
      var dims = self.layout.getMonitorDimensions(m);
      var card = document.createElement('div');
      card.className = 'monitor-card';

      // Build resolution options
      var resOptions = '';
      var reses = self.layout.COMMON_RESOLUTIONS;
      for (var r = 0; r < reses.length; r++) {
        var parts = reses[r].split('x').map(Number);
        var rw = parts[0], rh = parts[1];
        var landscape = Math.max(m.width, m.height);
        var portrait  = Math.min(m.width, m.height);
        var sel = (Math.max(rw,rh) === landscape && Math.min(rw,rh) === portrait) ? 'selected' : '';
        resOptions += '<option value="' + reses[r] + '" ' + sel + '>' + reses[r] + '</option>';
      }
      resOptions += '<option value="custom">Personalizado...</option>';

      card.innerHTML =
        '<div class="monitor-card-header">' +
          '<div class="monitor-icon">' + (m.orientation === 'vertical' ? '▯' : '▭') + '</div>' +
          '<input class="monitor-name-input" value="' + m.name + '" data-id="' + m.id + '" />' +
          '<button class="btn-icon btn-delete-monitor" data-id="' + m.id + '">✕</button>' +
        '</div>' +
        '<div class="monitor-card-body">' +
          '<div class="field-group">' +
            '<label>Resolução</label>' +
            '<select class="monitor-res" data-id="' + m.id + '">' + resOptions + '</select>' +
          '</div>' +
          '<div class="field-group">' +
            '<label>Orientação</label>' +
            '<div class="orient-toggle">' +
              '<button class="orient-btn ' + (m.orientation === 'horizontal' ? 'active' : '') + '" data-id="' + m.id + '" data-orient="horizontal">↔ Horizontal</button>' +
              '<button class="orient-btn ' + (m.orientation === 'vertical' ? 'active' : '') + '" data-id="' + m.id + '" data-orient="vertical">↕ Vertical</button>' +
            '</div>' +
          '</div>' +
          '<div class="monitor-dims">' + dims.width + ' × ' + dims.height + ' px · ' + m.orientation + '</div>' +
        '</div>';

      container.appendChild(card);

      // Name input
      card.querySelector('.monitor-name-input').addEventListener('change', function(e) {
        self.layout.updateMonitor(parseInt(e.target.getAttribute('data-id')), { name: e.target.value });
      });

      // Delete button
      card.querySelector('.btn-delete-monitor').addEventListener('click', function(e) {
        self.layout.removeMonitor(parseInt(e.currentTarget.getAttribute('data-id')));
        self._showToast('Monitor removido');
      });

      // Resolution select
      card.querySelector('.monitor-res').addEventListener('change', function(e) {
        var val = e.target.value;
        var id  = parseInt(e.target.getAttribute('data-id'));
        if (val === 'custom') {
          var custom = prompt('Digite a resolução (ex: 2560x1080):');
          if (!custom) return;
          var p = self.layout.parseResolution(custom);
          self.layout.updateMonitor(id, { width: Math.max(p.width,p.height), height: Math.min(p.width,p.height) });
        } else {
          var p2 = self.layout.parseResolution(val);
          self.layout.updateMonitor(id, { width: Math.max(p2.width,p2.height), height: Math.min(p2.width,p2.height) });
        }
        self._renderMonitorList();
      });

      // Orientation buttons
      var orientBtns = card.querySelectorAll('.orient-btn');
      for (var ob = 0; ob < orientBtns.length; ob++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            self.layout.updateMonitor(
              parseInt(btn.getAttribute('data-id')),
              { orientation: btn.getAttribute('data-orient') }
            );
            self._renderMonitorList();
          });
        })(orientBtns[ob]);
      }
    })(this.layout.monitors[idx]);
  }

  this._updateCanvasStats();
};

InfinityWallApp.prototype._updateCanvasStats = function() {
  var el = document.getElementById('canvas-stats');
  if (!el) return;
  var bounds = this.layout.getCanvasBounds();
  var n = this.layout.monitors.length;
  el.textContent = n > 0
    ? 'Canvas total: ' + Math.round(bounds.rawWidth) + ' × ' + Math.round(bounds.rawHeight) + ' px — ' + n + ' monitor' + (n !== 1 ? 'es' : '')
    : 'Nenhum monitor configurado';
};

// ── Style Presets ──────────────────────────────────────────────────────────
InfinityWallApp.prototype._renderStylePresets = function() {
  var container = document.getElementById('style-presets');
  if (!container) return;
  var self = this;
  container.innerHTML = '';

  var all = [{ id: '', label: '✨ Auto' }].concat(IWConfig.stylePresets);
  for (var i = 0; i < all.length; i++) {
    (function(style) {
      var btn = document.createElement('button');
      btn.className = 'style-chip' + (style.id === '' ? ' active' : '');
      btn.textContent = style.label;
      btn.setAttribute('data-style', style.id);
      btn.addEventListener('click', function() {
        var chips = container.querySelectorAll('.style-chip');
        for (var j = 0; j < chips.length; j++) chips[j].classList.remove('active');
        btn.classList.add('active');
      });
      container.appendChild(btn);
    })(all[i]);
  }
};

// ── Generate ───────────────────────────────────────────────────────────────
InfinityWallApp.prototype._generate = function() {
  if (this.isGenerating) return;
  var promptEl = document.getElementById('prompt-input');
  var prompt = promptEl ? promptEl.value.trim() : '';
  if (!prompt) { this._showToast('Digite um prompt primeiro!', 'warn'); return; }
  if (this.layout.monitors.length === 0) { this._showToast('Adicione pelo menos um monitor!', 'warn'); return; }

  var activeChip = document.querySelector('.style-chip.active');
  var style   = activeChip ? activeChip.getAttribute('data-style') : '';
  var activeQ = document.querySelector('[data-quality].active');
  var quality = activeQ ? activeQ.getAttribute('data-quality') : '4k';
  var refImg  = this._referenceImageData || null;

  this.isGenerating = true;
  this._setGenerating(true);
  this._switchTab('results');

  var self = this;
  this.generator.generate({
    prompt:         prompt,
    style:          style,
    quality:        quality,
    referenceImage: refImg,
    onProgress:     function(info) { self._updateProgress(info.stage, info.pct); }
  }).then(function(result) {
    if (self.preview) self.preview.setPanoramic(result.panoramic);
    self._renderResults(result);
    self._showToast('Geração completa! 🎉', 'success');
  }).catch(function(err) {
    self._showToast('Erro: ' + err.message, 'error');
    self._updateProgress('Falha na geração', 0);
    console.error('Erro de geração:', err);
  }).finally(function() {
    self.isGenerating = false;
    self._setGenerating(false);
  });
};

InfinityWallApp.prototype._setGenerating = function(on) {
  var btn = document.getElementById('btn-generate');
  if (!btn) return;
  btn.disabled = on;
  btn.textContent = on ? '⏳ Gerando...' : '⚡ Gerar Wallpapers';
  if (on) btn.classList.add('generating');
  else    btn.classList.remove('generating');
};

InfinityWallApp.prototype._updateProgress = function(stage, pct) {
  var bar   = document.getElementById('progress-bar');
  var label = document.getElementById('progress-label');
  var wrap  = document.getElementById('progress-wrap');
  if (wrap)  wrap.style.display = (pct > 0 && pct < 100) ? 'block' : (pct === 100 ? 'none' : 'block');
  if (bar)   { bar.style.width = pct + '%'; bar.setAttribute('aria-valuenow', pct); }
  if (label) label.textContent = stage || '';
};

// ── Results ────────────────────────────────────────────────────────────────
InfinityWallApp.prototype._renderResults = function(result) {
  result = result || this.generator.generated;
  if (!result) return;
  var self = this;
  var container = document.getElementById('results-grid');
  if (!container) return;
  container.innerHTML = '';

  // Panoramic card
  var panoCard = document.createElement('div');
  panoCard.className = 'result-card result-panoramic';
  panoCard.innerHTML =
    '<div class="result-label">🌐 Panorâmico Completo — ' + result.totalW + '×' + result.totalH + '</div>' +
    '<img src="' + result.panoramic + '" class="result-img" alt="Wallpaper panorâmico" />' +
    '<div class="result-actions">' +
      '<button class="btn-secondary" id="btn-dl-pano">⬇ Baixar Panorâmico</button>' +
      '<button class="btn-primary"   id="btn-download-zip">⬇ Baixar ZIP</button>' +
    '</div>';
  container.appendChild(panoCard);

  document.getElementById('btn-dl-pano').addEventListener('click', function() {
    self.exporter.downloadSlice({ dataURL: result.panoramic, name: 'panoramico', width: result.totalW, height: result.totalH });
  });
  document.getElementById('btn-download-zip').addEventListener('click', function() { self._downloadZIP(); });

  // Per-monitor cards
  for (var i = 0; i < result.slices.length; i++) {
    (function(slice, idx) {
      var card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML =
        '<div class="result-label">' +
          '<span class="monitor-badge">' + (idx + 1) + '</span>' +
          slice.name + ' — ' + slice.width + '×' + slice.height +
          '<span class="orient-tag">' + slice.orientation + '</span>' +
        '</div>' +
        '<img src="' + slice.dataURL + '" class="result-img" alt="' + slice.name + '" />' +
        '<div class="result-actions">' +
          '<button class="btn-secondary btn-dl-slice">⬇ Baixar</button>' +
        '</div>';
      container.appendChild(card);
      card.querySelector('.btn-dl-slice').addEventListener('click', function() {
        self.exporter.downloadSlice(slice);
      });
    })(result.slices[i], i);
  }
};

// ── Download ZIP ───────────────────────────────────────────────────────────
InfinityWallApp.prototype._downloadZIP = function() {
  var result = this.generator.generated;
  if (!result) { this._showToast('Gere wallpapers primeiro!', 'warn'); return; }
  var self = this;
  this._showToast('Preparando ZIP...', 'info');
  this.exporter.downloadZIP(result.slices, result.panoramic, function(info) {
    self._updateProgress((info.stage || 'Empacotando... ') + info.pct + '%', info.pct);
  }).then(function() {
    self._showToast('ZIP baixado! 🎉', 'success');
  }).catch(function(e) {
    self._showToast('Erro ZIP: ' + e.message, 'error');
  });
};

// ── Reference Image ────────────────────────────────────────────────────────
InfinityWallApp.prototype._loadReferenceImage = function(file) {
  var self = this;
  var reader = new FileReader();
  reader.onload = function(e) {
    self._referenceImageData = e.target.result;
    var dropZone = document.getElementById('image-drop-zone');
    if (dropZone) {
      dropZone.innerHTML =
        '<img src="' + e.target.result + '" style="max-height:100px;max-width:100%;border-radius:6px;object-fit:contain;" />' +
        '<div style="font-size:11px;color:#aaa;margin-top:6px;">' + file.name + '</div>' +
        '<button class="btn-tiny" id="btn-clear-ref">✕ Remover</button>';
      document.getElementById('btn-clear-ref').addEventListener('click', function(ev) {
        ev.stopPropagation();
        self._referenceImageData = null;
        dropZone.innerHTML = self._dropZonePlaceholder();
        // Re-bind click
        dropZone.addEventListener('click', function() {
          var fi = document.getElementById('ref-image-input');
          if (fi) fi.click();
        });
      });
    }
    self._showToast('Imagem de referência carregada', 'success');
  };
  reader.readAsDataURL(file);
};

InfinityWallApp.prototype._dropZonePlaceholder = function() {
  return '<div class="drop-icon">🖼</div>' +
    '<div>Solte uma imagem aqui ou clique para selecionar</div>' +
    '<div class="drop-sub">JPG, PNG, WebP — usada como referência de estilo</div>';
};

// ── Presets ────────────────────────────────────────────────────────────────
InfinityWallApp.prototype._savePreset = function() {
  var name = prompt('Nome do preset:', 'Setup ' + new Date().toLocaleDateString());
  if (!name) return;
  this.layout.savePreset(name);
  this._showToast('Preset "' + name + '" salvo', 'success');
};

InfinityWallApp.prototype._showPresetModal = function() {
  var self    = this;
  var presets = this.layout.listPresets();
  var modal   = document.getElementById('modal-presets');
  var list    = document.getElementById('preset-list');
  if (!modal || !list) return;

  if (presets.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum preset salvo ainda</div>';
  } else {
    list.innerHTML = '';
    for (var i = 0; i < presets.length; i++) {
      (function(name) {
        var item = document.createElement('div');
        item.className = 'preset-item';
        item.innerHTML =
          '<span>' + name + '</span>' +
          '<div>' +
            '<button class="btn-tiny btn-load-preset">Carregar</button>' +
            '<button class="btn-tiny btn-del-preset">✕</button>' +
          '</div>';
        list.appendChild(item);
        item.querySelector('.btn-load-preset').addEventListener('click', function() {
          self.layout.loadPreset(name);
          modal.classList.remove('open');
          self._showToast('Preset "' + name + '" carregado');
        });
        item.querySelector('.btn-del-preset').addEventListener('click', function() {
          self.layout.deletePreset(name);
          self._showPresetModal();
        });
      })(presets[i]);
    }
  }
  modal.classList.add('open');
};

// ── Settings ───────────────────────────────────────────────────────────────
InfinityWallApp.prototype._showSettingsModal = function() {
  var modal = document.getElementById('modal-settings');
  if (!modal) return;
  var providers = ['openai','stability','leonardo','replicate'];
  for (var i = 0; i < providers.length; i++) {
    var inp = document.getElementById('key-' + providers[i]);
    if (inp) inp.value = getApiKey(providers[i]);
  }
  var cu = document.getElementById('endpoint-comfyui');
  var au = document.getElementById('endpoint-auto1111');
  if (cu) cu.value = IWConfig.localEndpoints.comfyui;
  if (au) au.value = IWConfig.localEndpoints.auto1111;
  modal.classList.add('open');
};

InfinityWallApp.prototype._saveSettings = function() {
  var providers = ['openai','stability','leonardo','replicate'];
  for (var i = 0; i < providers.length; i++) {
    var inp = document.getElementById('key-' + providers[i]);
    if (inp && inp.value.trim()) saveApiKey(providers[i], inp.value.trim());
  }
  var cu = document.getElementById('endpoint-comfyui');
  var au = document.getElementById('endpoint-auto1111');
  if (cu && cu.value) IWConfig.localEndpoints.comfyui  = cu.value;
  if (au && au.value) IWConfig.localEndpoints.auto1111 = au.value;
  document.getElementById('modal-settings').classList.remove('open');
  this._showToast('Configurações salvas', 'success');
};

// ── Provider Badge ─────────────────────────────────────────────────────────
InfinityWallApp.prototype._renderProviderBadge = function() {
  var el = document.getElementById('provider-badge');
  if (!el) return;
  var p = IWConfig.providers[IWConfig.activeProvider];
  el.textContent = p ? (p.icon + ' ' + p.name) : IWConfig.activeProvider;
  var btns = document.querySelectorAll('[data-provider]');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-provider') === IWConfig.activeProvider);
  }
};

// ── History ────────────────────────────────────────────────────────────────
InfinityWallApp.prototype._renderHistory = function() {
  var container = document.getElementById('history-grid');
  if (!container) return;
  var history = this.generator._loadHistory();
  container.innerHTML = '';

  if (history.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum histórico ainda.<br>Gere seu primeiro wallpaper!</div>';
    return;
  }

  for (var i = 0; i < history.length; i++) {
    (function(entry) {
      var card = document.createElement('div');
      card.className = 'history-card';
      var date = new Date(entry.ts).toLocaleString();
      var thumb = entry.thumb
        ? '<img src="' + entry.thumb + '" class="history-thumb" alt="thumb" />'
        : '<div class="history-thumb-empty">🖼</div>';
      var prompt = (entry.prompt || '').slice(0, 80) + ((entry.prompt || '').length > 80 ? '…' : '');
      card.innerHTML =
        thumb +
        '<div class="history-info">' +
          '<div class="history-prompt">' + prompt + '</div>' +
          '<div class="history-meta">' + date + ' · ' + (entry.quality || '').toUpperCase() + ' · ' + entry.totalW + '×' + entry.totalH + '</div>' +
          '<button class="btn-tiny btn-reuse-prompt" data-prompt="' + (entry.prompt || '').replace(/"/g, '&quot;') + '">Reusar Prompt</button>' +
        '</div>';
      container.appendChild(card);
      card.querySelector('.btn-reuse-prompt').addEventListener('click', function() {
        var el = document.getElementById('prompt-input');
        if (el) el.value = entry.prompt || '';
        app._switchTab('generate');
      });
    })(history[i]);
  }
};

// ── Quick Presets ──────────────────────────────────────────────────────────
InfinityWallApp.prototype._applyQuickPreset = function(preset) {
  this.layout.monitors = [];
  this.layout.nextId   = 1;
  var self = this;

  function add(name, w, h, orient, posX, posY) {
    self.layout.monitors.push({
      id: self.layout.nextId++,
      name: name, width: w, height: h,
      orientation: orient,
      posX: posX || 0, posY: posY || 0,
      bezel: 8, enabled: true
    });
  }

  switch(preset) {
    case 'dual-fhd':
      add('Monitor 1', 1920, 1080, 'horizontal', 0,    0);
      add('Monitor 2', 1920, 1080, 'horizontal', 1940, 0);
      break;
    case 'triple-fhd':
      add('Monitor 1', 1920, 1080, 'horizontal', 0,    0);
      add('Monitor 2', 1920, 1080, 'horizontal', 1940, 0);
      add('Monitor 3', 1920, 1080, 'horizontal', 3880, 0);
      break;
    case 'dual-4k':
      add('Monitor 1', 3840, 2160, 'horizontal', 0,    0);
      add('Monitor 2', 3840, 2160, 'horizontal', 3860, 0);
      break;
    case 'vertical-pair':
      add('Monitor 1', 1080, 1920, 'vertical',   0,    0);
      add('Monitor 2', 1920, 1080, 'horizontal', 1100, 420);
      break;
    case 'gaming-triple':
      add('Monitor L', 1080, 1920, 'vertical',   0,    0);
      add('Monitor C', 2560, 1440, 'horizontal', 1100, 240);
      add('Monitor R', 1080, 1920, 'vertical',   3680, 0);
      break;
    case 'ultrawide':
      add('UltraWide', 5120, 1440, 'horizontal', 0, 0);
      break;
  }

  this.layout._notify();
  this._renderMonitorList();
  this._showToast('Preset aplicado!', 'success');
  this._switchTab('setup');
};

// ── Saved State ────────────────────────────────────────────────────────────
InfinityWallApp.prototype._loadSavedState = function() {
  var savedProvider = safeStorage.get('iw_provider');
  if (savedProvider && IWConfig.providers[savedProvider]) {
    IWConfig.activeProvider = savedProvider;
  }
};

// ── Particles ──────────────────────────────────────────────────────────────
InfinityWallApp.prototype._startParticles = function() {
  var canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var particles = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  for (var i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      a: Math.random() * 0.5 + 0.1,
      color: Math.random() > 0.5 ? '#7b3fff' : '#00f0ff'
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      var alpha = Math.round(p.a * 255).toString(16);
      if (alpha.length < 2) alpha = '0' + alpha;
      ctx.fillStyle = p.color + alpha;
      ctx.fill();
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
    }
    requestAnimationFrame(draw);
  }
  draw();
};

// ── Toast ──────────────────────────────────────────────────────────────────
InfinityWallApp.prototype._showToast = function(msg, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  if (!container) return;
  var icons = { info: 'ℹ', success: '✓', warn: '⚠', error: '✕' };
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ') + '</span><span>' + msg + '</span>';
  container.appendChild(toast);
  setTimeout(function() { toast.classList.add('visible'); }, 10);
  setTimeout(function() {
    toast.classList.remove('visible');
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 400);
  }, 3500);
};

// ── Bootstrap ──────────────────────────────────────────────────────────────
var app = new InfinityWallApp();
window.app = app;
