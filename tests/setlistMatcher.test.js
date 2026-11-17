import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSetlist, normalizeSetlistTitle, parseSetlist } from '../shared/setlistMatcher.js';

const songs = [
  { id: 1, title: '10,000 Reasons', artist: 'Matt Redman' },
  { id: 2, title: 'Goodness of God', artist: 'Bethel Music' },
  { id: 3, title: 'Amazing Grace', artist: 'John Newton' },
  { id: 4, title: 'Amazing Grace (My Chains Are Gone)', artist: 'Chris Tomlin' },
];

test('cleans common setlist formatting without changing order', () => {
  assert.deepEqual(parseSetlist('1. 10,000 Reasons (Key of G)\n- Goodness of God - Bethel Music x2'), [
    { id: 0, raw: '1. 10,000 Reasons (Key of G)', title: '10,000 Reasons', artist: '' },
    { id: 1, raw: '- Goodness of God - Bethel Music x2', title: 'Goodness of God', artist: 'Bethel Music' },
  ]);
  assert.equal(normalizeSetlistTitle('10,000  Reasons!'), '10 000 reasons');
});

test('matches certain songs, flags duplicates, and reports missing entries', () => {
  const results = matchSetlist('10,000 reasons\nGoodness of God - Bethel Music\n10,000 Reasons\nSong That Does Not Exist', songs);
  assert.deepEqual(results.map(result => result.status), ['matched', 'matched', 'duplicate', 'missing']);
  assert.deepEqual(results.filter(result => result.status === 'matched').map(result => result.song.id), [1, 2]);
});

test('requires confirmation when similar titles are ambiguous', () => {
  const [result] = matchSetlist('Amazing Grace My Chains', songs);
  assert.equal(result.status, 'suggested');
  assert.ok(result.suggestions.length > 0);
});
