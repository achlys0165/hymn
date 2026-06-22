// api/_lib/db.js
// The ONLY file that touches Turso credentials. Runs exclusively inside
// the Vercel Serverless Function — it's never part of the Vite frontend
// bundle, so these env vars never reach the browser.
const { createClient } = require('@libsql/client');

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  // Throwing (not process.exit) is intentional: this file loads inside a
  // serverless function, not a long-running process. Vercel will log this
  // clearly in the Function logs if the env vars are missing.
  throw new Error(
    'Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. Set them in Vercel → Project → Settings → Environment Variables, and in a local .env for `vercel dev`.'
  );
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

module.exports = db;
