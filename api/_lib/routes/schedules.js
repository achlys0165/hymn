// api/_lib/routes/schedules.js
import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_STATUS = ['draft', 'ready', 'live', 'archived'];

// List view — uses an aggregate count rather than joining full lyrics,
// so the schedules list page stays light.
router.get('/', async (_req, res) => {
  try {
    const result = await db.execute(`
      SELECT s.id, s.name, s.date, s.description, s.status, s.service_time,
             COUNT(ss.id) AS song_count
      FROM schedules s
      LEFT JOIN schedule_songs ss ON s.id = ss.schedule_id AND ss.is_active = 1
      GROUP BY s.id
      ORDER BY s.date DESC
    `);
    res.json({ schedules: result.rows });
  } catch (err) {
    console.error('List schedules error:', err);
    res.status(500).json({ error: 'Could not load schedules' });
  }
});

// Detail view — schedule info + its ordered lineup of songs, joined so
// the frontend gets title/artist/key/tempo without a second round trip.
router.get('/:id', async (req, res) => {
  try {
    const sched = await db.execute({
      sql: 'SELECT * FROM schedules WHERE id = ?',
      args: [req.params.id],
    });
    if (!sched.rows[0]) return res.status(404).json({ error: 'Schedule not found' });

    const lineup = await db.execute({
      sql: `
        SELECT ss.song_id, ss.position, ss.notes,
               so.title, so.artist, so.key_signature, so.tempo
        FROM schedule_songs ss
        JOIN songs so ON so.id = ss.song_id
        WHERE ss.schedule_id = ? AND ss.is_active = 1
        ORDER BY ss.position ASC
      `,
      args: [req.params.id],
    });

    res.json({ schedule: sched.rows[0], songs: lineup.rows });
  } catch (err) {
    console.error('Get schedule error:', err);
    res.status(500).json({ error: 'Could not load schedule' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, date, description, service_time, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Schedule name is required' });
    }
    const safeStatus = ALLOWED_STATUS.includes(status) ? status : 'draft';

    const result = await db.execute({
      sql: `INSERT INTO schedules (name, date, description, status, service_time, created_by)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        name.trim(),
        date || null,
        description?.trim() || null,
        safeStatus,
        service_time?.trim() || null,
        req.user.sub,
      ],
    });

    const created = await db.execute({
      sql: 'SELECT * FROM schedules WHERE id = ?',
      args: [Number(result.lastInsertRowid)],
    });
    res.status(201).json({ schedule: created.rows[0] });
  } catch (err) {
    console.error('Create schedule error:', err);
    res.status(500).json({ error: 'Could not create schedule' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, date, description, service_time, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Schedule name is required' });
    }
    const safeStatus = ALLOWED_STATUS.includes(status) ? status : 'draft';

    await db.execute({
      sql: `UPDATE schedules SET name = ?, date = ?, description = ?, status = ?, service_time = ?
            WHERE id = ?`,
      args: [
        name.trim(),
        date || null,
        description?.trim() || null,
        safeStatus,
        service_time?.trim() || null,
        req.params.id,
      ],
    });

    const updated = await db.execute({
      sql: 'SELECT * FROM schedules WHERE id = ?',
      args: [req.params.id],
    });
    if (!updated.rows[0]) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ schedule: updated.rows[0] });
  } catch (err) {
    console.error('Update schedule error:', err);
    res.status(500).json({ error: 'Could not update schedule' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    // Same reasoning as the songs route: explicit + atomic, not relying
    // on ON DELETE CASCADE across separate logical connections.
    await db.batch(
      [
        { sql: 'DELETE FROM schedule_songs WHERE schedule_id = ?', args: [req.params.id] },
        { sql: 'DELETE FROM schedules WHERE id = ?', args: [req.params.id] },
      ],
      'write'
    );
    res.json({ message: 'Schedule deleted' });
  } catch (err) {
    console.error('Delete schedule error:', err);
    res.status(500).json({ error: 'Could not delete schedule' });
  }
});

// Add a song to a schedule's lineup, appended at the next position.
router.post('/:id/songs', async (req, res) => {
  try {
    const { song_id, notes } = req.body;
    if (!song_id) return res.status(400).json({ error: 'song_id is required' });

    const maxPos = await db.execute({
      sql: 'SELECT COALESCE(MAX(position), 0) AS maxPos FROM schedule_songs WHERE schedule_id = ?',
      args: [req.params.id],
    });
    const nextPosition = Number(maxPos.rows[0].maxPos) + 1;

    await db.execute({
      sql: `INSERT INTO schedule_songs (schedule_id, song_id, position, notes)
            VALUES (?, ?, ?, ?)`,
      args: [req.params.id, song_id, nextPosition, notes?.trim() || null],
    });

    res.status(201).json({ message: 'Song added to schedule' });
  } catch (err) {
    // UNIQUE(schedule_id, song_id) in the schema blocks duplicate adds
    if (String(err.message || err).includes('UNIQUE')) {
      return res.status(409).json({ error: 'This song is already in the schedule' });
    }
    console.error('Add song to schedule error:', err);
    res.status(500).json({ error: 'Could not add song to schedule' });
  }
});

router.delete('/:id/songs/:songId', async (req, res) => {
  try {
    await db.execute({
      sql: 'DELETE FROM schedule_songs WHERE schedule_id = ? AND song_id = ?',
      args: [req.params.id, req.params.songId],
    });
    res.json({ message: 'Song removed from schedule' });
  } catch (err) {
    console.error('Remove song from schedule error:', err);
    res.status(500).json({ error: 'Could not remove song' });
  }
});

export default router;