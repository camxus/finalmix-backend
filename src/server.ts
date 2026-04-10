import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index';
import { errorMiddleware } from './middleware/asyncHandler';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

export const app = express();

app.use(helmet());
app.use(cors({
  origin: [FRONTEND_URL, /\.mixvault\.io$/],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Share-Token'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check — no auth, no logging
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// All API routes
app.use('/api/v1', routes);

// 404 for unmatched routes
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' }));

// Global error handler — must be last
app.use(errorMiddleware);

// Only start listening when run directly (not in tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[server] MixVault API running on :${PORT}`);
    console.log(`[server] Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });
}
