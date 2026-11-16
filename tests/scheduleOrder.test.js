import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasSameSongIds,
  moveScheduleSong,
  normalizeSongIds,
} from '../shared/scheduleOrder.js';

test('normalizes valid song IDs and rejects invalid or duplicate IDs', () => {
  assert.deepEqual(normalizeSongIds(['2', 5]), [2, 5]);
  assert.throws(() => normalizeSongIds('2'), /array/);
  assert.throws(() => normalizeSongIds([2, 2]), /only appear once/);
  assert.throws(() => normalizeSongIds([0]), /positive integer/);
});

test('compares schedule membership without requiring the same order', () => {
  assert.equal(hasSameSongIds([1, 2, 3], [3, 1, 2]), true);
  assert.equal(hasSameSongIds([1, 2], [1, 3]), false);
});

test('moves schedule songs immutably and ignores out-of-range moves', () => {
  const songs = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const reordered = moveScheduleSong(songs, 0, 1);
  assert.deepEqual(reordered, [songs[1], songs[0], songs[2]]);
  assert.notEqual(reordered, songs);
  assert.equal(moveScheduleSong(songs, 0, -1), songs);
});
