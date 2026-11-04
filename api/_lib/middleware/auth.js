// api/_lib/middleware/auth.js
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import db from '../db.js';

// Reads the httpOnly "token" cookie set at login. The browser/JS never
// gets to read this cookie's value directly — that's what stops it being
// stolen via an XSS payload, unlike a token kept in localStorage.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }

  try {
    const result = await db.execute({
      sql: `SELECT id, username, display_name, role, is_active
            FROM users WHERE id = ?`,
      args: [payload.sub],
    });
    const user = result.rows[0];
    if (!user || Number(user.is_active) !== 1) {
      return res.status(401).json({ error: 'Account is no longer active' });
    }
    req.user = {
      sub: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Optional: restrict a route to specific roles, e.g. requireRole('admin')
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' });
    }
    next();
  };
}

// Desktop sync is intentionally read-only and uses a separate, revocable
// credential. This token is configured at deployment/runtime and is never a
// Turso credential, so the desktop application cannot issue arbitrary SQL.
export async function requireDesktopSync(req, res, next) {
  const configuredToken = process.env.DESKTOP_SYNC_TOKEN;
  const header = req.get('authorization') || '';
  const providedToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!providedToken) {
    return res.status(401).json({ error: 'Invalid desktop sync credential' });
  }

  // Temporary compatibility for installations already provisioned with the
  // old shared token. New installations use an account-scoped desktop JWT.
  if (configuredToken) {
    const expected = Buffer.from(configuredToken);
    const provided = Buffer.from(providedToken);
    if (
      expected.length === provided.length &&
      crypto.timingSafeEqual(expected, provided)
    ) {
      req.desktopAuth = { kind: 'legacy-token' };
      return next();
    }
  }

  let payload;
  try {
    payload = jwt.verify(providedToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Desktop session expired. Sign in again.' });
  }
  if (payload.purpose !== 'desktop-sync') {
    return res.status(401).json({ error: 'Invalid desktop sync credential' });
  }

  try {
    const result = await db.execute({
      sql: `SELECT id, username, display_name, role, is_active
            FROM users WHERE id = ?`,
      args: [payload.sub],
    });
    const user = result.rows[0];
    if (!user || Number(user.is_active) !== 1) {
      return res.status(401).json({ error: 'Account is no longer active' });
    }
    req.user = {
      sub: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    };
    req.desktopAuth = { kind: 'account' };
    next();
  } catch (err) {
    next(err);
  }
}
