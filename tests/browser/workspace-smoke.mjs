import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { nextSunday } from '../../src/utils/workspace.js';
import { verifyEditorFlows } from './editor-flows.mjs';

const songs = [
  {id:1,title:'10,000 reasons',artist:'Matt Redman',lyrics:'[Verse 1]\nThe sun comes up, it’s a new day dawning',updated_at:'2026-11-17'},
  {id:2,title:'Agnus dei (anniv)',lyrics:'[Chorus]\r\nAlleluia  \r\n'},
  {id:3,title:'Alpha omega (anniv)',lyrics:'[Verse 1]\nWe worship You'},
];
const lists = [{id:1,name:'Church anniversary',date:nextSunday(),service_time:'9:00 AM',status:'draft',description:''}];
const lineups = {1:[1,2,3]};
let authenticated = true;
let rejectSongUpdate = false;
let rejectSetlistCreate = false;
let songUpdates = 0;
const user = {id:91,username:'test-editor',displayName:'Test editor',role:'editor'};
const dist = resolve('dist');
const types = {js:'text/javascript',css:'text/css',html:'text/html',png:'image/png',woff2:'font/woff2',webmanifest:'application/manifest+json'};
const json = (res, body, status = 200) => res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(body));
async function body(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  return JSON.parse(text);
}
async function fixture(req,res) {
  const {pathname:path} = new URL(req.url,'http://localhost');
  const method = req.method;
  if (path === '/api/auth/me') return authenticated ? json(res,{user}) : json(res,{error:'Sign in required'},401);
  if (path === '/api/auth/logout' && method === 'POST') { authenticated=false; return json(res,{}); }
  if (path === '/api/auth/config') return json(res,{registrationEnabled:false});
  if (path.startsWith('/api/') && !authenticated) return json(res,{error:'Sign in required'},401);
  if (path === '/api/songs' && method === 'GET') return json(res,{songs});
  if (path === '/api/songs' && method === 'POST') {
    const song = {...await body(req),id:Math.max(...songs.map(song=>song.id))+1};
    songs.push(song); return json(res,{song},201);
  }
  const songId = Number(path.match(/^\/api\/songs\/(\d+)$/)?.[1]);
  if (songId && method === 'PUT') {
    songUpdates++;
    if (rejectSongUpdate) return json(res,{error:'Test save failed'},500);
    const song = songs.find(item=>item.id===songId);
    return json(res,{song:Object.assign(song,await body(req))});
  }
  if (songId && method === 'DELETE') {
    songs.splice(songs.findIndex(item=>item.id===songId),1);
    return json(res,{});
  }
  if (path === '/api/schedules' && method === 'GET') return json(res,{schedules:lists.map(list=>({...list,song_count:lineups[list.id].length}))});
  if (path === '/api/schedules' && method === 'POST') {
    if (rejectSetlistCreate) return json(res,{error:'Test setlist save failed'},500);
    const {song_ids,...data} = await body(req);
    const schedule = {...data,id:Math.max(...lists.map(list=>list.id))+1};
    lists.push(schedule); lineups[schedule.id]=song_ids; return json(res,{schedule},201);
  }
  const listRoute = path.match(/^\/api\/schedules\/(\d+)(?:\/songs(?:\/(\d+|order))?)?$/);
  if (listRoute) {
    const id = Number(listRoute[1]);
    const schedule = lists.find(item=>item.id===id);
    if (!schedule) return json(res,{error:'Not found'},404);
    if (path.endsWith('/order') && method === 'PUT') { lineups[id]=(await body(req)).song_ids; return json(res,{}); }
    if (path.endsWith('/songs') && method === 'POST') { lineups[id].push((await body(req)).song_id); return json(res,{}); }
    if (listRoute[2] && method === 'DELETE') { lineups[id]=lineups[id].filter(songID=>songID!==Number(listRoute[2])); return json(res,{}); }
    if (method === 'DELETE') { lists.splice(lists.indexOf(schedule),1); delete lineups[id]; return json(res,{}); }
    if (method === 'PUT') return json(res,{schedule:Object.assign(schedule,await body(req))});
    return json(res,{schedule,songs:lineups[id].map((song_id,index)=>({...songs.find(song=>song.id===song_id),song_id,position:index+1}))});
  }
  if (path.startsWith('/api/')) return json(res,{error:'Unknown fixture route '+method+' '+path},404);
  const requested = resolve(dist, '.'+path);
  const file = requested.startsWith(dist+sep) && (await stat(requested).catch(()=>null))?.isFile() ? requested : join(dist,'index.html');
  const contentType = types[file.split('.').at(-1)] || 'application/octet-stream';
  res.writeHead(200,{'Content-Type':contentType}).end(await readFile(file));
}

