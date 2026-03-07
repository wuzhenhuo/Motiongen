/**
 * HY-Motion 1.0 proxy routes
 * Proxies requests to the Hugging Face Space to avoid CORS and keep tokens server-side.
 *
 * POST /api/hymotion/generate   — submit a generation job, returns { event_id }
 * GET  /api/hymotion/result/:id — stream SSE from HF Space back to the client
 */

import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

const HF_SPACE = 'https://tencent-hy-motion-1-0.hf.space';
const FN_NAME = 'generate_motion_func';

/** Resolve HF token: prefer env var, fall back to header from client */
function resolveToken(req) {
  return process.env.HF_TOKEN?.trim() || req.headers['x-hf-token'] || '';
}

/** POST /api/hymotion/generate */
router.post('/generate', async (req, res) => {
  const { original_text, rewritten_text, seeds, duration, cfg_scale } = req.body;
  const token = resolveToken(req);

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const hfRes = await fetch(`${HF_SPACE}/call/${FN_NAME}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: [
          String(original_text ?? ''),
          String(rewritten_text ?? original_text ?? ''),
          String(seeds ?? '0,1,2,3'),
          Number(duration ?? 5.0),
          Number(cfg_scale ?? 5.0),
        ],
      }),
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      return res.status(hfRes.status).json({ error: `HF Space error: ${errText.slice(0, 300)}` });
    }

    const data = await hfRes.json();
    res.json({ event_id: data.event_id });
  } catch (err) {
    console.error('[hymotion] generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/hymotion/result/:eventId — SSE proxy */
router.get('/result/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const token = resolveToken(req);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Set SSE headers so the client can consume them the same way
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const hfRes = await fetch(`${HF_SPACE}/call/${FN_NAME}/${eventId}`, { headers });

    if (!hfRes.ok) {
      res.write(`event: error\ndata: {"error": "HF Space returned ${hfRes.status}"}\n\n`);
      return res.end();
    }

    hfRes.body.on('data', (chunk) => {
      res.write(chunk);
    });

    hfRes.body.on('end', () => {
      res.end();
    });

    hfRes.body.on('error', (err) => {
      console.error('[hymotion] stream error:', err);
      res.write(`event: error\ndata: {"error": "${err.message}"}\n\n`);
      res.end();
    });

    // If client disconnects, destroy the upstream connection
    req.on('close', () => {
      hfRes.body.destroy();
    });
  } catch (err) {
    console.error('[hymotion] result error:', err);
    res.write(`event: error\ndata: {"error": "${err.message}"}\n\n`);
    res.end();
  }
});

/** POST /api/hymotion/rewrite — LLM prompt rewriting + duration prediction (Zhipu AI) */
router.post('/rewrite', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  const apiKey = process.env.ZHIPU_API_KEY?.trim();
  if (!apiKey) {
    return res.json({ rewritten: text.trim(), duration: null });
  }

  try {
    const zhipuRes = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'glm-4-5',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are a motion description optimizer for HY-Motion-1.0, a text-to-3D-motion AI model.

Rewrite the following motion description to be clearer and more precise for motion generation. Also predict an appropriate duration.

Rules:
- Start with "A person" or "The person"
- Be specific about body parts (arms, legs, torso, head, hips, etc.)
- Describe the movement sequence clearly with temporal connectors (then, while, simultaneously)
- Use precise action verbs
- Keep under 60 words
- English only

Predict duration in seconds (0.5–12) based on motion complexity and natural timing.

Input: "${text.trim()}"

Return ONLY valid JSON with no extra text: {"rewritten": "...", "duration": 5.0}`,
        }],
      }),
    });

    if (!zhipuRes.ok) {
      const errText = await zhipuRes.text();
      throw new Error(`Zhipu API error ${zhipuRes.status}: ${errText.slice(0, 200)}`);
    }

    const data = await zhipuRes.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const parsed = JSON.parse(raw);
    res.json({ rewritten: parsed.rewritten || text.trim(), duration: parsed.duration || null });
  } catch (err) {
    console.error('[hymotion] rewrite error:', err);
    res.json({ rewritten: text.trim(), duration: null });
  }
});

// Allow any *.hf.space subdomain or huggingface.co
const HF_URL_PATTERN = /^https:\/\/[a-zA-Z0-9._-]+\.hf\.space\//;

/** GET /api/hymotion/download?url=... — proxy file download from HF Space */
router.get('/download', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  const isAllowed = HF_URL_PATTERN.test(url) || url.startsWith('https://huggingface.co');
  if (!isAllowed) {
    console.warn('[hymotion] blocked download URL:', url);
    return res.status(403).json({ error: 'Only HF Space URLs are allowed' });
  }

  console.log('[hymotion] proxying download:', url);
  const token = resolveToken(req);
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const fileRes = await fetch(url, { headers });
    if (!fileRes.ok) {
      const errBody = await fileRes.text().catch(() => '');
      console.error(`[hymotion] upstream ${fileRes.status}:`, errBody.slice(0, 200));
      return res.status(fileRes.status).json({ error: `HF Space returned ${fileRes.status}` });
    }

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const safeFilename = filename || 'motion.fbx';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    const ct = fileRes.headers.get('content-length');
    if (ct) res.setHeader('Content-Length', ct);

    fileRes.body.pipe(res);
  } catch (err) {
    console.error('[hymotion] download error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
