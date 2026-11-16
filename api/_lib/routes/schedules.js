// api/_lib/routes/schedules.js
import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { hasSameSongIds, normalizeSongIds } from '../../../shared/scheduleOrder.js';

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
      LEFT JOIN schedule_songs ss ON s.id = ss.schedule_id
      GROUP BY s.id
      ORDER BY s.date DESC
    `);
    res.json({ schedules: result.rows });
  } catch (err) {
    console.error('List schedules error:', err);
    res.status(500).json({ error: 'Could not load schedules' });
  }
});

// Detail view — schedule info + its ordered lineup of songs with lyrics
// so the frontend can expand them inline without a second round trip.
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
               so.title, so.artist, so.category, so.lyrics
        FROM schedule_songs ss
        JOIN songs so ON so.id = ss.song_id
        WHERE ss.schedule_id = ?
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

router.post('/', requireRole('editor', 'admin'), async (req, res) => {
  try {
    const { name, date, description, service_time, status, song_ids } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Schedule name is required' });
    }
    const songIds = normalizeSongIds(song_ids);
    const safeStatus = ALLOWED_STATUS.includes(status) ? status : 'draft';

    if (songIds.length) {
      const existing = await db.execute({
        sql: `SELECT id FROM songs WHERE id IN (${songIds.map(() => '?').join(', ')})`,
        args: songIds,
      });
      if (existing.rows.length !== songIds.length) {
        return res.status(400).json({ error: 'One or more selected songs no longer exist' });
      }
    }

    const statements = [{
      sql: `INSERT INTO schedules (name, date, description, status, service_time, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        name.trim(),
        date || '',
        description?.trim() || null,
        safeStatus,
        service_time?.trim() || null,
        req.user.sub,
      ],
    }];
    if (songIds.length) {
      statements.push({
        sql: `WITH new_schedule(id) AS MATERIALIZED (SELECT last_insert_rowid()),
                   ordered_songs(song_id, position) AS (VALUES ${songIds.map(() => '(?, ?)').join(', ')})
              INSERT INTO schedule_songs (schedule_id, song_id, position, notes)
              SELECT new_schedule.id, ordered_songs.song_id, ordered_songs.position, NULL
              FROM new_schedule CROSS JOIN ordered_songs`,
        args: songIds.flatMap((songId, index) => [songId, index + 1]),
      });
    }

    const [created] = await db.batch(statements, 'write');
    res.status(201).json({ schedule: created.rows[0] });
  } catch (err) {
    console.error('Create schedule error:', err);
    const status = err instanceof TypeError ? 400 : (err.status || 500);
    res.status(status).json({ error: status === 500 ? 'Could not create schedule' : err.message });
  }
});

router.put('/:id', requireRole('editor', 'admin'), async (req, res) => {
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
        date || '',
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

router.delete('/:id', requireRole('editor', 'admin'), async (req, res) => {
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
router.post('/:id/songs', requireRole('editor', 'admin'), async (req, res) => {
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

router.put('/:id/songs/order', requireRole('editor', 'admin'), async (req, res) => {
  if (!Array.isArray(req.body.song_ids)) {
    return res.status(400).json({ error: 'song_ids must be an array' });
  }

  try {
    const songIds = normalizeSongIds(req.body.song_ids);

    const schedule = await db.execute({
      sql: 'SELECT id FROM schedules WHERE id = ?',
      args: [req.params.id],
    });
    if (!schedule.rows[0]) {
      const error = new Error('Schedule not found');
      error.status = 404;
      throw error;
    }

    const current = await db.execute({
      sql: 'SELECT song_id FROM schedule_songs WHERE schedule_id = ? ORDER BY position ASC',
      args: [req.params.id],
    });
    const currentIds = current.rows.map((row) => Number(row.song_id));
    if (!hasSameSongIds(currentIds, songIds)) {
      const error = new Error('Schedule changed. Refresh and try again.');
      error.status = 409;
      throw error;
    }

    if (!songIds.length) return res.json({ message: 'Schedule order saved' });

    const placeholders = songIds.map(() => '?').join(', ');
    const orderCases = songIds.map(() => 'WHEN ? THEN ?').join(' ');
    const results = await db.batch([
      {
        sql: `UPDATE schedule_songs
              SET position = position + 1000000
              WHERE schedule_id = ?
                AND (SELECT COUNT(*) FROM schedule_songs WHERE schedule_id = ?) = ?
                AND (SELECT COUNT(*) FROM schedule_songs WHERE schedule_id = ? AND song_id IN (${placeholders})) = ?`,
        args: [req.params.id, req.params.id, songIds.length, req.params.id, ...songIds, songIds.length],
      },
      {
        sql: `UPDATE schedule_songs
              SET position = CASE song_id ${orderCases} ELSE position END
              WHERE schedule_id = ? AND position >= 1000000`,
        args: [...songIds.flatMap((songId, index) => [songId, index + 1]), req.params.id],
      },
    ], 'write');
    if (results.some((result) => Number(result.rowsAffected) !== songIds.length)) {
      return res.status(409).json({ error: 'Schedule changed. Refresh and try again.' });
    }

    res.json({ message: 'Schedule order saved' });
  } catch (err) {
    console.error('Reorder schedule error:', err);
    const status = err instanceof TypeError ? 400 : (err.status || 500);
    res.status(status).json({ error: status === 500 ? 'Could not reorder schedule' : err.message });
  }
});

router.delete('/:id/songs/:songId', requireRole('editor', 'admin'), async (req, res) => {
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
