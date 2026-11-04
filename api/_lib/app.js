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
import syncRoutes from './routes/sync.js';
import userRoutes from './routes/users.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}
if (process.env.DESKTOP_SYNC_TOKEN && process.env.DESKTOP_SYNC_TOKEN.length < 32) {
  throw new Error('DESKTOP_SYNC_TOKEN must contain at least 32 characters');
}

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Cookie-authenticated writes must originate from this deployment. A normal
// cross-site form includes Origin and is rejected before it reaches a route.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.get('x-forwarded-host') || req.get('host');
    if (originHost !== requestHost) {
      return res.status(403).json({ error: 'Cross-site request blocked' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid request origin' });
  }
  next();
});

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
app.use('/api/auth/desktop-login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/users', userRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Generic error fallback so stack traces never leak to the client.
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

export default app;
