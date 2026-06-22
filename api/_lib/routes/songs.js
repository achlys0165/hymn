// api/_lib/routes/songs.js
const { Router } = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use(requireAuth); // every route below requires a logged-in user

const ALLOWED_CATEGORIES = ['worship', 'praise', 'hymn', 'contemporary', 'gospel', 'general'];

router.get('/', async (_req, res) => {
  try {
    const result = await db.execute('SELECT * FROM songs ORDER BY title ASC');
    res.json({ songs: result.rows });
  } catch (err) {
    console.error('List songs error:', err);
    res.status(500).json({ error: 'Could not load songs' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM songs WHERE id = ?',
      args: [req.params.id],
    });
    if (!result.rows[0]) return res.status(404).json({ error: 'Song not found' });
    res.json({ song: result.rows[0] });
  } catch (err) {
    console.error('Get song error:', err);
    res.status(500).json({ error: 'Could not load song' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, artist, lyrics, category, key_signature, tempo, time_signature, tags } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const safeCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'general';

    // db.execute with a positional args array is parameterized by the
    // Turso/libSQL client itself — values are never string-concatenated
    // into the SQL, which is what prevents SQL injection here.
    const result = await db.execute({
      sql: `INSERT INTO songs (title, artist, lyrics, category, key_signature, tempo, time_signature, tags, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        title.trim(),
        artist?.trim() || null,
        lyrics?.trim() || '',
        safeCategory,
        key_signature?.trim() || null,
        tempo?.trim() || null,
        time_signature?.trim() || null,
        tags?.trim() || null,
        req.user.sub,
      ],
    });

    const created = await db.execute({
      sql: 'SELECT * FROM songs WHERE id = ?',
      args: [Number(result.lastInsertRowid)],
    });
    res.status(201).json({ song: created.rows[0] });
  } catch (err) {
    console.error('Create song error:', err);
    res.status(500).json({ error: 'Could not save song' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, artist, lyrics, category, key_signature, tempo, time_signature, tags } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const safeCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'general';

    // Note: the trg_song_version_history trigger in your schema
    // automatically snapshots the OLD lyrics into song_versions whenever
    // this UPDATE changes the lyrics column — no extra code needed here.
    await db.execute({
      sql: `UPDATE songs
            SET title = ?, artist = ?, lyrics = ?, category = ?, key_signature = ?, tempo = ?, time_signature = ?, tags = ?
            WHERE id = ?`,
      args: [
        title.trim(),
        artist?.trim() || null,
        lyrics?.trim() || '',
        safeCategory,
        key_signature?.trim() || null,
        tempo?.trim() || null,
        time_signature?.trim() || null,
        tags?.trim() || null,
        req.params.id,
      ],
    });

    const updated = await db.execute({
      sql: 'SELECT * FROM songs WHERE id = ?',
      args: [req.params.id],
    });
    if (!updated.rows[0]) return res.status(404).json({ error: 'Song not found' });
    res.json({ song: updated.rows[0] });
  } catch (err) {
    console.error('Update song error:', err);
    res.status(500).json({ error: 'Could not update song' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    // NOT relying on the schema's ON DELETE CASCADE here: SQLite/libSQL
    // only enforces foreign keys when PRAGMA foreign_keys=ON is set on
    // the *same* connection as the DELETE, but @libsql/client's
    // db.execute() opens a fresh logical connection per call against a
    // remote Turso URL — so a cascade can't be assumed to fire. Deleting
    // the dependent rows explicitly, atomically via batch(), is the
    // version that's actually guaranteed to work.
    await db.batch(
      [
        { sql: 'DELETE FROM schedule_songs WHERE song_id = ?', args: [req.params.id] },
        { sql: 'DELETE FROM songs WHERE id = ?', args: [req.params.id] },
      ],
      'write'
    );
    res.json({ message: 'Song deleted' });
  } catch (err) {
    console.error('Delete song error:', err);
    res.status(500).json({ error: 'Could not delete song' });
  }
});

module.exports = router;
