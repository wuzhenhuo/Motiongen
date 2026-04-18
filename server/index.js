import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import tripoRoutes from './routes/tripo.js';
import hymotionRoutes from './routes/hymotion.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/tripo', tripoRoutes);
app.use('/api/hymotion', hymotionRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
