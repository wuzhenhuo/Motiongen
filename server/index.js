import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import tripoRoutes from './routes/tripo.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/tripo', tripoRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasApiKey: !!process.env.TRIPO_API_KEY });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!process.env.TRIPO_API_KEY) {
    console.warn('WARNING: TRIPO_API_KEY not set. Copy .env.example to .env and add your key.');
  }
});
