import { lineupChanges } from './workspace.js';

const orderedIds=data=>data.songs.map(row=>Number(row.song_id));
const sameOrder=(a,b)=>a.length===b.length && a.every((id,index)=>id===b[index]);

export async function writeLineup(api,id,current,desired,{ notes=new Map(), onBefore, onApplied }={}) {
  const {add,remove,reorder}=lineupChanges(current,desired);
  let order=[...current];
  async function write(next,path,options) {
    onBefore?.(next);
    await api('/schedules/'+id+'/songs'+path, options);
    order=next;
    onApplied?.(order);
  }
  for(const songId of add) await write([...order,songId],'',{method:'POST',body:{song_id:songId,notes:notes.get(songId)}});
  for(const songId of remove) await write(order.filter(id=>id!==songId),'/'+songId,{method:'DELETE'});
  if(reorder) await write(desired,'/order',{method:'PUT',body:{song_ids:desired}});
}

// The delete endpoint cascades across setlists. Only clean up newly created songs
// after checking all current memberships, and leave them alone if a check fails.
async function cleanSongs(api,created) {
  if(!created.length) return {removed:[],retained:[]};
  const candidates=new Set(created.map(song=>Number(song.id)));
  const referenced=new Set();
  const removed=[];
  try {
    const {schedules}=await api('/schedules');
    const withSongs=schedules.filter(item=>Number(item.song_count)>0 || item.song_count==null);
    for(let index=0;index<withSongs.length;index+=6) {
      const results=await Promise.all(withSongs.slice(index,index+6).map(item=>api('/schedules/'+item.id)));
      for(const result of results) for(const id of orderedIds(result)) if(candidates.has(id)) referenced.add(id);
    }
    for(const song of created) {
      if(referenced.has(Number(song.id))) continue;
      try { await api('/songs/'+song.id,{method:'DELETE'}); removed.push(song); }
      catch { /* Retain a song when its deletion did not succeed. */ }
    }
  } catch { /* Membership could not be verified. Retain all unconfirmed songs. */ }
  return {removed,retained:created.filter(song=>!removed.includes(song))};
}

async function restoreLineup(api,id,before,observed) {
  const notes=new Map(before.songs.map(row=>[Number(row.song_id),row.notes]));
  const target=orderedIds(before);
  const current=orderedIds(await api('/schedules/'+id));
  if(!observed.some(order=>sameOrder(order,current))) throw new Error('The saved songs changed in another session.');
  if(!sameOrder(current,target)) await writeLineup(api,id,current,target,{notes});
}

export async function commitPastedSetlist(api,{ entries, fields, setlistId, baseIds=[], mode='append' }) {
  if(!entries.length||entries.length+(setlistId&&mode==='append'?baseIds.length:0)>500) throw new Error('Choose between 1 and 500 songs.');
  const created=[];
  let before;
  let lastOrder=[];
  let attempted=null;
  let stage='checking';
  try {
    if(setlistId) {
      before=await api('/schedules/'+setlistId);
      lastOrder=orderedIds(before);
      if(!sameOrder(lastOrder,baseIds)) throw new Error('The saved songs differ from this editor. Save or reopen the setlist before pasting.');
    }
    const planned=[];
    for(const entry of entries) {
      if(entry.id) planned.push(Number(entry.id));
      else {
        if(!entry.title?.trim()) throw new Error('Enter a title for each new song.');
        stage='song';
        const {song}=await api('/songs',{method:'POST',body:{title:entry.title,artist:entry.artist||'',lyrics:'',category:'praise_worship'}});
        created.push(song);
        planned.push(Number(song.id));
      }
      stage='checking';
    }
    const desired=[...new Set([...(setlistId&&mode==='append'?lastOrder:[]),...planned])];
    if(setlistId) {
      stage='lineup';
      await writeLineup(api,setlistId,lastOrder,desired,{onBefore:next=>{attempted=next;},onApplied:next=>{lastOrder=next;attempted=null;}});
      return {schedule:before.schedule,ids:desired,created,before,added:planned.length};
    }
    stage='setlist';
    const {schedule}=await api('/schedules',{method:'POST',body:{...fields,song_ids:desired}});
    return {schedule,ids:desired,created,before:null,added:planned.length};
  } catch(error) {
    let restored=true;
    if(stage==='lineup'&&before) {
      try { await restoreLineup(api,setlistId,before,attempted?[lastOrder,attempted]:[lastOrder]); }
      catch { restored=false; }
    }
    // A song POST can return 500 after its insert. The schedule POST returns its row in the write batch.
    const unknown=stage==='song'&&(!error.status||error.status>=500) || stage==='setlist'&&(!error.status||error.status>=502);
    const rollback=unknown&&stage==='setlist' ? {removed:[],retained:created} : await cleanSongs(api,created);
    const status=!restored?' The previous songs could not be fully restored. Reopen the setlist to review it.'
      : stage==='lineup'?' The previous songs were restored.':'';
    const remaining=rollback.retained.length?' Kept in the library: '+rollback.retained.map(song=>song.title).join(', ')+'.':'';
    const uncertain=unknown?' A create request could not be verified. Check the library and setlists before retrying.':'';
    const failure=new Error((error.message||'Could not save the pasted songs.')+status+remaining+uncertain);
    failure.uncertain=unknown || !restored || rollback.retained.length>0;
    failure.status=error.status;
    failure.retained=rollback.retained;
    throw failure;
  }
}

export async function undoPastedSetlist(api,receipt) {
  const {schedule,ids,before,created}=receipt;
  if(before) await restoreLineup(api,schedule.id,before,[ids]);
  else {
    const latest=await api('/schedules/'+schedule.id);
    const changed=['name','date','status','service_time','description'].some(key=>(latest.schedule[key]??'')!==(schedule[key]??''));
    if(changed||!sameOrder(ids,orderedIds(latest))) throw new Error('This setlist has changed since it was created. Undo could not remove it.');
    await api('/schedules/'+schedule.id,{method:'DELETE'});
  }
  return cleanSongs(api,created);
}
