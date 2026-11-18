import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { publishDraft } from '../api/_lib/desktopPublications.js';

const song = {
  localId: 'draft-1', title: 'Example', artist: '', lyrics: '[Chorus]\nLyric line',
  lyricsFormat: 'auto', category: 'praise_worship',
};

test('desktop publishing is repeatable and preserves the setlist when an item fails', async t => {
  const config = { url: 'file::memory:?cache=shared' };
  const lifetime = createClient(config);
  const database = createClient(config);
  t.after(() => { database.close(); lifetime.close(); });
  await lifetime.executeMultiple(`
    CREATE TABLE songs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, artist TEXT, lyrics TEXT,
      lyrics_format TEXT, category TEXT, created_by INTEGER);
    CREATE TABLE schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, date TEXT, status TEXT, created_by INTEGER);
    CREATE TABLE schedule_songs (schedule_id INTEGER, song_id INTEGER, position INTEGER CHECK(position < 3),
      notes TEXT, UNIQUE(schedule_id, song_id));
  `);
  const first = await publishDraft(database, 'song', 4, song);
  assert.deepEqual(await publishDraft(database, 'song', 4, song), first);
  assert.equal((await database.execute('SELECT COUNT(*) AS count FROM songs')).rows[0].count, 1);
  const second = await publishDraft(database, 'song', 5, song);
  assert.notEqual(second.cloudId, first.cloudId);
  const third = await publishDraft(database, 'song', 4, { ...song, localId: 'draft-2' });
  const item = (songId, position, notes = '') => ({ songId, position, notes });
  const setlist = { localId: 'setlist-1', name: 'Sunday', date: null,
    items: [item(first.cloudId, 2), item(second.cloudId, 0, 'Open'), item(third.cloudId, 1)] };
  await assert.rejects(publishDraft(database, 'schedule', 4, setlist), /CHECK constraint/i);
  assert.equal((await database.execute('SELECT COUNT(*) AS count FROM schedules')).rows[0].count, 0);
  assert.equal((await database.execute('SELECT COUNT(*) AS count FROM schedule_songs')).rows[0].count, 0);
  await assert.rejects(publishDraft(database, 'schedule', 4, { ...setlist, items: [item('999', 0)] }), /no longer in Hymn Cloud/);
  setlist.items.pop();
  const saved = await publishDraft(database, 'schedule', 4, setlist);
  assert.deepEqual(await publishDraft(database, 'schedule', 4, setlist), saved);
  const { rows } = await database.execute('SELECT song_id, notes FROM schedule_songs ORDER BY position');
  assert.deepEqual(rows.map(row => [String(row.song_id), row.notes]), [[second.cloudId, 'Open'], [first.cloudId, null]]);
});
