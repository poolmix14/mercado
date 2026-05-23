/**
 * InfinityWall AI — modules/exporter.js
 * Handles individual and ZIP wallpaper downloads
 */

class Exporter {
  constructor() {
    this.JSZipLoaded = false;
  }

  // ── Load JSZip lazily ─────────────────────────────────────────────────────

  async _ensureJSZip() {
    if (window.JSZip) return;
    await new Promise((res, rej) => {
      const s   = document.createElement('script');
      s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload  = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // ── Download single wallpaper ─────────────────────────────────────────────

  downloadSlice(slice) {
    const filename = this._sanitize(slice.name)
                   + `_${slice.width}x${slice.height}.png`;
    this._triggerDownload(slice.dataURL, filename);
  }

  // ── Download all as ZIP ───────────────────────────────────────────────────

  async downloadZIP(slices, panoramic, onProgress) {
    await this._ensureJSZip();
    const zip = new JSZip();

    // Add panoramic
    if (panoramic) {
      const panoBlob = await this._dataURLtoBlob(panoramic);
      zip.file('panoramic_full.png', panoBlob);
    }

    // Add each slice
    for (let i = 0; i < slices.length; i++) {
      const s     = slices[i];
      const fname = `${String(i + 1).padStart(2, '0')}_${this._sanitize(s.name)}_${s.width}x${s.height}.png`;
      const blob  = await this._dataURLtoBlob(s.dataURL);
      zip.file(fname, blob);
      onProgress?.({ pct: Math.round((i + 1) / slices.length * 80) });
    }

    // Add README
    zip.file('README.txt', this._buildReadme(slices));

    onProgress?.({ pct: 90, stage: 'Compressing...' });

    const blob     = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const ts       = new Date().toISOString().slice(0, 10);
    const filename = `InfinityWall_${ts}.zip`;
    this._triggerDownload(URL.createObjectURL(blob), filename);

    onProgress?.({ pct: 100, stage: 'Downloaded!' });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  _triggerDownload(href, filename) {
    const a    = document.createElement('a');
    a.href     = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async _dataURLtoBlob(dataURL) {
    const res  = await fetch(dataURL);
    return res.blob();
  }

  _sanitize(name) {
    return name.replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase();
  }

  _buildReadme(slices) {
    const lines = [
      'InfinityWall AI — Multi-Monitor Wallpaper Package',
      '='.repeat(50),
      `Generated: ${new Date().toLocaleString()}`,
      '',
      'FILES:',
      '  panoramic_full.png  →  Full panoramic image (all monitors combined)',
      '',
      'MONITOR WALLPAPERS:',
    ];
    slices.forEach((s, i) => {
      lines.push(`  ${String(i + 1).padStart(2, '0')}_${s.name} — ${s.width}×${s.height}px (${s.orientation})`);
    });
    lines.push('');
    lines.push('HOW TO USE:');
    lines.push('  Set each numbered file as the wallpaper on the corresponding monitor.');
    lines.push('  The images form a continuous panoramic artwork across all screens.');
    lines.push('');
    lines.push('Made with InfinityWall AI — github.com/infinitywall');
    return lines.join('\n');
  }
}

window.Exporter = Exporter;
