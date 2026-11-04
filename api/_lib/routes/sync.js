import { createHash } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';
import { requireDesktopSync } from '../middleware/auth.js';

const router = Router();
const CONTRACT_VERSION = 1;
const SYNC_MODE = 'cloud-authoritative-snapshot';

router.use(requireDesktopSync);

const text = (value, fallback = '') => value == null ? fallback : String(value);
const nullableText = (value) => value == null ? null : String(value);
const id = (value) => String(value);

function buildContract(rows) {
  const [songRows, scheduleRows, itemRows] = rows;
  return {
    contractVersion: CONTRACT_VERSION,
    syncMode: SYNC_MODE,
    songs: songRows.rows.map((song) => ({
      id: id(song.id),
      title: text(song.title, 'Untitled'),
      artist: text(song.artist),
      lyrics: text(song.lyrics),
      lyricsFormat: text(song.lyrics_format, 'auto'),
      category: text(song.category, 'praise_worship'),
      createdBy: song.created_by == null ? null : id(song.created_by),
      createdAt: nullableText(song.created_at),
      updatedAt: nullableText(song.updated_at),
    })),
    schedules: scheduleRows.rows.map((schedule) => ({
      id: id(schedule.id),
      name: text(schedule.name, 'Unnamed'),
      date: nullableText(schedule.date),
      description: nullableText(schedule.description),
      status: text(schedule.status, 'draft'),
      serviceTime: nullableText(schedule.service_time),
      createdAt: nullableText(schedule.created_at),
      updatedAt: nullableText(schedule.updated_at),
    })),
    scheduleItems: itemRows.rows.map((item) => ({
      scheduleId: id(item.schedule_id),
      songId: id(item.song_id),
      position: Math.max(0, Math.trunc(Number(item.position) || 0)),
      notes: text(item.notes),
      title: text(item.title, 'Untitled'),
      artist: text(item.artist),
    })),
  };
}

async function snapshotHandler(req, res) {
  try {
    // A read transaction keeps every collection at the same database point.
    const rows = await db.batch([
      `SELECT id, title, artist, lyrics, lyrics_format, category,
              created_by, created_at, updated_at
       FROM songs
       ORDER BY id ASC`,
      `SELECT id, name, date, description, status, service_time,
              created_at, updated_at
       FROM schedules
       ORDER BY id ASC`,
      `SELECT ss.schedule_id, ss.song_id, ss.position, ss.notes,
              s.title, s.artist
       FROM schedule_songs ss
       JOIN songs s ON s.id = ss.song_id
       WHERE COALESCE(ss.is_active, 1) = 1
       ORDER BY ss.schedule_id, ss.position, ss.song_id`,
    ], 'read');

    const contractData = buildContract(rows);
    const snapshotId = createHash('sha256')
      .update(JSON.stringify(contractData))
      .digest('hex');
    const etag = `"${snapshotId}"`;

    res.set({
      'Cache-Control': 'private, no-cache',
      'ETag': etag,
      'X-Hymn-Sync-Version': String(CONTRACT_VERSION),
    });
    if (req.get('if-none-match') === etag) {
      return res.status(304).end();
    }

    res.json({
      ...contractData,
      snapshotId,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Desktop sync snapshot error:', err);
    res.status(500).json({ error: 'Could not prepare desktop sync data' });
  }
}

// /v1/snapshot is canonical. /snapshot remains a compatibility alias while
// installed desktops move to the explicitly versioned path.
router.get('/v1/snapshot', snapshotHandler);
router.get('/snapshot', snapshotHandler);

export default router;
