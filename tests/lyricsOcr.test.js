import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanOcrText, isChordLine } from '../src/utils/lyricsOcr.js';

test('detects chord-only rows without deleting section tags or one-letter lyrics', () => {
  assert.equal(isChordLine('G   D   Em   C'), true);
  assert.equal(isChordLine('| Am7 | D/F# | Gsus4 |'), true);
  assert.equal(isChordLine('[Chorus]'), false);
  assert.equal(isChordLine('A'), false);
});

test('cleans chord rows and inline chords while preserving lyric structure', () => {
  const result = cleanOcrText(`Verse 1
G D Em C
[G]Amazing [D/F#]grace



A`);

  assert.equal(result.text, 'Verse 1\nAmazing grace\n\nA');
  assert.equal(result.removedChordLines, 1);
  assert.equal(result.removedInlineChords, 2);
});
