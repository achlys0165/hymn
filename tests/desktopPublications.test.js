import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { publishDraft } from '../api/_lib/desktopPublications.js';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';

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
      lyrics_format TEXT, category TEXT, created_by INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, date TEXT, status TEXT, created_by INTEGER,
      description TEXT, service_time TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE schedule_songs (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, song_id INTEGER,
      position INTEGER CHECK(position < 3), notes TEXT, is_active INTEGER DEFAULT 1, UNIQUE(schedule_id, song_id));
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, display_name TEXT, role TEXT, is_active INTEGER);
    INSERT INTO users VALUES (4, 'test-editor', 'Test editor', 'editor', 1);
  `);
  const first = await publishDraft(database, 'song', 4, { contractVersion: 1, song });
  assert.deepEqual(await publishDraft(database, 'song', 4, { contractVersion: 1, song }), first);
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
  const saved = await publishDraft(database, 'schedule', 4, { contractVersion: 1, schedule: setlist });
  assert.deepEqual(await publishDraft(database, 'schedule', 4, setlist), saved);
  const { rows } = await database.execute('SELECT song_id, notes FROM schedule_songs ORDER BY position');
  assert.deepEqual(rows.map(row => [String(row.song_id), row.notes]), [[second.cloudId, 'Open'], [first.cloudId, null]]);
  await assert.rejects(publishDraft(database, 'song', 4, { contractVersion: 2, song }), /Unsupported publishing version/);
  await assert.rejects(publishDraft(database, 'song', 4, { contractVersion: 1 }), /draft ID is invalid/);

  process.env.TURSO_DATABASE_URL = config.url;
  process.env.TURSO_AUTH_TOKEN = 'disposable-test';
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  const { default: apiDatabase } = await import('../api/_lib/db.js');
  const { default: app } = await import('../api/_lib/app.js');
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); apiDatabase.close(); });
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const token = jwt.sign({ sub: 4, purpose: 'desktop-sync' }, process.env.JWT_SECRET);
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const post = (collection, body) => fetch(origin + '/api/sync/v1/' + collection + '/publish', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const payload = { contractVersion: 1, song: { ...song, localId: 'desktop-wire-song' } };
  const response = await post('songs', payload);
  assert.equal(response.status, 200);
  const wireSong = await response.json();
  const retry = await post('songs', payload);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), wireSong);
  const scheduleResponse = await post('schedules', {
    contractVersion: 1, schedule: { localId: 'desktop-wire-schedule', name: 'Wire test', date: '',
      items: [{ songId: wireSong.cloudId, position: 0, notes: 'Start here' }] },
  });
  assert.equal(scheduleResponse.status, 200);
  const cloudCopy = (await database.execute({
    sql: 'SELECT title, lyrics FROM songs WHERE id = ?', args: [wireSong.cloudId],
  })).rows[0];
  assert.equal(cloudCopy.title, song.title);
  assert.equal(cloudCopy.lyrics, song.lyrics);
  assert.equal((await post('songs', { ...payload, contractVersion: 2 })).status, 400);
  const snapshotResponse = await fetch(origin + '/api/sync/v1/snapshot', { headers });
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.equal(snapshot.songs.filter(row => row.id === wireSong.cloudId).length, 1);
  assert.equal(snapshot.scheduleItems.some(row => row.songId === wireSong.cloudId && row.notes === 'Start here'), true);
});
