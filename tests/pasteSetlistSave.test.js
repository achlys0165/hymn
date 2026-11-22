import assert from 'node:assert/strict';
import test from 'node:test';
import { commitPastedSetlist, undoPastedSetlist } from '../src/utils/pasteSetlistSave.js';

function fixture() {
  const songs = new Set([1, 2, 3]);
  const schedules = {1:[{song_id:1, notes:'Lead'}, {song_id:2}]};
  const changes = [];
  let reject;
  async function api(path, { method='GET', body } = {}) {
    if(method!=='GET') changes.push([method,path]);
    if(reject === method+' '+path) {
      reject=null;
      throw Object.assign(new Error('Write failed'),{status:500});
    }
    if(path==='/songs') { songs.add(4); return {song:{id:4,title:body.title}}; }
    if(path==='/songs/4') { songs.delete(4); return {}; }
    if(path==='/schedules') return {schedules:Object.keys(schedules).map(id=>({id,song_count:schedules[id].length}))};
    const [, id, songId]=path.match(/^\/schedules\/(\d+)(?:\/songs(?:\/(\d+|order))?)?$/);
    if(method==='GET') return {schedule:{id:Number(id)},songs:structuredClone(schedules[id])};
    if(method==='POST') schedules[id].push(body);
    if(method==='DELETE') schedules[id]=schedules[id].filter(row=>row.song_id!==Number(songId));
    if(method==='PUT') schedules[id]=body.song_ids.map(next=>schedules[id].find(row=>row.song_id===next));
    return {};
  }
  return {api, songs, schedules, changes, fail:route=>{reject=route;}};
}

test('a partial existing-setlist replacement restores the prior order and notes', async () => {
  const {api, songs, schedules, fail}=fixture();
  const original=structuredClone(schedules[1]);
  fail('DELETE /schedules/1/songs/2');
  await assert.rejects(commitPastedSetlist(api,{
    entries:[{id:3},{title:'New song'}],setlistId:1,baseIds:[1,2],mode:'replace',
  }), /previous songs were restored/);
  assert.deepEqual(schedules[1],original);
  assert.deepEqual([...songs],[1,2,3]);
});

test('undo retains a new song now used by another setlist', async () => {
  const {api, songs, schedules}=fixture();
  const receipt=await commitPastedSetlist(api,{entries:[{title:'New song'}],setlistId:1,baseIds:[1,2]});
  schedules[2]=[{song_id:4}];
  const result=await undoPastedSetlist(api,receipt);
  assert.deepEqual(schedules[1].map(row=>row.song_id),[1,2]);
  assert.deepEqual(result.retained.map(row=>row.id),[4]);
  assert.ok(songs.has(4));
});

test('editing elsewhere prevents pasted changes from overwriting the setlist', async () => {
  const {api, changes}=fixture();
  await assert.rejects(commitPastedSetlist(api,{
    entries:[{title:'New song'}],setlistId:1,baseIds:[2,1],mode:'replace',
  }), /saved songs differ/);
  assert.deepEqual(changes,[]);
});

test('pasted missing songs save lyrics and artist before creating the ordered setlist', async () => {
  const calls=[];
  const lyrics='[Verse 1]\nFirst lyric line\nSecond lyric line\n\n[Chorus]\nAnother lyric line';
  const api=async (path, options)=>{
    calls.push({path,...options});
    return path==='/songs'?{song:{id:4,...options.body}}:{schedule:{id:2,...options.body}};
  };
  const result=await commitPastedSetlist(api,{
    entries:[{id:1},{title:'Missing song',artist:'Song artist',lyrics},{id:2}],fields:{name:'Sunday'},
  });
  assert.deepEqual(calls,[
    {path:'/songs',method:'POST',body:{title:'Missing song',artist:'Song artist',lyrics,category:'praise_worship'}},
    {path:'/schedules',method:'POST',body:{name:'Sunday',song_ids:[1,4,2]}},
  ]);
  assert.equal(result.created[0].lyrics,lyrics);
});

test('adding a missing song to an existing setlist keeps its lyrics; title-only entries still work', async () => {
  for(const lyrics of ['[Verse 1]\nLine one\nLine two',undefined]) {
    const {api,schedules}=fixture();
    let sent;
    await commitPastedSetlist(async (path,options)=>{
      if(path==='/songs') sent=options.body;
      return api(path,options);
    },{entries:[{title:'New song',lyrics}],setlistId:1,baseIds:[1,2]});
    assert.equal(sent.lyrics,lyrics??'');
    assert.deepEqual(schedules[1].map(row=>row.song_id),[1,2,4]);
  }
});
