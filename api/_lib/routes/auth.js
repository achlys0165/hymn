// api/_lib/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const COOKIE_NAME = 'token';

// Vercel deployments (production AND preview) are always served over
// HTTPS, so we can key the cookie's `secure` flag off process.env.VERCEL
// rather than NODE_ENV (which behaves inconsistently across hosts).
// Locally, with `vercel dev`, this is unset, so secure stays off — fine
// for plain http://localhost.
const isOnVercel = !!process.env.VERCEL;
const registrationEnabled = process.env.ALLOW_PUBLIC_REGISTRATION === 'true';

// A hash that never matches anything real. Comparing against it when a
// username isn't found keeps "wrong username" and "wrong password"
// responses close enough in timing that neither leaks which one was true.
const DUMMY_HASH = '$2a$12$FRf4gMzRs03PXOs4PTqXIe/MWtvE4w9aCnBaPKIAkG3k81vaH51pu';

function setAuthCookie(res, payload, remember) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: remember ? '30d' : '12h',
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // JS on the page can never read this
    secure: isOnVercel,
    sameSite: 'lax',
    maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000,
  });
}

async function authenticate(username, password) {
  if (!username || !password) return null;
  const result = await db.execute({
    sql: 'SELECT id, username, password_hash, display_name, role, is_active FROM users WHERE username = ?',
    args: [username.trim()],
  });
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  return user && valid && Number(user.is_active) === 1 ? user : null;
}

router.get('/config', (_req, res) => {
  res.json({ registrationEnabled });
});

router.post('/register', async (req, res) => {
  if (!registrationEnabled) {
    return res.status(403).json({ error: 'Public registration is disabled' });
  }
  try {
    const { username, password, displayName } = req.body;

    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || password.length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' });
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username.trim()],
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'That username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.execute({
      sql: `INSERT INTO users (username, password_hash, display_name, role, is_active)
            VALUES (?, ?, ?, 'member', 1)`,
      args: [username.trim(), passwordHash, displayName?.trim() || username.trim()],
    });

    res.status(201).json({ message: 'Account created' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Could not create account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password, remember } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await authenticate(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    setAuthCookie(res, { sub: user.id }, !!remember);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/desktop-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = await authenticate(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const expiresInSeconds = 30 * 24 * 60 * 60;
    const token = jwt.sign(
      { sub: user.id, purpose: 'desktop-sync' },
      process.env.JWT_SECRET,
      { expiresIn: expiresInSeconds }
    );
    res.json({
      token,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Desktop login error:', err);
    res.status(500).json({ error: 'Desktop sign-in failed' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ message: 'Logged out' });
});

// Lets the frontend ask "am I actually still logged in?" without ever
// touching the cookie's contents directly.
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.sub,
      username: req.user.username,
      displayName: req.user.displayName,
      role: req.user.role,
    },
  });
});

export default router;
