/**
 * InfinityWall AI — modules/ai.js
 * Unified AI image generation — providers atualizados maio/2026
 *
 * OpenAI   → gpt-image-1 (dall-e-3 foi removido em 12/05/2026)
 * Stability→ stable-image/generate/ultra (nova API v2beta)
 * Leonardo → v1/generations  (igual)
 * Replicate→ black-forest-labs/flux-1.1-pro (modelo mais atual)
 * ComfyUI  → local
 * Auto1111 → local
 */

class AIEngine {
  constructor(config) { this.config = config; }

  // ── Prompt Enhancement ─────────────────────────────────────────────────────
  enhancePrompt(userPrompt, style = null) {
    if (!IWConfig.settings.autoEnhancePrompts) return userPrompt;
    const enh      = IWConfig.promptEnhancement;
    const styleStr = style ? (IWConfig.stylePresets.find(s => s.id === style)?.prompt || '') : '';
    return `${enh.prefix}${styleStr}${userPrompt}${enh.suffix}`;
  }

  // ── Entry point ────────────────────────────────────────────────────────────
  async generatePanoramic({ prompt, style, width, height, referenceImage = null, onProgress }) {
    const provider = IWConfig.activeProvider;
    const enhanced = this.enhancePrompt(prompt, style);

    onProgress?.({ stage: 'Melhorando o prompt...', pct: 5 });

    let imageData;
    switch (provider) {
      case 'openai':
        imageData = await this._generateOpenAI({ prompt: enhanced, width, height, referenceImage, onProgress });
        break;
      case 'stability':
        imageData = await this._generateStability({ prompt: enhanced, width, height, onProgress });
        break;
      case 'leonardo':
        imageData = await this._generateLeonardo({ prompt: enhanced, width, height, onProgress });
        break;
      case 'replicate':
        imageData = await this._generateReplicate({ prompt: enhanced, width, height, onProgress });
        break;
      case 'comfyui':
        imageData = await this._generateComfyUI({ prompt: enhanced, width, height, onProgress });
        break;
      case 'auto1111':
        imageData = await this._generateAuto1111({ prompt: enhanced, width, height, onProgress });
        break;
      default:
        throw new Error(`Provider desconhecido: ${provider}`);
    }

    onProgress?.({ stage: 'Redimensionando para resolução alvo...', pct: 85 });
    const final = await this._upscaleToTarget(imageData, width, height);
    onProgress?.({ stage: 'Concluído!', pct: 100 });
    return final;
  }

  // ── OpenAI gpt-image-1 ─────────────────────────────────────────────────────
  // dall-e-3 foi removido em 12/05/2026. Usar gpt-image-1 agora.
  // Parâmetros válidos: model, prompt, n, size, quality (low|medium|high),
  //                     output_format (png|webp|jpeg), background
  // NÃO aceita: response_format, style
  async _generateOpenAI({ prompt, width, height, onProgress }) {
    const key = getApiKey('openai');
    if (!key) throw new Error('Chave OpenAI não configurada. Vá em Settings → API Keys.');

    // gpt-image-1 aceita: 1024x1024 | 1536x1024 (landscape) | 1024x1536 (portrait)
    const size = width >= height ? '1536x1024' : '1024x1536';

    onProgress?.({ stage: `OpenAI gpt-image-1 gerando (${size})...`, pct: 20 });

    const body = {
      model:         'gpt-image-1',
      prompt,
      n:             1,
      size,
      quality:       'high',       // low | medium | high
      output_format: 'png',        // png | webp | jpeg
    };

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI erro ${res.status}: ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    // gpt-image-1 retorna b64_json diretamente (sem response_format)
    const b64 = data.data[0].b64_json;
    if (!b64) throw new Error('OpenAI não retornou imagem. Verifique saldo e permissões da conta.');
    return `data:image/png;base64,${b64}`;
  }

