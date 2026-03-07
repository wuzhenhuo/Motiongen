import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';

const router = Router();

const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
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

    const fileBuffer = fs.readFileSync(req.file.path);
    const blob = new Blob([fileBuffer], { type: req.file.mimetype });
    const form = new FormData();
    form.append('file', blob, req.file.originalname || 'upload.jpg');

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
      // Tripo API may return 'model' (basic GLB) or 'pbr_model' (PBR GLB) or both
      result.model_url = task.output.model || task.output.pbr_model;
      result.pbr_model_url = task.output.pbr_model;
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
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ──────────────────────────────────────────────
// 5. Pipeline tasks: texture_model / convert_model / animate_rig / animate_retarget
// ──────────────────────────────────────────────
router.post('/pipeline', async (req, res) => {
  try {
    const { type, original_model_task_id, ...options } = req.body;

    const VALID_TYPES = ['texture_model', 'convert_model', 'animate_rig', 'animate_retarget', 'segment_model', 'refine_model'];
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (!original_model_task_id) {
      return res.status(400).json({ error: 'original_model_task_id is required' });
    }

    const body = { type, original_model_task_id, ...options };

    const response = await fetch(`${TRIPO_BASE}/task`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (data.code !== 0) {
      return res.status(400).json({ error: data.message || 'Pipeline task creation failed' });
    }

    res.json({ task_id: data.data.task_id });
  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: 'Failed to create pipeline task' });
  }
});

export default router;
