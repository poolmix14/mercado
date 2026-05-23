/**
 * InfinityWall AI — config.js
 * Centralized configuration and API provider management
 */

const INFINITYWALL_CONFIG = {
  // ── Active Provider ───────────────────────────────────────────────────────
  activeProvider: 'openai', // openai | stability | leonardo | replicate | comfyui | auto1111

  // ── API Keys (fill in your keys here) ─────────────────────────────────────
  apiKeys: {
    openai:    localStorage.getItem('iw_key_openai')    || '',
    stability: localStorage.getItem('iw_key_stability') || '',
    leonardo:  localStorage.getItem('iw_key_leonardo')  || '',
    replicate: localStorage.getItem('iw_key_replicate') || '',
  },

  // ── Local Endpoints ────────────────────────────────────────────────────────
  localEndpoints: {
    comfyui:  'http://127.0.0.1:8188',
    auto1111: 'http://127.0.0.1:7860',
  },

  // ── Provider Definitions ───────────────────────────────────────────────────
  providers: {
    openai: {
      name: 'OpenAI gpt-image-1',
      icon: '🤖',
      endpoint: 'https://api.openai.com/v1/images/generations',
      model: 'gpt-image-1',   // dall-e-3 removido em 12/05/2026
      maxSize: 1536,
      supportsEdit: true,
    },
    stability: {
      name: 'Stability AI Ultra',
      icon: '🎨',
      endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/ultra',
      model: 'stable-image-ultra',
      maxSize: 1440,
      supportsEdit: false,
    },
    leonardo: {
      name: 'Leonardo AI',
      icon: '🦁',
      endpoint: 'https://cloud.leonardo.ai/api/rest/v1/generations',
      model: 'aa77f04e-3eec-4034-9c07-d0a6f203aa56',
      maxSize: 1472,
      supportsEdit: false,
    },
    replicate: {
      name: 'Replicate FLUX 1.1',
      icon: '🔮',
      endpoint: 'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions',
      model: 'flux-1.1-pro',
      maxSize: 1440,
      supportsEdit: false,
    },
    comfyui: {
      name: 'ComfyUI (Local)',
      icon: '🖥️',
      local: true,
      maxSize: 2048,
    },
    auto1111: {
      name: 'Automatic1111 (Local)',
      icon: '⚙️',
      local: true,
      endpoint: '/sdapi/v1/txt2img',
      maxSize: 1536,
    },
  },

  // ── Image Quality Presets ──────────────────────────────────────────────────
  qualityPresets: {
    hd:         { label: 'HD',         width: 1280,  height: 720,   multiplier: 0.25 },
    fullhd:     { label: 'Full HD',    width: 1920,  height: 1080,  multiplier: 0.5  },
    '2k':       { label: '2K',         width: 2560,  height: 1440,  multiplier: 0.75 },
    '4k':       { label: '4K',         width: 3840,  height: 2160,  multiplier: 1.0  },
    ultrawide:  { label: 'UltraWide',  width: 5120,  height: 1440,  multiplier: 1.2  },
    '8k':       { label: '8K ⚡',      width: 7680,  height: 4320,  multiplier: 2.0  },
  },

  // ── Prompt Enhancement Affixes ─────────────────────────────────────────────
  promptEnhancement: {
    prefix: 'Ultra detailed cinematic wallpaper, photorealistic, ',
    suffix: ', epic composition, volumetric lighting, atmospheric depth, '
          + 'masterpiece quality, 8k resolution, sharp focus, HDR, '
          + 'professional photography, award winning, highly detailed, '
          + 'seamless panoramic, widescreen cinematic aspect ratio',
    negativePrompt: 'blurry, pixelated, distorted, low quality, watermark, '
                  + 'text, logo, frame, border, duplicate, tiling, repetition, '
                  + 'ugly, bad anatomy, deformed, artifacts',
  },

  // ── Style Presets ──────────────────────────────────────────────────────────
  stylePresets: [
    { id: 'cinematic',   label: 'Cinematic',     prompt: 'cinematic film still, dramatic lighting, movie scene, '   },
    { id: 'scifi',       label: 'Sci-Fi',         prompt: 'futuristic sci-fi environment, neon lights, cyberpunk, '  },
    { id: 'fantasy',     label: 'Fantasy',        prompt: 'epic fantasy landscape, magical atmosphere, mystical, '   },
    { id: 'nature',      label: 'Nature',         prompt: 'breathtaking natural landscape, golden hour, pristine, '  },
    { id: 'abstract',    label: 'Abstract',       prompt: 'abstract digital art, geometric patterns, vivid colors, ' },
    { id: 'space',       label: 'Deep Space',     prompt: 'deep space nebula, cosmos, stars, galaxy, astronomical, ' },
    { id: 'underwater',  label: 'Underwater',     prompt: 'bioluminescent underwater scene, ocean depths, coral, '   },
    { id: 'apocalyptic', label: 'Apocalyptic',    prompt: 'post-apocalyptic landscape, ruins, dramatic sky, epic, '  },
  ],

  // ── App Settings ───────────────────────────────────────────────────────────
  settings: {
    maxMonitors: 8,
    defaultResolution: '1920x1080',
    defaultOrientation: 'horizontal',
    previewScale: 0.15,
    bezelWidth: 8, // px in preview
    animateParticles: true,
    autoEnhancePrompts: true,
    saveHistory: true,
    maxHistoryItems: 20,
  },
};

// ── Persist API keys on change ─────────────────────────────────────────────
function saveApiKey(provider, key) {
  localStorage.setItem(`iw_key_${provider}`, key);
  INFINITYWALL_CONFIG.apiKeys[provider] = key;
}

function getApiKey(provider) {
  return localStorage.getItem(`iw_key_${provider}`) || '';
}

function saveSettings(patch) {
  Object.assign(INFINITYWALL_CONFIG.settings, patch);
  localStorage.setItem('iw_settings', JSON.stringify(INFINITYWALL_CONFIG.settings));
}

// Load persisted settings
try {
  const saved = localStorage.getItem('iw_settings');
  if (saved) Object.assign(INFINITYWALL_CONFIG.settings, JSON.parse(saved));
} catch(e) {}

window.IWConfig    = INFINITYWALL_CONFIG;
window.saveApiKey  = saveApiKey;
window.getApiKey   = getApiKey;
window.saveSettings = saveSettings;
