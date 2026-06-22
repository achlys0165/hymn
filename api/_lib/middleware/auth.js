// api/_lib/middleware/auth.js
const jwt = require('jsonwebtoken');

// Reads the httpOnly "token" cookie set at login. The browser/JS never
// gets to read this cookie's value directly — that's what stops it being
// stolen via an XSS payload, unlike a token kept in localStorage.
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { sub, username, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// Optional: restrict a route to specific roles, e.g. requireRole('admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
