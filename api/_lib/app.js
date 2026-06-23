// api/_lib/app.js
// Builds the Express app. Imported by api/index.js (the actual Vercel
// Serverless Function) AND by scripts/dev-api.mjs (plain-Node local dev),
// so the route logic is defined exactly once.
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import songRoutes from './routes/songs.js';
import scheduleRoutes from './routes/schedules.js';

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// No CORS setup here on purpose: the frontend and this API are served
// from the same Vercel project/domain, so the browser never sees this as
// a cross-origin request. If you ever split them across two domains,
// you'd need to add the `cors` package back in.

// Slows down brute-force guessing on auth endpoints. Note: this counter
// lives in the function's memory, which Vercel may reset between cold
// starts and doesn't share across concurrent instances — so treat this as
// a speed bump for casual abuse, not a hard guarantee. Fine for a small
// church app; revisit with a shared store (e.g. Upstash Redis) if this
// ever needs to be airtight.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/schedules', scheduleRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Generic error fallback so stack traces never leak to the client.
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

export default app;