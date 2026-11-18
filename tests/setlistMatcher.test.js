import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSetlistHeading, indexSetlistLibrary, matchSetlist, normalizeSetlistTitle, parseSetlist } from '../shared/setlistMatcher.js';

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

test('cleans a pasted service list and keeps uncertain matches in review', () => {
  const copy='Sunday Morning Service\r\nSongs:\r\n2026-11-22\r\n🎵 • 1. Goodnes of God - Bethel Music [G]\r\n* Ang Púso Key: F\r\nAmazing Grace\r\nAmazing Grace by John Newton';
  const library=[...songs,{id:5,title:'Ang Puso'},{id:6,title:'Amazing Grace',artist:'Another Artist'}];
  assert.equal(detectSetlistHeading(copy).title,'Sunday Morning Service');
  assert.deepEqual(parseSetlist(copy).map(({title,artist})=>[title,artist]),[
    ['Goodnes of God','Bethel Music'],['Ang Púso',''],['Amazing Grace',''],['Amazing Grace','John Newton'],
  ]);
  assert.deepEqual(matchSetlist(copy,library).map(row=>row.review),['check','matched','choose','matched']);
  assert.equal(matchSetlist('Goodness of God',[{id:1,title:'Proclaim',artist:'Bethel Music',lyrics:'Goodness of God'}])[0].review,'missing');
  assert.equal(matchSetlist('New Song',[])[0].review,'missing');
});

test('reviews 40 fuzzy queries against a 1,000-song library', () => {
  const library=Array.from({length:1000},(_,id)=>({id,title:`Through the valley ${id.toString(36)} with glory`}));
  const index=indexSetlistLibrary(library);
  const copy=library.slice(0,40).map(song=>song.title.replace('valley','valey')).join('\n');
  const start=performance.now();
  assert.equal(matchSetlist(copy,library,index).length,40);
  assert.ok(performance.now()-start<50,'indexed review should take under 50 ms');
});
