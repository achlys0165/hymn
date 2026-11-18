const validCloudId = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value);
const categories = new Set(['praise_worship', 'solemn', 'devotion']);

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export async function publishDraft(db, kind, userId, draft) {
  const localId = draft?.localId;
  if (typeof localId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(localId)) throw invalid('The desktop draft ID is invalid.');
  const name = kind === 'song' ? draft.title : draft.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 300) throw invalid('Enter a name or title up to 300 characters.');
  if (kind === 'song' && (typeof draft.lyrics !== 'string' || draft.lyrics.length > 1000000 ||
    typeof draft.artist !== 'string' || draft.artist.length > 300 || !['auto', 'structured'].includes(draft.lyricsFormat))) {
    throw invalid('The desktop song fields are invalid.');
  }
  const items = kind === 'schedule' ? draft.items : [];
  if (kind === 'schedule') {
    if (draft.date && (typeof draft.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date))) throw invalid('The setlist date is invalid.');
    if (!Array.isArray(items) || !items.length || items.length > 500 || items.some(item =>
      !validCloudId(item?.songId) || !Number.isSafeInteger(item.position) || item.position < 0 ||
      typeof item.notes !== 'string' || item.notes.length > 2000
    ) || new Set(items.map(item => item.songId)).size !== items.length ||
      new Set(items.map(item => item.position)).size !== items.length) {
      throw invalid('Choose 1 to 500 different published songs for this setlist.');
    }
  }

  await db.execute(`CREATE TABLE IF NOT EXISTS desktop_publications (
    kind TEXT NOT NULL, user_id INTEGER NOT NULL, local_id TEXT NOT NULL, cloud_id TEXT NOT NULL,
    published_at TEXT NOT NULL, PRIMARY KEY (kind, user_id, local_id)
  )`);
  const tx = await db.transaction('write');
  try {
    const table = kind === 'song' ? 'songs' : 'schedules';
    const existing = (await tx.execute({
      sql: `SELECT p.cloud_id, p.published_at FROM desktop_publications p
            JOIN ${table} item ON item.id = p.cloud_id
            WHERE p.kind = ? AND p.user_id = ? AND p.local_id = ?`,
      args: [kind, userId, localId],
    })).rows[0];
    if (existing) {
      await tx.commit();
      return { contractVersion: 1, localId, cloudId: existing.cloud_id, publishedAt: existing.published_at };
    }
    if (items.length) {
      const found = await tx.execute({
        sql: `SELECT id FROM songs WHERE id IN (${items.map(() => '?').join(',')})`,
        args: items.map(item => item.songId),
      });
      if (found.rows.length !== items.length) throw invalid('One or more songs are no longer in Hymn Cloud.');
    }
    const publishedAt = new Date().toISOString();
    const inserted = await tx.execute(kind === 'song' ? {
      sql: `INSERT INTO songs (title, artist, lyrics, lyrics_format, category, created_by)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING CAST(id AS TEXT) AS id`,
      args: [name.trim(), draft.artist.trim() || null, draft.lyrics, draft.lyricsFormat,
        categories.has(draft.category) ? draft.category : 'praise_worship', userId],
    } : {
      sql: `INSERT INTO schedules (name, date, status, created_by)
            VALUES (?, ?, 'draft', ?) RETURNING CAST(id AS TEXT) AS id`,
      args: [name.trim(), draft.date || '', userId],
    });
    const cloudId = inserted.rows[0].id;
    if (items.length) {
      const ordered = [...items].sort((left, right) => left.position - right.position);
      await tx.batch(ordered.map((item, index) => ({
        sql: 'INSERT INTO schedule_songs (schedule_id, song_id, position, notes) VALUES (?, ?, ?, ?)',
        args: [cloudId, item.songId, index + 1, item.notes || null],
      })));
    }
    await tx.execute({
      sql: `INSERT INTO desktop_publications (kind, user_id, local_id, cloud_id, published_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(kind, user_id, local_id) DO UPDATE SET cloud_id = excluded.cloud_id, published_at = excluded.published_at`,
      args: [kind, userId, localId, cloudId, publishedAt],
    });
    await tx.commit();
    return { contractVersion: 1, localId, cloudId, publishedAt };
  } finally {
    tx.close();
  }
}
