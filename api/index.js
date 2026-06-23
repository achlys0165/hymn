// api/index.js
// This is the one Vercel Serverless Function for the whole API.
// vercel.json rewrites every /api/* request here, and Express's own
// internal routing (defined in _lib/app.js) handles the rest based on
// the real incoming path (e.g. /api/auth/login) — nothing else to wire up.
import app from './_lib/app.js';
export default app;