  // ── Stability AI (nova API v2beta) ─────────────────────────────────────────
  // Endpoint novo: https://api.stability.ai/v2beta/stable-image/generate/ultra
  // Retorna binário (image/png) quando Accept: image/*
  async _generateStability({ prompt, width, height, onProgress }) {
    const key = getApiKey('stability');
    if (!key) throw new Error('Chave Stability AI não configurada. Vá em Settings → API Keys.');

    onProgress?.({ stage: 'Stability AI Ultra gerando...', pct: 20 });

    const ar = width / height;
    // Stability Ultra aceita aspect_ratio em vez de dimensões
    const aspectRatio = this._closestStabilityAR(ar);

    const formData = new FormData();
    formData.append('prompt',       prompt);
    formData.append('aspect_ratio', aspectRatio);
    formData.append('output_format','png');
    formData.append('style_preset', 'cinematic');

    const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/ultra', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept':        'image/*',
      },
      body: formData,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Stability AI erro ${res.status}: ${txt}`);
    }

    const blob     = await res.blob();
    const dataURL  = await this._blobToDataURL(blob);
    return dataURL;
  }

  _closestStabilityAR(ar) {
    // Aspect ratios suportados pelo Stability Ultra
    const options = [
      { ratio: 21/9,  str: '21:9'  },
      { ratio: 16/9,  str: '16:9'  },
      { ratio: 3/2,   str: '3:2'   },
      { ratio: 4/3,   str: '4:3'   },
      { ratio: 1/1,   str: '1:1'   },
      { ratio: 3/4,   str: '3:4'   },
      { ratio: 2/3,   str: '2:3'   },
      { ratio: 9/16,  str: '9:16'  },
      { ratio: 9/21,  str: '9:21'  },
    ];
    let best = options[0];
    let minDiff = Infinity;
    for (const o of options) {
      const diff = Math.abs(ar - o.ratio);
      if (diff < minDiff) { minDiff = diff; best = o; }
    }
    return best.str;
  }

  // ── Leonardo AI ───────────────────────────────────────────────────────────
  async _generateLeonardo({ prompt, width, height, onProgress }) {
    const key = getApiKey('leonardo');
    if (!key) throw new Error('Chave Leonardo AI não configurada. Vá em Settings → API Keys.');

    onProgress?.({ stage: 'Leonardo AI: enviando job...', pct: 15 });

    // Limita a dimensões suportadas pelo modelo
    const genW = Math.min(Math.round(width  / 8) * 8, 1472);
    const genH = Math.min(Math.round(height / 8) * 8, 832);

    const createRes = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        prompt,
        modelId:             'aa77f04e-3eec-4034-9c07-d0a6f203aa56', // Leonardo Diffusion XL
        width:               genW,
        height:              genH,
        num_images:          1,
        guidance_scale:      7,
        num_inference_steps: 30,
        negative_prompt:     IWConfig.promptEnhancement.negativePrompt,
        public:              false,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(`Leonardo erro ${createRes.status}: ${err.error || JSON.stringify(err)}`);
    }

    const createData = await createRes.json();
    const genId = createData.sdGenerationJob?.generationId;
    if (!genId) throw new Error('Leonardo não retornou generationId');

    onProgress?.({ stage: 'Leonardo AI: processando...', pct: 30 });

    for (let i = 0; i < 60; i++) {
      await this._sleep(3000);
      const pollRes  = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${genId}`, {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      const pollData = await pollRes.json();
      const gen      = pollData.generations_by_pk;

      if (gen?.status === 'COMPLETE') {
        const imgUrl = gen.generated_images?.[0]?.url;
        if (!imgUrl) throw new Error('Leonardo não retornou URL de imagem');
        return await this._urlToDataURL(imgUrl);
      }
      if (gen?.status === 'FAILED') throw new Error('Leonardo: geração falhou');
      onProgress?.({ stage: `Leonardo AI: processando... (${(i+1)*3}s)`, pct: 30 + i });
    }
    throw new Error('Leonardo AI: timeout após 3 minutos');
  }

  // ── Replicate — FLUX 1.1 Pro (modelo atual 2025/2026) ────────────────────
  async _generateReplicate({ prompt, width, height, onProgress }) {
    const key = getApiKey('replicate');
    if (!key) throw new Error('Chave Replicate não configurada. Vá em Settings → API Keys.');

    onProgress?.({ stage: 'Replicate FLUX: iniciando...', pct: 15 });

    // FLUX 1.1 Pro — modelo mais atual e de alta qualidade
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
        'Prefer':        'wait=30',
      },
      body: JSON.stringify({
        input: {
          prompt,
          width:              Math.min(width,  1440),
          height:             Math.min(height, 1440),
          steps:              25,
          guidance:           3.5,
          output_format:      'png',
          output_quality:     95,
          safety_tolerance:   2,
          prompt_upsampling:  true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Replicate erro ${res.status}: ${err.detail || JSON.stringify(err)}`);
    }

    const prediction = await res.json();

    // Se já completou (Prefer: wait=30)
    if (prediction.status === 'succeeded') {
      const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      return await this._urlToDataURL(url);
    }

    // Poll
    const pollUrl = prediction.urls?.get;
    if (!pollUrl) throw new Error('Replicate não retornou URL de polling');

    for (let i = 0; i < 90; i++) {
      await this._sleep(2000);
      const pollRes  = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      const pollData = await pollRes.json();

      if (pollData.status === 'succeeded') {
        const url = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        return await this._urlToDataURL(url);
      }
      if (pollData.status === 'failed') {
        throw new Error(`Replicate falhou: ${pollData.error || 'erro desconhecido'}`);
      }
      onProgress?.({ stage: `Replicate FLUX processando... (${(i+1)*2}s)`, pct: 25 + i });
    }
    throw new Error('Replicate: timeout após 3 minutos');
  }

  // ── ComfyUI (Local) ───────────────────────────────────────────────────────
  async _generateComfyUI({ prompt, width, height, onProgress }) {
    const base = IWConfig.localEndpoints.comfyui;
    onProgress?.({ stage: 'ComfyUI: enviando workflow...', pct: 20 });

    const genW = Math.round(width  / 64) * 64;
    const genH = Math.round(height / 64) * 64;

    const workflow = {
      "3": { class_type:"KSampler", inputs:{ seed:Math.floor(Math.random()*1e9), steps:30, cfg:7, sampler_name:"euler", scheduler:"normal", denoise:1, model:["4",0], positive:["6",0], negative:["7",0], latent_image:["5",0] }},
      "4": { class_type:"CheckpointLoaderSimple", inputs:{ ckpt_name:"sd_xl_base_1.0.safetensors" }},
      "5": { class_type:"EmptyLatentImage", inputs:{ width:genW, height:genH, batch_size:1 }},
      "6": { class_type:"CLIPTextEncode",   inputs:{ text:prompt, clip:["4",1] }},
      "7": { class_type:"CLIPTextEncode",   inputs:{ text:IWConfig.promptEnhancement.negativePrompt, clip:["4",1] }},
      "8": { class_type:"VAEDecode",         inputs:{ samples:["3",0], vae:["4",2] }},
      "9": { class_type:"SaveImage",         inputs:{ filename_prefix:"infinitywall", images:["8",0] }},
    };

    const res = await fetch(`${base}/prompt`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json' },
      body:    JSON.stringify({ prompt: workflow }),
    });

    if (!res.ok) throw new Error(`ComfyUI erro ${res.status}. Está rodando em ${base}?`);
    const { prompt_id } = await res.json();

    for (let i = 0; i < 120; i++) {
      await this._sleep(2000);
      const histRes  = await fetch(`${base}/history/${prompt_id}`);
      const histData = await histRes.json();

      if (histData[prompt_id]?.status?.completed) {
        const outputs   = histData[prompt_id].outputs;
        const nodeKey   = Object.keys(outputs)[0];
        const imageInfo = outputs[nodeKey].images[0];
        const imgRes    = await fetch(`${base}/view?filename=${imageInfo.filename}&type=output`);
        const blob      = await imgRes.blob();
        return await this._blobToDataURL(blob);
      }
      onProgress?.({ stage: `ComfyUI renderizando... (${(i+1)*2}s)`, pct: 25 + i });
    }
    throw new Error('ComfyUI: timeout');
  }

  // ── Automatic1111 (Local) ─────────────────────────────────────────────────
  async _generateAuto1111({ prompt, width, height, onProgress }) {
    const base = IWConfig.localEndpoints.auto1111;
    onProgress?.({ stage: 'Automatic1111: gerando...', pct: 20 });

    const genW = Math.min(Math.round(width  / 64) * 64, 1536);
    const genH = Math.min(Math.round(height / 64) * 64, 1024);

    const res = await fetch(`${base}/sdapi/v1/txt2img`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json' },
      body:    JSON.stringify({
        prompt,
        negative_prompt: IWConfig.promptEnhancement.negativePrompt,
        width:           genW,
        height:          genH,
        steps:           30,
        cfg_scale:       7,
        sampler_name:    'Euler a',
      }),
    });

    if (!res.ok) throw new Error(`Automatic1111 erro ${res.status}. Está rodando em ${base}?`);
    const data = await res.json();
    return `data:image/png;base64,${data.images[0]}`;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async _blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
  }

  async _urlToDataURL(url) {
    try {
      // Tenta via fetch direto primeiro
      const res  = await fetch(url);
      const blob = await res.blob();
      return await this._blobToDataURL(blob);
    } catch(e) {
      // Fallback via canvas (pode falhar por CORS)
      const img = await this._loadImage(url);
      const c   = document.createElement('canvas');
      c.width   = img.naturalWidth;
      c.height  = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/png', 1.0);
    }
  }

  _loadImage(src) {
    return new Promise((res, rej) => {
      const img       = new Image();
      img.crossOrigin = 'anonymous';
      img.onload      = () => res(img);
      img.onerror     = () => rej(new Error(`Falha ao carregar imagem: ${src}`));
      img.src         = src;
    });
  }

  async _upscaleToTarget(imageDataUrl, targetW, targetH) {
    const img = await this._loadImage(imageDataUrl);
    const c   = document.createElement('canvas');
    c.width   = targetW;
    c.height  = targetH;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return c.toDataURL('image/png', 1.0);
  }
}

window.AIEngine = AIEngine;
