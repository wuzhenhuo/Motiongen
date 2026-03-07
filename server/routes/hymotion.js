/**
 * HY-Motion 1.0 proxy routes
 * Proxies requests to the Hugging Face Space to avoid CORS and keep tokens server-side.
 *
 * POST /api/hymotion/generate   — submit a generation job, returns { event_id }
 * GET  /api/hymotion/result/:id — stream SSE from HF Space back to the client
 */

import { Router } from 'express';
import fetch from 'node-fetch';
import { randomBytes } from 'crypto';

const router = Router();

const HF_SPACE = 'https://tencent-hy-motion-1-0.hf.space';
const FN_INDEX = 8; // generate_motion_func fn_index from /config

function makeSessionHash() {
  return randomBytes(8).toString('hex');
}

/** Resolve HF token: prefer env var, fall back to header from client */
function resolveToken(req) {
  return process.env.HF_TOKEN?.trim() || req.headers['x-hf-token'] || '';
}

/** POST /api/hymotion/generate — submits to HF /queue/join */
router.post('/generate', async (req, res) => {
  const { original_text, rewritten_text, seeds, duration, cfg_scale } = req.body;
  const token = resolveToken(req);

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const session_hash = makeSessionHash();

  try {
    const hfRes = await fetch(`${HF_SPACE}/queue/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fn_index: FN_INDEX,
        data: [
          String(original_text ?? ''),
          String(rewritten_text ?? original_text ?? ''),
          String(seeds ?? '0,1,2,3'),
          Number(duration ?? 5.0),
          Number(cfg_scale ?? 5.0),
        ],
        session_hash,
        event_data: null,
      }),
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      return res.status(hfRes.status).json({ error: `HF Space error: ${errText.slice(0, 300)}` });
    }

    const data = await hfRes.json();
    console.log('[hymotion] queue/join response:', JSON.stringify(data));
    res.json({ event_id: data.event_id, session_hash });
  } catch (err) {
    console.error('[hymotion] generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/hymotion/result/:eventId — SSE proxy from HF /queue/data */
router.get('/result/:eventId', async (req, res) => {
  const { session_hash } = req.query;
  const token = resolveToken(req);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const queueUrl = `${HF_SPACE}/queue/data?session_hash=${session_hash}`;
  console.log('[hymotion] connecting to queue/data:', queueUrl);

  try {
    const hfRes = await fetch(queueUrl, { headers });

    if (!hfRes.ok) {
      const errText = await hfRes.text().catch(() => '');
      console.error(`[hymotion] queue/data HTTP ${hfRes.status}:`, errText.slice(0, 300));
      res.write(`data: ${JSON.stringify({ error: `HF Space returned ${hfRes.status}` })}\n\n`);
      return res.end();
    }

    let rawBuf = '';
    hfRes.body.on('data', (chunk) => {
      rawBuf += chunk.toString();
      res.write(chunk);
    });

    hfRes.body.on('end', () => {
      console.log('[hymotion] queue/data complete, raw (first 2000 chars):\n', rawBuf.slice(0, 2000));
      res.end();
    });

    hfRes.body.on('error', (err) => {
      console.error('[hymotion] stream error:', err);
      res.end();
    });

    req.on('close', () => { hfRes.body.destroy(); });
  } catch (err) {
    console.error('[hymotion] result error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
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
        model: 'glm-4-flash',
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: `You are a motion description optimizer for HY-Motion-1.0, a text-to-3D-motion AI model. Rewrite user motion descriptions to be clearer and more precise, and predict an appropriate duration.

Rewriting rules:
- Start with "A person" or "The person"
- Be specific about body parts (arms, legs, torso, head, hips, etc.)
- Use temporal connectors (then, while, simultaneously)
- Use precise action verbs
- Keep under 60 words
- English only

Duration: predict seconds (0.5–12) based on motion complexity and natural timing.

IMPORTANT: Return ONLY a raw JSON object with no markdown, no code fences, no extra text.
Format: {"rewritten": "...", "duration": 5.0}`,
          },
          {
            role: 'user',
            content: `Rewrite this motion description and predict duration:\n"${text.trim()}"`,
          },
        ],
      }),
    });

    if (!zhipuRes.ok) {
      const errText = await zhipuRes.text();
      throw new Error(`Zhipu API error ${zhipuRes.status}: ${errText.slice(0, 200)}`);
    }

    const data = await zhipuRes.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(jsonStr);
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
