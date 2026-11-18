import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinLyrics, lineupChanges, lyricsForEditor, nextSunday, parseDate, searchLibrary, serviceTimeFromInput, serviceTimeInput, setlistBuckets, splitLyrics } from '../src/utils/workspace.js';

test('section editing round-trips headerless, empty, duplicate, and CRLF lyrics', () => {
  for (const text of [
    '', 'Come and see\nThese lines\n', '\n\n[Verse 1]\n \n\n[Chorus]\nOne\n\n[Chorus]',
    '[Verse 1]\r\nVerse\r\n\r\n[Chorus]\r\n\r\n[Chorus]\r\nAnswer\r\n', '[Verse 2]',
  ]) assert.equal(joinLyrics(splitLyrics(text)), text);
  assert.equal(lyricsForEditor({lyrics_format:'structured', lyrics:JSON.stringify([{label:'Verse 1',lines:['Song']}])}), '[Verse 1]\nSong');
});

test('dates respect the local service day and keep undated setlists visible separately', () => {
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(nextSunday(new Date(2026, 10, 18)), '2026-11-22');
  assert.deepEqual(setlistBuckets([{date:'2026-11-18'}, {date:'2026-11-17'}, {date:''}], '2026-11-18'), {
    upcoming:[{date:'2026-11-18'}], past:[{date:'2026-11-17'}], undated:[{date:''}],
  });
});

test('native service time controls preserve saved time formatting when unchanged', () => {
  assert.equal(serviceTimeInput('9:00 AM'), '09:00');
  assert.equal(serviceTimeInput('12:15 PM'), '12:15');
  assert.equal(serviceTimeFromInput('09:00', '9:00 AM'), '9:00 AM');
  assert.equal(serviceTimeFromInput('14:00', '9:00 AM'), '2:00 PM');
  assert.equal(serviceTimeFromInput('09:00', '08:00'), '09:00');
  assert.equal(serviceTimeFromInput('', 'After worship'), 'After worship');
});

test('search returns real lyric snippets and lineup edits preserve unchanged membership', () => {
  const song = { title:'Psalm', lyrics:'[Verse 1]\nMorning and evening' };
  assert.deepEqual(searchLibrary([song], [{name:'Morning service'}], 'morning'), {
    songs:[{item:song,excerpt:'Morning and evening'}],
    setlists:[{item:{name:'Morning service'},excerpt:''}],
  });
  assert.deepEqual(lineupChanges([1, 2, 3], [2, 3, 4]), {add:[4],remove:[1],reorder:false});
  assert.deepEqual(lineupChanges([1, 2, 3], [4, 3, 1]), {add:[4],remove:[2],reorder:true});
});
