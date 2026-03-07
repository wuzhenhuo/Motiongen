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

export default router;