const server = createServer((req,res) => fixture(req,res).catch(error => json(res,{error:error.message},500)));
server.listen(0,'127.0.0.1');
await once(server,'listening');
const origin = 'http://127.0.0.1:'+server.address().port;
if (process.env.HYMN_PLAYWRIGHT_ENTRY) {
  try {
    await verifyEditorFlows(origin,songs,lists,value=>{rejectSetlistCreate=value;});
  } finally {
    server.closeAllConnections();
    server.close();
  }
} else await verifyWorkspace();

async function verifyWorkspace() {
const chromePath = process.env.HYMN_CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = await mkdtemp(join(tmpdir(),'hymn-workspace-test-'));
const chrome = spawn(chromePath,['--headless=new','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
chrome.on('error', error => console.error('Chrome launch:',error.message));
let socket;
try {
  let port;
  for (let tries=0;tries<70;tries++) {
    try { port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/[\r\n]/)[0]; if (port) break; } catch {}
    await delay(80);
  }
  assert.ok(port,'Chrome debug port. Set HYMN_CHROME_BINARY if Chrome is installed elsewhere.');
  const pages = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket = new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let id=0;
  const pending=new Map();
  const runtimeErrors=[];
  socket.addEventListener('message',({data})=>{
    const reply=JSON.parse(data);
    if (reply.method==='Runtime.exceptionThrown') runtimeErrors.push(reply.params.exceptionDetails.exception?.description || reply.params.exceptionDetails.text);
    if (reply.method==='Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:true});
    if (!reply.id) return;
    const callback=pending.get(reply.id);
    pending.delete(reply.id);
    if(reply.error) callback.reject(reply.error);
    else callback.resolve(reply.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    pending.set(++id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function wait(expression, label=expression) {
    for (let i=0;i<100;i++) {
      if (await evaluate(expression)) return;
      await delay(40);
    }
    assert.fail(label+'; browser errors: '+runtimeErrors.join('; ')+'; body: '+await evaluate('document.body.innerText.slice(0,600)'));
  }
  const q=selector=>'document.querySelector('+JSON.stringify(selector)+')';
  const exists=selector=>wait('Boolean('+q(selector)+')',selector);
  const click=async selector=>{await exists(selector); await evaluate(q(selector)+'.click()');};
  async function input(selector,value) {
    await exists(selector);
    await evaluate(q(selector)+'.value='+JSON.stringify(value)+'; '+q(selector)+'.dispatchEvent(new Event("input",{bubbles:true}))');
  }
  const size=async (width,height,touch)=>{
    await send('Emulation.setDeviceMetricsOverride',{width,height,mobile:touch,deviceScaleFactor:1});
    await send('Emulation.setTouchEmulationEnabled',{enabled:touch});
  };
  const noOverflow=()=>evaluate('document.documentElement.scrollWidth <= innerWidth');
  const keyboard=key=>evaluate('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:'+JSON.stringify(key)+',bubbles:true,cancelable:true}))');
  const screenshot=async name=>{
    const directory=process.env.HYMN_BROWSER_ARTIFACTS;
    if (!directory) return;
    const {data}=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(join(directory,name+'.png'),Buffer.from(data,'base64'));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await size(375,667,true);
  await send('Page.navigate',{url:origin+'/'});
  await exists('.h-home .h-service');
  await wait('document.querySelector(".h-service ol")?.children.length===3');
  await wait('document.fonts.ready.then(()=>Array.from(document.fonts).some(font=>font.status==="loaded" && font.family.includes("Figtree")))');
  assert.ok(await noOverflow());
  await screenshot('hymn-home-phone');
  await click('.h-bottom [aria-current=page] + button');
  await exists('.h-list .h-library-row');
  assert.ok(await evaluate('[...document.querySelectorAll(".h-list .h-library-row")].every(row=>row.offsetHeight===72)'));
  assert.ok(await evaluate('getComputedStyle(document.querySelector(".h-list .h-row-copy strong")).color===getComputedStyle(document.body).color'));
  await click('.h-list [data-id="1"] [data-library-item]');
  await wait('location.pathname==="/songs/1"');
  await exists('.h-lyric-section');
  await click('.h-mobile-top [aria-label=Back]');
  await wait('location.pathname==="/songs"');
  await click('.h-bottom-create');
  await wait('document.querySelectorAll("dialog [data-menu-item]").length===5');
  await delay(300);
  await screenshot('hymn-create-phone');
  await click('dialog [data-menu-item]:first-child');
  await input('input[required]','A browser test song');
  const lyricField='textarea[aria-label=Lyrics]';
  const pastedLyrics='VERSE 1:\r\nAn exact line  \r\n(Chorus)\r\nChorus starts here\r\nC  G/B  Am  F';
  await exists(lyricField);
  await evaluate(`{
    const data=new DataTransfer();
    data.setData('text/plain',${JSON.stringify(pastedLyrics)});
    ${q(lyricField)}.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  }`);
  await wait('document.querySelector(".h-lyric-outline")?.textContent.includes("Verse 1")');
  await wait('document.querySelector(".h-suggestions")?.textContent.includes("chord line")');
  await screenshot('hymn-write-phone');
  await click('.h-editor-footer .h-primary');
  await wait('location.pathname==="/songs/4" && !location.search');
  assert.equal(songs.at(-1).lyrics,'[Verse 1]\nAn exact line\n\n[Chorus]\nChorus starts here\nC  G/B  Am  F');
  await click('.h-mobile-top .h-top-actions .h-ghost');
  await exists('.h-editor-footer');
  await input('input[required]','A browser test song edited');
  rejectSongUpdate=true;
  await click('.h-editor-footer .h-primary');
  await wait('document.querySelector(".h-reading [role=alert]")?.textContent==="Test save failed"');
  assert.equal(await evaluate(q('input[required]')+'.value'),'A browser test song edited');
  rejectSongUpdate=false;
  await click('.h-editor-footer .h-primary');
  await wait('!location.search && document.querySelector(".h-reading-header h1")?.textContent==="A browser test song edited"');
  const originalLyrics=songs.map(song=>song.lyrics);
  const writesBefore=songUpdates;
  for (const song of songs) {
    await click('.h-mobile-top [aria-label=Back]');
    await click('.h-list [data-id="'+song.id+'"] [data-library-item]');
    await wait('location.pathname==="/songs/'+song.id+'"');
    await click('.h-mobile-top .h-top-actions .h-ghost');
    await exists(lyricField);
    await click('.h-editor-footer .h-primary');
    await wait('!location.search');
  }
  assert.equal(songUpdates,writesBefore);
  assert.deepEqual(songs.map(song=>song.lyrics),originalLyrics);

  await size(1366,800,false);
  await wait('getComputedStyle(document.querySelector(".h-rail")).display==="flex"');
  await wait('document.querySelector(".h-list .h-library-row").offsetHeight===64');
  await keyboard('/');
  await input('dialog input[type=search]','dawning');
  await wait('document.querySelector("dialog mark")?.textContent==="dawning"');
  await click('dialog [data-menu-item]');
  await wait('location.pathname==="/songs/1"');
  await screenshot('hymn-songs-desktop');
  await keyboard('c');
  await wait('document.querySelector("dialog")?.dataset.kind==="create"');
  await click('dialog [data-menu-item]:last-child');
  const paste='Agnus dei (anniv)\nAlpha omega (anniv)\nMissing test song';
  const pasteDialog='dialog[data-kind="paste-flow"]';
  const confirmPaste=pasteDialog+' .h-paste-buttons .h-primary';
  await input(pasteDialog+' textarea',paste);
  await wait('document.querySelector(".h-paste-rows")?.textContent.includes("Not found")');
  await screenshot('hymn-paste-desktop');
  assert.equal(await evaluate('document.querySelectorAll("dialog select, dialog input[type=radio]").length'),0);
  await click('.h-paste-rows [data-review-line="3"] .h-paste-extra.h-actions .h-secondary');
  await wait('document.querySelector(".h-paste-rows")?.textContent.includes("without lyrics when you confirm")');
  assert.equal(songs.length,4);
  assert.equal(lists.length,1);
  rejectSetlistCreate=true;
  await click(confirmPaste);
  await wait('document.querySelector(".h-paste-outcome")?.textContent.includes("Test setlist save failed")');
  assert.equal(await evaluate(q(pasteDialog+' textarea')+'.value'),paste);
  assert.equal(songs.length,4);
  assert.equal(lists.length,1);
  await screenshot('hymn-paste-error-desktop');
  rejectSetlistCreate=false;
  await click(confirmPaste);
  await wait('location.pathname==="/setlists/2" && !location.search');
  assert.deepEqual(lineups[2],[2,3,5]);
  assert.equal(songs.at(-1).lyrics,'');
  await click('.h-toast button');
  await wait('document.querySelector(".h-toast")?.textContent.trim()==="Restored"');
  assert.equal(lists.length,1);
  assert.equal(songs.length,4);
  await size(390,844,true);
  await click('.h-bottom-create');
  await click('dialog [data-menu-item]:last-child');
  await input(pasteDialog+' textarea',paste);
  await wait('document.querySelector(".h-paste-buttons .h-primary")?.textContent.trim()==="Review"');
  await screenshot('hymn-paste-write-phone');
  await click(confirmPaste);
  await wait('document.querySelector(".h-paste-rows")?.textContent.includes("Not found")');
  await screenshot('hymn-paste-review-phone');
  await click(confirmPaste);
  await wait('location.pathname==="/setlists/2" && !location.search');
  assert.deepEqual(lineups[2],[2,3]);
  await size(1366,800,false);
  await click('.h-reading-tools .h-secondary');
  await exists('.h-editor [data-lineup-id="3"]');
  await screenshot('hymn-setlist-form-desktop');
  await evaluate('[...document.querySelectorAll(".h-editor button")].find(button=>button.textContent.includes("Paste setlist")).click()');
  await input(pasteDialog+' textarea','10,000 reasons');
  await wait('document.querySelector(".h-paste-rows")?.textContent.includes("Matched")');
  await evaluate('[...document.querySelectorAll("dialog button")].find(button=>button.textContent.includes("Replace songs")).click()');
  await wait('document.querySelector(".h-paste-fields [role=status]")?.textContent.includes("replaces") || document.querySelector(".h-paste-review")?.textContent.includes("replaces the 2 songs")');
  await screenshot('hymn-paste-replace-desktop');
  assert.deepEqual(lineups[2],[2,3]);
  await click(confirmPaste);
  await wait('!document.querySelector("dialog") && !!'+q('[data-lineup-id="1"]'));
  assert.deepEqual(lineups[2],[1]);
  await click('.h-toast button');
  await wait('document.querySelector(".h-toast")?.textContent.trim()==="Restored"');
  assert.deepEqual(lineups[2],[2,3]);
  await click('[data-lineup-id="3"] [aria-label="Move song up"]');
  await click('.h-editor-footer .h-primary');
  await wait('!location.search && document.querySelector(".h-lineup li strong")?.textContent==="Alpha omega (anniv)"');
  assert.deepEqual(lineups[2],[3,2]);
  await click('.h-reading > .h-primary');
  await wait('document.querySelector(".h-session")?.textContent.includes("Song 1 of 2")');
  await keyboard(']');
  await wait('document.querySelector(".h-session")?.textContent.includes("Song 2 of 2")');
  await keyboard('Escape');
  await wait('!location.search && document.querySelector(".h-session")?.textContent.includes("Song 2 of 2")');
  assert.ok(await noOverflow());

  for (const theme of ['light','dark']) {
    await evaluate('document.documentElement.dataset.theme='+JSON.stringify(theme));
    for (const [width,height] of [[360,740],[375,667],[390,844],[412,915],[768,1024],[844,390],[1024,768],[1366,768],[1440,900],[1920,1080]]) {
      await size(width,height,width<900 || width===1024);
      assert.ok(await noOverflow(),theme+' at '+width);
      assert.ok(await evaluate('[...document.querySelectorAll(".h-list .h-library-row")].every(row=>row.offsetHeight===0 || row.offsetHeight==='+ (width<900?72:64)+')'));
      assert.ok(await evaluate('document.querySelector(".h-session")?.getClientRects().length > 0'));
    }
  }
  await size(1366,800,false);
  await wait('Boolean(navigator.serviceWorker.controller)');
  await wait('caches.open("hymn-shell-v1").then(cache=>cache.keys()).then(keys=>keys.some(key=>key.url.includes("/assets/Main-")))');
  await evaluate('sessionStorage.removeItem("hymn_verified_user")');
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.reload');
  await wait('document.querySelector(".h-offline")?.textContent.includes("Showing saved data")');
  await exists('.h-lineup');
  await click('.h-rail .h-create');
  await click('dialog [data-menu-item]:last-child');
  await input(pasteDialog+' textarea','Agnus dei (anniv)');
  await wait('document.querySelector(".h-paste-rows")?.textContent.includes("Matched")');
  assert.equal(await evaluate(q(confirmPaste)+'.disabled'),true);
  await click(pasteDialog+' .h-dialog-header button');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await wait('!document.querySelector(".h-offline")');
  await click('.h-rail-me');
  await click('dialog [data-menu-item]:last-child');
  await wait('location.pathname==="/login"');
  assert.equal(await evaluate('localStorage.getItem("hymn:library:91")'),null);
  assert.equal(await evaluate('localStorage.getItem("hymn:offline-owner")'),null);
  assert.equal(await evaluate('sessionStorage.getItem("hymn_verified_user")'),null);
  assert.deepEqual(runtimeErrors,[]);
  console.log('20 viewport/theme cases, lyric search, Create, song saves and retry, paste and reorder, setlist session, offline reload, and sign-out passed.');
} finally {
  socket?.close();
  chrome.kill();
  server.closeAllConnections();
  server.close();
}
}
