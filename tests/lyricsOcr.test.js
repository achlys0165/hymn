import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanOcrText, isChordLine } from '../src/utils/lyricsOcr.js';

test('detects chord-only rows including OCR merges and separators', () => {
  assert.equal(isChordLine('G   D   Em   C'), true);
  assert.equal(isChordLine('| Am7 | D/F# | Gsus4 |'), true);
  assert.equal(isChordLine('Em - F#m-G-A'), true);
  assert.equal(isChordLine('DA'), true);
  assert.equal(isChordLine('Doc G'), true);
  assert.equal(isChordLine('D'), true);
  assert.equal(isChordLine('[Chorus]'), false);
  assert.equal(isChordLine('Something good is in store'), false);
});

test('cleans chord rows and inline chords while preserving lyric structure', () => {
  const result = cleanOcrText(`Verse 1
G D Em C
[G]Amazing [D/F#]grace



A`);

  assert.equal(result.text, 'Verse 1\nAmazing grace');
  assert.equal(result.removedChordLines, 2);
  assert.equal(result.removedInlineChords, 2);
});

test('removes every chord row from the supplied lyric-sheet OCR output', () => {
  const result = cleanOcrText(`Were Together Again
Chorus 1;
A D G
We're together again just praising the Lord
Em A DA
We're together again in one accord
D
Something good is going to happen
Doc G
Something good is in store
Em - F#m-G-A
We're together again
DA
Just praising the Lord]`);

  assert.equal(result.removedChordLines, 6);
  assert.equal(result.text.includes('F#m'), false);
  assert.equal(result.text, `Were Together Again
Chorus 1;
We're together again just praising the Lord
We're together again in one accord
Something good is going to happen
Something good is in store
We're together again
Just praising the Lord]`);
});
