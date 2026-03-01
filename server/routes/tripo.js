import { Router } from 'express';
import fetch from 'node-fetch';
import multer from 'multer';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const router = Router();

const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.TRIPO_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ──────────────────────────────────────────────
// 1. Upload image to Tripo and get a token
// ──────────────────────────────────────────────
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const response = await fetch(`${TRIPO_BASE}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TRIPO_API_KEY}` },
      body: form,
    });
    const data = await response.json();

    // Clean up temp file
    fs.unlink(req.file.path, () => {});

    if (data.code !== 0) {
      return res.status(400).json({ error: data.message || 'Upload failed' });
    }

    res.json({ image_token: data.data.image_token });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

// ──────────────────────────────────────────────
// 2. Create generation task (text or image)
// ──────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  try {
    const { mode, prompt, negative_prompt, image_token, model_version } = req.body;

    let body;
    if (mode === 'image') {
      if (!image_token) return res.status(400).json({ error: 'image_token is required for image mode' });
      body = {
        type: 'image_to_model',
        file: { type: 'jpg', file_token: image_token },
      };
    } else {
      if (!prompt) return res.status(400).json({ error: 'prompt is required for text mode' });
      body = {
        type: 'text_to_model',
        prompt,
        ...(negative_prompt && { negative_prompt }),
        ...(model_version && { model_version }),
      };
    }

    const response = await fetch(`${TRIPO_BASE}/task`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (data.code !== 0) {
      return res.status(400).json({ error: data.message || 'Task creation failed' });
    }

    res.json({ task_id: data.data.task_id });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Failed to create generation task' });
  }
});

// ──────────────────────────────────────────────
// 3. Poll task status
// ──────────────────────────────────────────────
router.get('/task/:taskId', async (req, res) => {
  try {
    const response = await fetch(`${TRIPO_BASE}/task/${req.params.taskId}`, {
      headers: getHeaders(),
    });
    const data = await response.json();

    if (data.code !== 0) {
      return res.status(400).json({ error: data.message || 'Failed to get task status' });
    }

    const task = data.data;
    const result = {
      task_id: task.task_id,
      status: task.status,       // queued | running | success | failed | cancelled
      progress: task.progress || 0,
    };

    if (task.status === 'success' && task.output) {
      result.model_url = task.output.model;          // GLB download URL
      result.pbr_model_url = task.output.pbr_model;  // PBR version
      result.rendered_image = task.output.rendered_image;
    }

    res.json(result);
  } catch (err) {
    console.error('Task status error:', err);
    res.status(500).json({ error: 'Failed to check task status' });
  }
});

// ──────────────────────────────────────────────
// 4. Proxy model download (avoids CORS issues)
// ──────────────────────────────────────────────
router.get('/download', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url parameter is required' });

    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).json({ error: 'Download failed' });

    const filename = `model_${Date.now()}.glb`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'model/gltf-binary');
    response.body.pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

export default router;
