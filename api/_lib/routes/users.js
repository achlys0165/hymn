import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const ALLOWED_ROLES = ['member', 'editor', 'admin'];

router.use(requireAuth, requireRole('admin'));

router.get('/', async (_req, res) => {
  try {
    const result = await db.execute(`
      SELECT id, username, display_name, role, is_active, created_at
      FROM users
      ORDER BY username ASC
    `);
    res.json({ users: result.rows });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Could not load users' });
  }
});

router.patch('/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (String(req.user.sub) === String(req.params.id) && role !== 'admin') {
      return res.status(400).json({ error: 'Administrators cannot remove their own admin role' });
    }

    await db.execute({
      sql: 'UPDATE users SET role = ? WHERE id = ?',
      args: [role, req.params.id],
    });
    const updated = await db.execute({
      sql: 'SELECT id, username, display_name, role, is_active FROM users WHERE id = ?',
      args: [req.params.id],
    });
    if (!updated.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: updated.rows[0] });
  } catch (err) {
    console.error('Update user role error:', err);
    res.status(500).json({ error: 'Could not update user role' });
  }
});

export default router;
