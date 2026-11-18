<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import {
  ArrowDownAZ, BookOpen, Check, ChevronLeft, ChevronRight, Clipboard, ClipboardList, Copy, Ellipsis, House,
  Keyboard, ListMusic, ListPlus, Music2, PenLine, Plus, RefreshCw, ScanLine, Search, Share2, Trash2, Type, UserRound, X,
} from 'lucide-vue-next';
import LibraryRows from './LibraryRows.vue';
import WorkspaceDialog from './WorkspaceDialog.vue';
import { checkSession, clearLibraryCache, clearSession, offlineSession, readLibraryCache, request, saveLibraryCache, updateLineup, workspaceUser } from '../utils/workspaceApi.js';
import { dateTile, formatDate, lyricSections, lyricsForEditor, pluralCount, readSetting, searchLibrary, setlistBuckets, songCount, writeSetting } from '../utils/workspace.js';
import '../styles/workspace.css';

const SongEditor = defineAsyncComponent(() => import('./SongEditor.vue'));
const SetlistEditor = defineAsyncComponent(() => import('./SetlistEditor.vue'));
const route = useRoute();
const router = useRouter();
const destinations = [{ id:'home', label:'Home', icon:House }, { id:'songs', label:'Songs', icon:Music2 }, { id:'setlists', label:'Setlists', icon:ListMusic }, { id:'me', label:'Me', icon:UserRound }];
const createActions = [
  { type:'songs', mode:'write', label:'Write a song', hint:'Start with a blank song', icon:PenLine },
  { type:'songs', mode:'paste', label:'Paste lyrics', hint:'Start from lyrics you already have', icon:Clipboard },
  { type:'songs', mode:'scan', label:'Scan photo', hint:'Choose a photo of a lyric sheet', icon:ScanLine },
  { type:'setlists', mode:'write', label:'New setlist', hint:'Build an ordered lineup', icon:ListPlus },
  { type:'setlists', mode:'paste', label:'Paste setlist', hint:'Match a list of titles to your songs', icon:ClipboardList },
];
const songs = ref([]);
const setlists = ref([]);
const details = shallowRef({});
const detailErrors = ref({});
const pendingDetail = new Map();
const setlistGenerations = new Map();
const view = computed(() => route.name);
const routeId = computed(() => Number(route.params.id) || null);
const isSongView = computed(() => view.value === 'songs');
const isLibrary = computed(() => ['songs','setlists'].includes(view.value));
const activeEditor = computed(() => isLibrary.value && ['new','current'].includes(route.query.edit));
const editorKind = computed(() => isSongView.value ? 'song' : 'setlist');
const editorId = computed(() => route.query.edit === 'current' ? routeId.value : null);
const editorKey = computed(() => [view.value, route.query.edit, editorId.value, route.query.flow].join(':'));
const user = workspaceUser;
const owner = computed(() => user.value?.id);
const draftKey = computed(() => 'hymn:draft:' + owner.value + ':' + editorKind.value + ':' + (editorId.value ?? 'new'));
const filter = ref('all');
const membershipLoading = ref(false);
const membershipIncomplete = ref(false);
const sort = ref('title');
const period = ref('upcoming');
const loading = ref(true);
const loadError = ref('');
const offline = ref(offlineSession.value || !navigator.onLine);
const lastUpdated = ref(null);
const savedAt = ref(null);
const busy = ref(false);
const dirty = ref(false);
const dirtyError = ref('');
const working = computed(() => !offline.value && ['editor','admin'].includes(user.value?.role));
const theme = ref(readSetting('hymn:theme','system'));
const themeMedia = matchMedia('(prefers-color-scheme:dark)');
const desktop = matchMedia('(min-width:900px)');
const desktopScreen = ref(desktop.matches);
const app = ref(null);
const installDismissed = ref(readSetting('hymn:install-tip-dismissed',false));
const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
const android = /Android/i.test(navigator.userAgent);
const showInstallTip = computed(() => !desktopScreen.value && !installDismissed.value && (ios || android)
  && !navigator.standalone && !matchMedia('(display-mode:standalone)').matches);
const popup = shallowRef(null);
const session = ref(null);
const railCreate = ref(null);
const homePanel = ref(null);
const listPanel = ref(null);
const detailPanel = ref(null);
const rowsStart = ref(null);
const headerHidden = ref(false);
const nearTop = ref(true);
const lyricSize = ref(readSetting('hymn:lyric-size', null));
const wakeOn = ref(false);
const hasWake = 'wakeLock' in navigator;
const hasShare = 'share' in navigator;
const initial = computed(() => (user.value?.displayName || user.value?.username || '').trim().slice(0,1).toLocaleUpperCase());
const buckets = computed(() => setlistBuckets(setlists.value.filter(item => !pendingDelete.value?.setlists?.has(item.id))));
const nextService = computed(() => buckets.value.upcoming[0]);
const nextSongs = computed(() => details.value[nextService.value?.id]?.songs?.slice(0,3) ?? []);
const lastSelection = ref(readSetting('hymn:selection:'+owner.value,{songs:null,setlists:null}));
const tabs = new Map();
const scrollPositions = new Map();
const emptyRows = [];
const pendingDelete = ref({ songs:new Set(), setlists:new Set() });
const deleteTimers = new Map();
const search = ref('');
const smallSearch = ref('');
let queryTimer;
const searches = ref([]);
const upcomingRail = ref(null);
const toast = shallowRef(null);
let toastTimer;
let dragRefresh = null;
let wakeLock;
let disposed = false;
let sessionPromise;
let hasLoaded = false;

const activeSongList = computed(() => songs.value.filter(item => !pendingDelete.value.songs.has(item.id)));
const activeSetlists = computed(() => setlists.value.filter(item => !pendingDelete.value.setlists.has(item.id)));
const membership = computed(() => new Set(activeSetlists.value.flatMap(item => details.value[item.id]?.songs.map(song => Number(song.song_id)) || [])));
const hasArtist = computed(() => activeSongList.value.some(song => song.artist));
const hasEdited = computed(() => activeSongList.value.some(song => validStamp(song.updated_at)));
const byTitle = (a,b) => a.title.localeCompare(b.title);
const byEdited = (a,b) => (validStamp(b.updated_at) || 0) - (validStamp(a.updated_at) || 0) || byTitle(a,b);
const recentSongs = computed(() => (hasEdited.value ? activeSongList.value.filter(song=>validStamp(song.updated_at)).sort(byEdited)
  : [...activeSongList.value].sort(byTitle)).slice(0, 12).map(item=>({ item })));
const songRows = computed(() => activeSongList.value.filter(song => filter.value === 'all'
  || filter.value === 'artist' && song.artist || filter.value === 'edited' && validStamp(song.updated_at)
  || filter.value === 'setlist' && membership.value.has(Number(song.id))).sort(sort.value === 'edited' ? byEdited : byTitle));
const setlistRows = computed(() => period.value === 'past' ? buckets.value.past : [...buckets.value.upcoming, ...buckets.value.undated]);
const selectedSet = computed(() => routeId.value
  ? activeSetlists.value.find(item => item.id === routeId.value)
  : setlistRows.value.find(item => item.id === lastSelection.value.setlists) || setlistRows.value[0]);
const setlistDetail = computed(() => details.value[selectedSet.value?.id]);
const lineup = computed(() => setlistDetail.value?.songs ?? emptyRows);
const sessionSongId = computed(() => view.value === 'setlists' && routeId.value === session.value?.setlistId ? session.value.songId : null);
const activeSessionSong = computed(() => lineup.value.find(item => Number(item.song_id) === sessionSongId.value));
const sessionIndex = computed(() => lineup.value.findIndex(item => Number(item.song_id) === sessionSongId.value));
const isSessionReading = computed(() => Boolean(route.query.song && activeSessionSong.value));
const chosenSong = computed(() => {
  if (isSessionReading.value) return activeSongList.value.find(song => Number(song.id) === sessionSongId.value) || activeSessionSong.value;
  return activeSongList.value.find(song => song.id === (routeId.value || lastSelection.value.songs)) || (!routeId.value ? songRows.value[0] || activeSongList.value[0] : null);
});
const readingSong = computed(() => isSongView.value || isSessionReading.value ? chosenSong.value : null);
const lyrics = computed(() => lyricSections(readingSong.value));
const mobileDetail = computed(() => isLibrary.value && (routeId.value != null || activeEditor.value));
const title = computed(() => view.value === 'me' ? 'Me' : activeEditor.value ? (editorId.value ? 'Edit ' + editorKind.value : editorKind.value === 'song' ? 'Write a song' : 'New setlist')
  : isLibrary.value ? isSongView.value ? chosenSong.value?.title || 'Song' : isSessionReading.value ? readingSong.value?.title : selectedSet.value?.name || 'Setlist' : 'Hymn');
const searchResults = computed(() => searchLibrary(activeSongList.value, activeSetlists.value, smallSearch.value));
const songMembership = computed(() => activeSetlists.value.filter(item => details.value[item.id]?.songs.some(song => Number(song.song_id) === Number(readingSong.value?.id ?? readingSong.value?.song_id))));

const listY = ref(0);
const listHeight = ref(620);
const listOffset = ref(0);
const rowSize = computed(() => desktopScreen.value ? 64 : 72);
const hasLetters = computed(() => sort.value === 'title' && songRows.value.length >= 40);
const letterOf = song => song?.title?.trim().charAt(0).toLocaleUpperCase() || '#';
const annotatedSongs = computed(() => {
  let last = '';
  return songRows.value.map(item => {
    const letter = letterOf(item);
    const entry = { item, letter: letter !== last ? letter : '' };
    last = letter;
    return entry;
  });
});
const letters = computed(() => annotatedSongs.value.map((row,index) => ({ letter: row.letter, index })).filter(row => row.letter));
const jumpIndex = ref(0);
const virtualLetter = computed(() => letterOf(annotatedSongs.value[Math.max(0,Math.floor((listY.value-listOffset.value)/rowSize.value))]?.item));
const virtualRows = computed(() => {
  if (!isSongView.value) return { rows:setlistRows.value.map(item => ({item})), top:0, bottom:0 };
  const rows = annotatedSongs.value;
  if (rows.length <= 100) return { rows, top:0, bottom:0 };
  const from = Math.max(0, Math.min(rows.length-1, Math.floor((listY.value-listOffset.value)/rowSize.value)-6));
  const to = Math.min(rows.length, from + Math.ceil(listHeight.value / rowSize.value) + 15);
  return { rows:rows.slice(from,to), top:from*rowSize.value, bottom:(rows.length-to)*rowSize.value };
});
function validStamp(value) { const stamp = Date.parse(value); return Number.isFinite(stamp) ? stamp : null; }
function setTheme() {
  const dark = theme.value === 'dark' || (theme.value === 'system' && themeMedia.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#120e12' : '#fbf8fa';
}
watch(theme, value => { writeSetting('hymn:theme', value); setTheme(); });
watch(lyricSize, value => writeSetting('hymn:lyric-size', value));
watch(lastSelection, value => writeSetting('hymn:selection:'+owner.value,value), {deep:true});
watch(search, value => {
  clearTimeout(queryTimer);
  if (!value.trim()) smallSearch.value = '';
  else queryTimer = setTimeout(() => { smallSearch.value = value; }, 150);
});

function message(text, undo, duration = 3200) {
  clearTimeout(toastTimer);
  toast.value = { text, undo };
  toastTimer = setTimeout(() => { toast.value = null; }, duration);
}
function showError(error) {
  if (error.status === 401 || error.status === 403 && !user.value) {
    dirty.value = false;
    clearSession();
    router.replace({ name:'login', query:{ next:route.fullPath } });
  }
  message(error.message || 'Something went wrong. Try again.');
}
function cacheLibrary() {
  if (!hasLoaded || offline.value || owner.value == null) return;
  const stamp = lastUpdated.value || Date.now();
  if (saveLibraryCache(owner.value, { songs:songs.value, setlists:setlists.value, details:details.value, updated:stamp })) savedAt.value = stamp;
}
async function loadLibrary() {
  if (sessionPromise) return sessionPromise;
  sessionPromise = reload().finally(() => { sessionPromise = null; });
  return sessionPromise;
}
async function reload() {
  loading.value = true;
  loadError.value = '';
  try {
    if (offlineSession.value || !navigator.onLine) {
      const error = new Error('You’re offline.');
      throw error;
    }
    const [songData, setlistData] = await Promise.all([request('/songs'), request('/schedules')]);
    songs.value = songData.songs;
    setlists.value = setlistData.schedules;
    hasLoaded = true;
    offline.value = false;
    lastUpdated.value = Date.now();
    cacheLibrary();
    if (view.value === 'home' && nextService.value) fetchDetail(nextService.value.id, true).catch(() => {});
    if (view.value === 'setlists' && selectedSet.value) fetchDetail(selectedSet.value.id, true).catch(() => {});
  } catch (error) {
    if (error.status === 401 || error.status === 403) return showError(error);
    const cached = readLibraryCache(owner.value);
    if (cached && (!error.status || error.status >= 500)) {
      songs.value = cached.songs;
      setlists.value = cached.setlists;
      details.value = cached.details;
      lastUpdated.value = savedAt.value = cached.updated;
      offline.value = true;
    } else loadError.value = error.message || 'Could not load the library.';
  } finally {
    loading.value = false;
  }
}
async function fetchDetail(id, force = false, persist = true) {
  if (details.value[id] && (!force || offline.value)) return details.value[id];
  if (offline.value) {
    detailErrors.value[id] = 'This setlist wasn’t saved on this device.';
    throw new Error(detailErrors.value[id]);
  }
  if (pendingDetail.has(id)) return pendingDetail.get(id);
  delete detailErrors.value[id];
  const generation = setlistGenerations.get(id) || 0;
  const fetchPromise = request('/schedules/' + id).then(data => {
    if (generation !== (setlistGenerations.get(id)||0)) return data;
    details.value = { ...details.value, [id]:data };
    if (persist) cacheLibrary();
    return data;
  }).catch(error => {
    detailErrors.value[id] = error.message;
    if (error.status === 401) showError(error);
    throw error;
  }).finally(() => { if (pendingDetail.get(id) === fetchPromise) pendingDetail.delete(id); });
  pendingDetail.set(id, fetchPromise);
  return fetchPromise;
}
function invalidateDetail(id) {
  setlistGenerations.set(id,(setlistGenerations.get(id)||0)+1);
  pendingDetail.delete(id);
}
async function setFilter(key) {
  filter.value = key;
  if (key !== 'setlist' || offline.value || membershipLoading.value) return;
  const missing = activeSetlists.value.filter(item => item.song_count > 0 && !details.value[item.id]);
  membershipLoading.value = Boolean(missing.length);
  membershipIncomplete.value = false;
  try {
    for (let offset=0;offset<missing.length;offset+=4) {
      if (disposed || filter.value !== key) break;
      const result = await Promise.allSettled(missing.slice(offset,offset+4).map(item=>fetchDetail(item.id,false,false)));
      membershipIncomplete.value ||= result.some(entry=>entry.status==='rejected');
    }
    cacheLibrary();
  } finally {
    membershipLoading.value = false;
  }
}
async function recheck() {
  if (!navigator.onLine) return;
  if (offlineSession.value && !await checkSession({ offline:true })) {
    await router.replace({name:'login',query:{next:route.fullPath}});
    return;
  }
  await loadLibrary();
}
function handleOffline() { offline.value = true; }
function restoreForeground() {
  if (document.visibilityState !== 'visible') return;
  if (!lastUpdated.value || Date.now() - lastUpdated.value > 60_000) recheck();
}

const currentPanel = () => view.value === 'home' ? homePanel.value : view.value === 'me' || mobileDetail.value ? detailPanel.value : listPanel.value;
function measureList() {
  const list = listPanel.value;
  if (list && rowsStart.value) {
    listHeight.value = list.clientHeight;
    listOffset.value = rowsStart.value.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
  }
}
function scrollPanel(event) {
  const element = event.currentTarget;
  if (element === listPanel.value) listY.value = element.scrollTop;
  if (element !== currentPanel()) return;
  const position = scrollPositions.get(route.fullPath) || {};
  if (!mobileDetail.value && element.scrollTop !== (position.main || 0)) headerHidden.value = element.scrollTop > 24 && element.scrollTop > (position.main || 0);
  nearTop.value = element.scrollTop <= 24;
  scrollPositions.set(route.fullPath,{ list:listPanel.value?.scrollTop || 0, main:element.scrollTop });
}
function updateDesktop() { desktopScreen.value = desktop.matches; nextTick(measureList); }
function saveLocation(from) {
  const panel = currentPanel();
  scrollPositions.set(from.fullPath,{ list:listPanel.value?.scrollTop || 0, main:panel?.scrollTop || 0 });
  if (from.name && !from.query.edit) tabs.set(from.name,{ name:from.name, params:from.params, query:from.query });
}
function guard(to, from) {
  if (from.query.edit && (busy.value && !allowLeave || dirty.value && !confirm('Leave with unsaved changes?'))) return false;
  saveLocation(from);
}
let allowLeave = false;
onBeforeRouteUpdate(guard);
onBeforeRouteLeave(guard);
watch(() => route.fullPath, async () => {
  popup.value = null;
  headerHidden.value = false;
  dirty.value = false;
  dirtyError.value = '';
  if (view.value !== 'setlists') session.value = null;
  if (view.value === 'songs' && routeId.value) lastSelection.value.songs = routeId.value;
  if (view.value === 'setlists' && routeId.value) {
    lastSelection.value.setlists = routeId.value;
    const setlist = setlists.value.find(item => item.id === routeId.value);
    if (setlist && buckets.value.past.includes(setlist)) period.value = 'past';
    if (session.value && session.value.setlistId !== routeId.value) session.value = null;
    const songId = Number(route.query.song);
    if (songId) session.value = { setlistId:routeId.value, songId };
  }
  await nextTick();
  const saved = scrollPositions.get(route.fullPath);
  const panel = currentPanel();
  if (listPanel.value) listPanel.value.scrollTop = saved?.list ?? 0;
  if (panel) panel.scrollTop = saved?.main ?? 0;
  nearTop.value = !panel || panel.scrollTop <= 24;
  measureList();
}, { flush:'pre', immediate:true });
watch([selectedSet, view, nextService], () => {
  const id = view.value === 'home' ? nextService.value?.id : view.value === 'setlists' ? selectedSet.value?.id : null;
  if (id) fetchDetail(id).catch(() => {});
}, { immediate:true });
watch([filter, sort], () => {
  if (listPanel.value) listPanel.value.scrollTop = 0;
  listY.value = 0;
  nextTick(measureList);
});
function cycleTab(tab) {
  if (tab === view.value && !activeEditor.value) {
    const panel = currentPanel();
    if (panel?.scrollTop > 0) panel.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
    else recheck();
  } else router.push(tabs.get(tab) || {name:tab});
}
function openItem(type, item) {
  if (!item) return;
  const id = Number(item.id);
  const go = () => router.push({ name:type, params:{id} });
  if (document.startViewTransition && !desktopScreen.value && !matchMedia('(prefers-reduced-motion:reduce)').matches)
    document.startViewTransition(async () => { await go(); await nextTick(); });
  else go();
}
function parentRoute() {
  if (isSessionReading.value || route.query.song) return {name:'setlists',params:{id:routeId.value}};
  if (activeEditor.value && routeId.value) return {name:view.value,params:{id:routeId.value}};
  return {name:view.value};
}
function goBack() {
  const parent = router.resolve(parentRoute());
  if (history.state?.back === parent.fullPath) router.back();
  else router.replace(parent);
}
function openEditor(type, mode='write', item=null) {
  if (!working.value) return;
  if (type === 'setlists' && item && !details.value[item.id]) {
    fetchDetail(item.id).then(() => openEditor(type,mode,item)).catch(showError);
    return;
  }
  router.push({name:type, params:{id:item?.id ?? ''},query:{edit:item?'current':'new',flow:mode}});
}
function startService(item, songId) {
  if (!item) return;
  fetchDetail(item.id).then(data => {
    const id = Number(songId ?? data.songs[0]?.song_id);
    if (!data.songs.some(song => Number(song.song_id) === id)) return;
    if (view.value === 'home') {
      router.push({name:'setlists',params:{id:item.id}}).then(() => startService(item,id));
      return;
    }
    session.value = { setlistId:item.id, songId:id };
    router[route.query.song?'replace':'push']({name:'setlists',params:{id:item.id},query:{song:id}});
  }).catch(showError);
}
function stepSession(delta) {
  const target = lineup.value[sessionIndex.value+delta];
  if (target) startService(selectedSet.value,target.song_id);
}
function closeSession() {
  session.value = null;
  if (route.query.song) router.replace({name:'setlists',params:{id:routeId.value}});
}
watch(readingSong, () => { if (wakeOn.value) releaseWake(); });
async function releaseWake() {
  wakeOn.value = false;
  if (wakeLock) {
    const lock = wakeLock;
    wakeLock = null;
    await lock.release().catch(() => {});
  }
}
async function toggleWake() {
  if (wakeOn.value) return releaseWake();
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeOn.value = true;
    wakeLock.addEventListener('release', () => { wakeOn.value = false; }, { once:true });
  } catch { message('This device could not keep its screen on.'); }
}
function resizeLyrics(delta) {
  lyricSize.value = Math.max(14,Math.min(28,(lyricSize.value ?? (desktopScreen.value?22:20))+delta));
}

function showPopup(kind, title, anchor=null, item=null, type=view.value) {
  const rect = anchor?.getBoundingClientRect();
  popup.value = { kind, title, anchor:rect && {left:rect.left,right:rect.right,top:rect.top}, item, type };
}
function openSearch() { search.value=''; smallSearch.value=''; showPopup('search','Search'); }
function openSearchItem(type, item) {
  const query = search.value.trim();
  if (query) {
    searches.value = [query,...searches.value.filter(value => value!==query)].slice(0,6);
    writeSetting('hymn:searches:'+owner.value, searches.value);
  }
  popup.value = null;
  openItem(type,item);
}
function searchEnter(event) {
  if (!search.value.trim()) return;
  const song = searchResults.value.songs[0];
  const list = searchResults.value.setlists[0];
  if (song || list) { event.preventDefault(); openSearchItem(song?'songs':'setlists',(song || list).item); }
}
function emphasize(value) {
  const text = value ?? '';
  const query = smallSearch.value.trim();
  const index = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
  return index < 0 ? [text,'',''] : [text.slice(0,index),text.slice(index,index+query.length),text.slice(index+query.length)];
}
function openMenu(type, item, anchor) { if (item) showPopup('context',item.title ?? item.name,anchor,item,type); }
function deletePrompt(type,item) { showPopup('delete','Delete '+(item.title ?? item.name)+'?',null,item,type); }
function sharePayload(type,item) {
  if (type==='songs') return Promise.resolve([item.title,item.artist,...lyricSections(item).map(section => [section.label,section.text].filter(Boolean).join('\n'))].filter(Boolean).join('\n\n'));
  return fetchDetail(item.id).then(data => [item.name,[formatDate(item.date,true),item.service_time].filter(Boolean).join(' · '),
    ...data.songs.map((song,index) => (index+1)+'. '+song.title+(song.artist?' ('+song.artist+')':''))].filter(Boolean).join('\n'));
}
async function share(type,item) {
  try {
    const text = await sharePayload(type,item);
    showPopup('share','Share '+(item.title ?? item.name),null,text,type);
  } catch (error) { showError(error); }
}
async function copyShare(native=false) {
  const text = popup.value.item;
  if (native) {
    try {
      await navigator.share({text});
      popup.value = null;
      return;
    } catch(error) { if (error.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); popup.value = null; message('Text copied'); }
  catch { showPopup('copy','Copy text',null,text); }
}

async function finalizeEditor(result, type) {
  const key = draftKey.value;
  dirty.value = false;
  allowLeave = true;
  try { await router.replace({name:type,params:{id:result.id}}); }
  finally { allowLeave = false; }
  await nextTick();
  if (type==='songs') writeSetting(key,null);
}
async function createSong(payload) {
  const { song } = await request('/songs',{method:'POST',body:payload});
  songs.value = [...songs.value,song].sort(byTitle);
  cacheLibrary();
  return song;
}
async function createSongForSetlist(payload) {
  if (!working.value) return null;
  try { return await createSong(payload); }
  catch (error) { showError(error); return null; }
}
async function saveSong(payload) {
  if (!working.value || busy.value) return;
  const id = editorId.value;
  busy.value = true;
  dirtyError.value = '';
  try {
    const song = id ? (await request('/songs/'+id,{method:'PUT',body:payload})).song : await createSong(payload);
    if (id) {
      songs.value = songs.value.map(item => item.id===id?song:item).sort(byTitle);
      details.value = Object.fromEntries(Object.entries(details.value).map(([key,data]) => [key,{...data,songs:data.songs.map(row =>
        Number(row.song_id)===id?{...row,title:song.title,artist:song.artist,lyrics:song.lyrics}:row)}]));
      cacheLibrary();
    }
    await finalizeEditor(song,'songs');
    message('Song saved');
  } catch(error) { dirtyError.value = error.message; showError(error); }
  finally { busy.value = false; }
}
let editorBase = null;
watch([activeEditor, editorKey, setlistDetail], () => {
  if (!activeEditor.value || isSongView.value || !editorId.value) { editorBase=null; return; }
  if (setlistDetail.value && editorBase?.id !== editorId.value) editorBase={id:editorId.value, ids:lineup.value.map(song => Number(song.song_id))};
}, { flush:'sync' });
function updateSetSummary(data) {
  const summary = { ...data.schedule,song_count:data.songs.length };
  setlists.value = setlists.value.some(item => item.id===summary.id)
    ? setlists.value.map(item => item.id===summary.id?summary:item) : [...setlists.value,summary];
  details.value = { ...details.value,[summary.id]:data };
  cacheLibrary();
}
async function saveSetlist(payload) {
  if (!working.value || busy.value) return;
  const id = editorId.value;
  busy.value = true;
  dirtyError.value = '';
  const {song_ids,...fields} = payload;
  let writesStarted = false;
  try {
    if (!id) {
      const {schedule} = await request('/schedules',{method:'POST',body:payload});
      const localLineup = song_ids.map((song_id,index) => ({...songs.value.find(song=>Number(song.id)===song_id),song_id,position:index+1}));
      updateSetSummary({schedule,songs:localLineup});
      period.value = buckets.value.past.some(item=>item.id===schedule.id)?'past':'upcoming';
      await finalizeEditor(schedule,'setlists');
    } else {
      invalidateDetail(id);
      const latest = await fetchDetail(id,true);
      const current = latest.songs.map(song=>Number(song.song_id));
      if (JSON.stringify(current) !== JSON.stringify(editorBase?.ids)) {
        throw new Error('The saved lineup changed outside this editor. Reopen it to review the latest lineup before editing.');
      }
      const {schedule} = await request('/schedules/'+id,{method:'PUT',body:fields});
      writesStarted = true;
      await updateLineup(id,current,song_ids);
      invalidateDetail(id);
      const saved = await fetchDetail(id,true).catch(() => ({
        schedule,
        songs:song_ids.map((song_id,index) => ({...songs.value.find(song=>Number(song.id)===song_id),song_id,position:index+1})),
      }));
      updateSetSummary(saved);
      await finalizeEditor(schedule,'setlists');
    }
    message('Setlist saved');
  } catch(error) {
    if (id && writesStarted) {
      invalidateDetail(id);
      const saved = await fetchDetail(id,true).catch(() => null);
      if (saved) { updateSetSummary(saved); editorBase={id,ids:saved.songs.map(song=>Number(song.song_id))}; }
      dirtyError.value = 'Some changes may already be saved. Your lineup is still here. ' + error.message;
    } else dirtyError.value = error.message;
    showError(error);
  } finally { busy.value = false; }
}
async function duplicate(type,item) {
  if (!working.value || busy.value) return;
  popup.value = null;
  busy.value = true;
  try {
    if (type==='songs') {
      const song = await createSong({title:item.title+' (copy)',artist:item.artist ?? '',category:item.category,lyrics:lyricsForEditor(item)});
      openItem('songs',song);
    } else {
      const {songs:lineup,schedule:source} = await fetchDetail(item.id);
      const {schedule} = await request('/schedules',{method:'POST',body:{...source,name:source.name+' (copy)',status:'draft',song_ids:lineup.map(song=>Number(song.song_id))}});
      updateSetSummary({schedule,songs:lineup});
      openItem('setlists',schedule);
    }
    message('Copy created');
  } catch(error) { showError(error); }
  finally { busy.value = false; }
}
function queueDelete(type,item) {
  if (!working.value || deleteTimers.size) return;
  popup.value = null;
  const key = type+item.id;
  const set = pendingDelete.value[type];
  set.add(item.id);
  const cancel = () => { clearTimeout(deleteTimers.get(key)); deleteTimers.delete(key); set.delete(item.id); };
  message('Deleting '+(item.title ?? item.name),cancel,8000);
  const timer = setTimeout(async () => {
    deleteTimers.delete(key);
    if (!working.value) {
      set.delete(item.id);
      message('Deletion canceled. Reconnect to try again.');
      return;
    }
    try {
      await request('/'+(type==='songs'?'songs':'schedules')+'/'+item.id,{method:'DELETE'});
      if (type==='songs') {
        songs.value = songs.value.filter(song=>song.id!==item.id);
        for (const list of setlists.value) invalidateDetail(list.id);
        details.value = {};
        await loadLibrary();
      } else {
        setlists.value = setlists.value.filter(list=>list.id!==item.id);
        invalidateDetail(item.id);
        const copy = {...details.value};
        delete copy[item.id];
        details.value = copy;
        if (session.value?.setlistId===item.id) closeSession();
      }
      if (view.value===type && routeId.value===item.id) await router.replace({name:type});
      cacheLibrary();
    } catch (error) { showError(error); }
    finally { set.delete(item.id); }
  },8000);
  deleteTimers.set(key,timer);
}
async function attachSong(list,song) {
  if (!working.value || busy.value) return;
  busy.value = true;
  try {
    await request('/schedules/'+list.id+'/songs',{method:'POST',body:{song_id:song.id}});
    invalidateDetail(list.id);
    const saved = await fetchDetail(list.id,true);
    updateSetSummary(saved);
    popup.value=null;
    message('Added to '+list.name);
  } catch(error) { showError(error); }
  finally { busy.value=false; }
}
async function logout() {
  if (dirty.value && !confirm('Sign out with unsaved changes?')) return;
  try {
    await request('/auth/logout',{method:'POST'});
    dirty.value = false;
    clearSession();
    await router.replace({name:'login'});
  } catch(error) { showError(error); }
}
function clearSaved() {
  clearLibraryCache(owner.value);
  savedAt.value = null;
  if (offline.value) { songs.value=[]; setlists.value=[]; details.value={}; loadError.value='Saved data cleared. Reconnect to load your library.'; }
  popup.value=null;
  message('Saved data cleared');
}
function handleKeys(event) {
  if (!desktopScreen.value || popup.value || event.altKey || event.target?.closest?.('input,textarea,select,[contenteditable]')) return;
  const key = event.key.toLowerCase();
  if (key==='/' || key==='k' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); openSearch(); return; }
  if (event.metaKey || event.ctrlKey) return;
  if (key==='c' && working.value) showPopup('create','Create',railCreate.value);
  if (key==='r') recheck();
  if (key==='?') showPopup('shortcuts','Keyboard shortcuts');
  if (key==='escape' && mobileDetail.value && !busy.value) goBack();
  if (key==='[' && activeSessionSong.value) stepSession(-1);
  if (key===']' && activeSessionSong.value) stepSession(1);
  if (key==='e' && working.value && isLibrary.value && !activeEditor.value && !isSessionReading.value)
    (isSongView.value?chosenSong.value:selectedSet.value) && openEditor(view.value,'write',isSongView.value?chosenSong.value:selectedSet.value);
  if (['j','k','arrowdown','arrowup'].includes(key)) {
    const rail = event.target?.closest?.('.h-rail');
    const controls = [...(rail || listPanel.value || homePanel.value)?.querySelectorAll(rail?'button.h-nav-item,button.h-create':'[data-library-item]') || []];
    if (!controls.length) return;
    event.preventDefault();
    const idx = controls.indexOf(document.activeElement);
    const delta = key==='j'||key==='arrowdown'?1:-1;
    controls[Math.max(0,Math.min(controls.length-1,idx+delta))]?.focus();
  } else if (isSongView.value && hasLetters.value && event.target?.closest?.('.h-list') && /^\p{L}$/u.test(key)) {
    const match=letters.value.findIndex(entry=>entry.letter.toLocaleLowerCase()===key);
    if (match>=0) { event.preventDefault(); chooseLetter(match); }
  }
}
function jumpTo(index) {
  if (!listPanel.value) return;
  if (virtualRows.value.top || annotatedSongs.value.length>100) {
    listPanel.value.scrollTop = listOffset.value + index*rowSize.value;
    return;
  }
  const letter = annotatedSongs.value[index]?.letter;
  const header = [...listPanel.value.querySelectorAll('[data-letter]')].find(node=>node.dataset.letter===letter);
  if (header) listPanel.value.scrollTop += header.getBoundingClientRect().top - listPanel.value.getBoundingClientRect().top;
}
function chooseLetter(index) {
  jumpIndex.value = Math.max(0,Math.min(letters.value.length-1,index));
  if (letters.value[jumpIndex.value]) jumpTo(letters.value[jumpIndex.value].index);
}
function scrubLetters(event) {
  if (event.type==='pointerdown') event.currentTarget.setPointerCapture(event.pointerId);
  else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  chooseLetter(Math.floor((event.clientY-bounds.top)/bounds.height*letters.value.length));
}
function pullStart(event) {
  if (event.touches.length===1 && homePanel.value?.scrollTop===0) dragRefresh=event.touches[0].clientY;
}
function pullEnd(event) {
  if (dragRefresh!=null && event.changedTouches[0]?.clientY-dragRefresh>70 && homePanel.value?.scrollTop===0) recheck();
  dragRefresh=null;
}
function keyboardViewport() {
  const viewport = window.visualViewport;
  if (!app.value || !viewport) return;
  const field = document.activeElement?.matches('input,textarea,[contenteditable]');
  if (!desktopScreen.value && field && viewport.scale === 1 && innerHeight-viewport.height > 100) {
    app.value.style.setProperty('--viewport', Math.round(viewport.height) + 'px');
  } else app.value.style.removeProperty('--viewport');
}
function warnOnUnload(event) {
  if (!activeEditor.value || !dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  searches.value = readSetting('hymn:searches:'+owner.value,[]);
  themeMedia.addEventListener('change',setTheme);
  desktop.addEventListener('change',updateDesktop);
  window.addEventListener('resize',measureList);
  window.addEventListener('online',recheck);
  window.addEventListener('offline',handleOffline);
  window.addEventListener('keydown',handleKeys);
  window.addEventListener('beforeunload',warnOnUnload);
  window.visualViewport?.addEventListener('resize',keyboardViewport);
  document.addEventListener('visibilitychange',restoreForeground);
  loadLibrary().then(() => {
    if (!disposed) nextTick(measureList);
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.ready.then(registration => {
      registration.active?.postMessage({ type:'hymn-assets', urls: performance.getEntriesByType('resource').map(entry => entry.name) });
    }).catch(() => {});
  });
});
onBeforeUnmount(() => {
  disposed=true;
  releaseWake();
  themeMedia.removeEventListener('change',setTheme);
  desktop.removeEventListener('change',updateDesktop);
  window.removeEventListener('resize',measureList);
  window.removeEventListener('online',recheck);
  window.removeEventListener('offline',handleOffline);
  window.removeEventListener('keydown',handleKeys);
  window.removeEventListener('beforeunload',warnOnUnload);
  window.visualViewport?.removeEventListener('resize',keyboardViewport);
  document.removeEventListener('visibilitychange',restoreForeground);
  deleteTimers.forEach(clearTimeout);
  clearTimeout(queryTimer);
  clearTimeout(toastTimer);
});
</script>

<template>
  <div ref="app" class="h-app" :class="{ 'has-session': activeSessionSong && !activeEditor }">
    <aside class="h-rail" aria-label="Workspace">
      <button class="h-brand" type="button" aria-label="Hymn home" @click="cycleTab('home')"><img src="/Logo1.png" alt=""><span>Hymn</span></button>
      <nav aria-label="Workspace">
        <button v-for="tab in destinations.slice(0,3)" :key="tab.id" class="h-nav-item" type="button"
          :aria-current="view === tab.id ? 'page' : undefined" @click="cycleTab(tab.id)"><component :is="tab.icon" /><span>{{ tab.label }}</span></button>
      </nav>
      <button v-if="working" ref="railCreate" type="button" class="h-primary h-create" title="Create (C)" aria-label="Create"
        @click="showPopup('create','Create',$event.currentTarget)"><Plus /><span>Create</span></button>
      <button class="h-nav-item h-rail-me" type="button" :aria-current="view === 'me' ? 'page' : undefined" aria-label="Account"
        @click="showPopup('account','Account',$event.currentTarget)">
        <span v-if="initial" class="h-avatar">{{ initial }}</span><UserRound v-else /><span class="h-account-name">{{ user?.displayName || user?.username || 'Me' }}</span>
      </button>
    </aside>

    <header class="h-mobile-top" :class="{ 'is-hidden':headerHidden, 'is-reading':mobileDetail&&nearTop }">
      <template v-if="mobileDetail">
        <button type="button" aria-label="Back" class="h-icon" :disabled="busy" @click="goBack"><ChevronLeft /></button>
        <span class="h-top-title">{{ title }}</span>
        <div class="h-top-actions" v-if="!activeEditor && (readingSong || selectedSet)">
          <button v-if="working && !isSessionReading" class="h-ghost" type="button" @click="openEditor(view,'write',isSongView ? chosenSong : selectedSet)">Edit</button>
          <button type="button" class="h-icon" aria-label="More actions"
            @click="openMenu(readingSong ? 'songs' : 'setlists',readingSong || selectedSet,$event.currentTarget)"><Ellipsis /></button>
        </div>
      </template>
      <template v-else>
        <span class="h-wordmark">Hymn</span>
        <div class="h-top-actions">
          <button class="h-icon" type="button" aria-label="Search" @click="openSearch"><Search /></button>
          <button class="h-icon" type="button" aria-label="Me" @click="cycleTab('me')"><span v-if="initial" class="h-avatar">{{ initial }}</span><UserRound v-else /></button>
        </div>
      </template>
    </header>
    <header class="h-desktop-top">
      <button class="h-search h-search-trigger" type="button" title="Search (/ or Ctrl / Cmd + K)" @click="openSearch"><Search /> Search songs and setlists <kbd>/</kbd></button>
      <button class="h-icon" type="button" aria-label="Refresh" title="Refresh (R)" :disabled="loading" @click="recheck"><RefreshCw /></button>
      <button class="h-icon" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" @click="showPopup('shortcuts','Keyboard shortcuts')"><Keyboard /></button>
    </header>

    <main class="h-workspace" :class="{ 'h-workspace-library': isLibrary, 'h-workspace-detail':mobileDetail, 'h-workspace-offline':offline }">
      <p v-if="offline" class="h-offline" role="status">Offline · Showing saved data <span v-if="lastUpdated">· {{ new Date(lastUpdated).toLocaleString() }}</span></p>
      <div v-if="loading && !lastUpdated" class="h-panel h-state" role="status"><p>Loading your library…</p><div v-for="index in 5" :key="index" class="h-skeleton"></div></div>
      <div v-else-if="loadError" class="h-panel h-state" role="alert"><p>{{ loadError }}</p><button class="h-secondary" type="button" @click="recheck">Try again</button></div>

      <section v-else-if="view === 'home'" ref="homePanel" class="h-panel h-home" aria-label="Home"
        @scroll.passive="scrollPanel" @touchstart.passive="pullStart" @touchend.passive="pullEnd" @touchcancel="dragRefresh = null">
        <div class="h-home-layout" :class="{ 'h-home-with-service': nextService }">
          <aside v-if="nextService" class="h-home-side">
            <section>
              <div class="h-actions h-upcoming-head"><h2>Upcoming</h2>
                <div v-if="buckets.upcoming.length > 1" class="h-upcoming-controls">
                  <button class="h-icon" type="button" aria-label="Previous services" @click="upcomingRail?.scrollBy({left:-116,behavior:'smooth'})"><ChevronLeft /></button>
                  <button class="h-icon" type="button" aria-label="More services" @click="upcomingRail?.scrollBy({left:116,behavior:'smooth'})"><ChevronRight /></button>
                </div>
              </div>
              <div ref="upcomingRail" class="h-upcoming" aria-label="Upcoming services" tabindex="0"
                @keydown.left.prevent="upcomingRail?.scrollBy({left:-116})" @keydown.right.prevent="upcomingRail?.scrollBy({left:116})">
                <button v-for="item in buckets.upcoming.slice(0,6)" :key="item.id" type="button" @click="openItem('setlists',item)">
                  <span class="h-date"><strong>{{ dateTile(item.date).day }}</strong>{{ dateTile(item.date).month }}</span><span>{{ item.name }}</span>
                </button>
              </div>
            </section>
            <section class="h-service">
              <p class="h-meta">Next service</p>
              <h2>{{ nextService.name }}</h2>
              <p class="h-meta">{{ formatDate(nextService.date,true) }}<template v-if="nextService.service_time"> · {{ nextService.service_time }}</template></p>
              <p class="h-meta">{{ songCount(nextService.song_count ?? 0) }}</p>
              <ol v-if="nextSongs.length"><li v-for="item in nextSongs" :key="item.song_id">{{ item.title }}</li></ol>
              <button v-if="nextService.song_count && (!offline || nextSongs.length)" class="h-primary" type="button" @click="startService(nextService)"><BookOpen /> Open songs</button>
              <button v-else class="h-secondary" type="button" @click="openItem('setlists',nextService)">View setlist</button>
            </section>
          </aside>
          <section class="h-feed">
            <div v-if="loading" class="h-refresh" role="status"><RefreshCw /> Refreshing…</div>
            <template v-if="recentSongs.length">
              <h1>{{ hasEdited ? 'Recently edited' : 'Recent songs' }}</h1>
              <LibraryRows :items="recentSongs" kind="songs" :deletable="working"
                @open="openItem('songs',$event)" @menu="(item,anchor) => openMenu('songs',item,anchor)" @remove="deletePrompt('songs',$event)" />
            </template>
            <div v-else class="h-state">
              <p>Your library is ready for its first song.</p>
              <button v-if="working" class="h-primary" type="button" @click="showPopup('create','Create',$event.currentTarget)"><Plus /> Create</button>
            </div>
            <aside v-if="showInstallTip" class="h-service h-install">
              <div class="h-actions"><h2>Add Hymn to your Home Screen</h2>
                <button class="h-icon h-end" type="button" aria-label="Dismiss install tip" @click="installDismissed=true; writeSetting('hymn:install-tip-dismissed',true)"><X /></button>
              </div>
              <p class="h-meta">{{ ios ? 'In Safari, tap Share, then Add to Home Screen.' : 'In Chrome, open the browser menu and choose Add to Home screen.' }}</p>
            </aside>
          </section>
        </div>
      </section>

      <template v-else-if="isLibrary">
        <section ref="listPanel" class="h-panel h-list" :aria-label="isSongView ? 'Songs' : 'Setlists'" @scroll.passive="scrollPanel">
          <h1>{{ isSongView ? 'Songs' : 'Setlists' }}</h1>
          <template v-if="isSongView">
            <button class="h-search h-search-trigger" type="button" @click="openSearch"><Search /> Search songs</button>
            <div class="h-list-tools">
              <div class="h-filters" aria-label="Filter songs">
                <button v-for="[key,name] in [['all','All'], ...(hasEdited ? [['edited','Recently edited']] : []), ...(membership.size || !offline && activeSetlists.some(item=>item.song_count>0) ? [['setlist','In a setlist']] : []), ...(hasArtist ? [['artist','Has artist']] : [])]"
                  :key="key" class="h-chip" type="button" :aria-pressed="filter===key" @click="setFilter(key)"><Check v-if="filter===key" />{{ name }}</button>
              </div>
              <button type="button" class="h-icon" aria-label="Sort songs" title="Sort songs" @click="showPopup('sort','Sort songs',$event.currentTarget)"><ArrowDownAZ /></button>
            </div>
          </template>
          <div v-else class="h-period" aria-label="Setlist dates">
            <button v-for="item in ['upcoming','past']" :key="item" type="button" :aria-pressed="period === item" @click="period=item">{{ item === 'upcoming' ? 'Upcoming' : 'Past' }}</button>
          </div>
          <p v-if="isSongView && filter==='setlist' && (membershipLoading || membershipIncomplete || offline)" class="h-meta" role="status">
            {{ membershipLoading ? 'Loading setlist membership…' : 'Showing membership from available setlists.' }}
          </p>
          <div class="h-list-rows" :class="{ 'with-letters':isSongView&&hasLetters, 'is-past':!isSongView&&period==='past' }" ref="rowsStart">
            <p v-if="isSongView && hasLetters && songRows.length>100" class="h-letter h-virtual-letter" aria-hidden="true">{{ virtualLetter }}</p>
            <div v-if="virtualRows.top" aria-hidden="true" :style="{height:virtualRows.top+'px'}"></div>
            <LibraryRows :items="virtualRows.rows" :kind="view" :selected-id="isSongView ? chosenSong?.id : selectedSet?.id"
              :letter-headers="isSongView&&hasLetters&&songRows.length<=100" :deletable="working"
              @open="openItem(view,$event)" @menu="(item,anchor) => openMenu(view,item,anchor)" @remove="deletePrompt(view,$event)" />
            <div v-if="virtualRows.bottom" aria-hidden="true" :style="{height:virtualRows.bottom+'px'}"></div>
            <p v-if="!virtualRows.rows.length && !membershipLoading" class="h-meta">{{ isSongView ? 'No songs found.' : period === 'past' ? 'No past setlists.' : 'No upcoming setlists.' }}</p>
          </div>
          <div v-if="isSongView && hasLetters && letters.length>1" class="h-letters" aria-label="Jump by letter" role="slider" tabindex="0" aria-orientation="vertical"
            :aria-valuemin="0" :aria-valuemax="letters.length-1" :aria-valuenow="Math.min(jumpIndex,letters.length-1)"
            :aria-valuetext="letters[Math.min(jumpIndex,letters.length-1)]?.letter" @pointerdown="scrubLetters" @pointermove="scrubLetters"
            @keydown.up.prevent="chooseLetter(jumpIndex-1)" @keydown.down.prevent="chooseLetter(jumpIndex+1)"
            @keydown.home.prevent="chooseLetter(0)" @keydown.end.prevent="chooseLetter(letters.length-1)">
            <span v-for="entry in letters" :key="entry.index" aria-hidden="true">{{ entry.letter }}</span>
          </div>
        </section>

        <div class="h-detail-shell">
          <section ref="detailPanel" class="h-panel h-detail" @scroll.passive="scrollPanel"
            :style="lyricSize ? {'--reading-size':lyricSize+'px'} : undefined">
            <div class="h-reading">
              <template v-if="activeEditor">
                <p v-if="dirtyError" class="h-danger" role="alert">{{ dirtyError }}</p>
                <p v-if="dirty" class="h-meta" role="status">Unsaved changes</p>
                <SongEditor v-if="isSongView && (!editorId || chosenSong)" :key="editorKey" :song="editorId ? chosenSong : null" :flow="route.query.flow"
                  :busy="busy" :can-save="working" :draft-key="draftKey" @dirty="dirty=$event" @save="saveSong" @cancel="goBack" />
                <SetlistEditor v-else-if="!isSongView && (!editorId || setlistDetail)" :key="editorKey" :setlist="editorId ? setlistDetail.schedule : null"
                  :lineup="editorId ? lineup : emptyRows" :songs="activeSongList" :flow="route.query.flow" :busy="busy" :can-save="working"
                  :draft-key="draftKey" :create-song="createSongForSetlist" @dirty="dirty=$event" @save="saveSetlist" @cancel="goBack" />
                <p v-else class="h-meta">{{ isSongView ? 'This song is unavailable.' : detailErrors[routeId] || 'Loading setlist…' }}</p>
              </template>

              <template v-else-if="readingSong">
                <div class="h-reading-tools">
                  <button class="h-ghost" type="button" @click="showPopup('display','Display',$event.currentTarget)">Display</button>
                  <button class="h-icon" type="button" aria-label="Share" title="Share" @click="share('songs',readingSong)"><Share2 /></button>
                  <button v-if="working && !isSessionReading" class="h-secondary" type="button" title="Edit song (E)" @click="openEditor('songs','write',readingSong)">Edit</button>
                  <button class="h-icon" type="button" aria-label="More song actions" @click="openMenu('songs',readingSong,$event.currentTarget)"><Ellipsis /></button>
                </div>
                <header class="h-reading-header">
                  <div><h1 :class="{ 'h-mobile-sr': mobileDetail }">{{ readingSong.title }}</h1>
                    <p v-if="readingSong.artist" class="h-meta">{{ readingSong.artist }}</p>
                    <span v-if="lyrics.length" class="h-chip">{{ pluralCount(lyrics.length,'section') }}</span>
                  </div>
                </header>
                <section v-for="(section,index) in lyrics" :key="index" class="h-lyric-section">
                  <h2 v-if="section.label" class="h-meta">{{ section.label }}</h2><p>{{ section.text }}</p>
                </section>
                <p v-if="!lyrics.length" class="h-meta">No lyrics added yet.</p>
                <section v-if="songMembership.length && !isSessionReading" class="h-used">
                  <h2>Used in</h2><LibraryRows :items="songMembership.map(item=>({item}))" kind="setlists" @open="openItem('setlists',$event)"
                    @menu="(item,anchor) => openMenu('setlists',item,anchor)" />
                </section>
              </template>

              <template v-else-if="!isSongView && selectedSet">
                <div class="h-reading-tools">
                  <button class="h-icon" type="button" aria-label="Share" title="Share" @click="share('setlists',selectedSet)"><Share2 /></button>
                  <button v-if="working" class="h-secondary" type="button" title="Edit setlist (E)" @click="openEditor('setlists','write',selectedSet)">Edit</button>
                  <button type="button" class="h-icon" aria-label="More setlist actions" @click="openMenu('setlists',selectedSet,$event.currentTarget)"><Ellipsis /></button>
                </div>
                <header class="h-reading-header">
                  <span v-if="dateTile(selectedSet.date)" class="h-date h-date-large"><strong>{{ dateTile(selectedSet.date).day }}</strong>{{ dateTile(selectedSet.date).month }}</span>
                  <div><h1 :class="{ 'h-mobile-sr': mobileDetail }">{{ selectedSet.name }}</h1>
                    <p v-if="selectedSet.date || selectedSet.service_time" class="h-meta">{{ [formatDate(selectedSet.date,true),selectedSet.service_time].filter(Boolean).join(' · ') }}</p>
                    <span v-if="selectedSet.status" class="h-chip h-status-text">{{ selectedSet.status }}</span>
                  </div>
                </header>
                <p v-if="selectedSet.description" class="h-description">{{ selectedSet.description }}</p>
                <button v-if="lineup.length" class="h-primary" type="button" @click="startService(selectedSet)"><BookOpen /> Open songs</button>
                <h2 class="h-lineup-title">Lineup</h2>
                <ol v-if="lineup.length" class="h-lineup">
                  <li v-for="(song,index) in lineup" :key="song.song_id">
                    <button class="h-row-main" type="button" @click="startService(selectedSet,song.song_id)">
                      <span class="h-number">{{ index+1 }}</span><span class="h-row-copy"><strong>{{ song.title }}</strong><small v-if="song.artist">{{ song.artist }}</small></span>
                    </button>
                  </li>
                </ol>
                <div v-else-if="detailErrors[selectedSet.id]" class="h-actions">
                  <p class="h-meta">{{ detailErrors[selectedSet.id] }}</p><button v-if="!offline" class="h-secondary" type="button" @click="fetchDetail(selectedSet.id,true).catch(showError)">Retry</button>
                </div>
                <p v-else class="h-meta">{{ setlistDetail ? 'No songs added yet.' : 'Loading lineup…' }}</p>
              </template>

              <div v-else class="h-state">
                <p>{{ routeId ? 'This item is unavailable.' : isSongView ? 'Add your first song.' : 'No setlists in this view yet.' }}</p>
                <button v-if="working" class="h-primary" type="button" @click="openEditor(view)">{{ isSongView ? 'Write a song' : 'New setlist' }}</button>
              </div>
            </div>
          </section>
          <section v-if="activeSessionSong && !activeEditor" class="h-session" aria-label="Setlist session">
            <div class="h-track"><p class="h-meta">Song {{ sessionIndex+1 }} of {{ lineup.length }}</p><strong>{{ activeSessionSong.title }}</strong></div>
            <button class="h-icon" type="button" aria-label="Previous song" title="Previous song ([)" :disabled="sessionIndex<1" @click="stepSession(-1)"><ChevronLeft /></button>
            <button class="h-icon" type="button" aria-label="Next song" title="Next song (])" :disabled="sessionIndex>=lineup.length-1" @click="stepSession(1)"><ChevronRight /></button>
            <button class="h-icon" type="button" aria-label="Close session" @click="closeSession"><X /></button>
          </section>
        </div>
      </template>

      <section v-else ref="detailPanel" class="h-panel h-me" @scroll.passive="scrollPanel">
        <div class="h-reading">
          <div class="h-avatar h-avatar-large"><span v-if="initial">{{ initial }}</span><UserRound v-else /></div>
          <h1>{{ user?.displayName || user?.username || 'Me' }}</h1>
          <p class="h-meta">{{ songCount(activeSongList.length) }} · {{ pluralCount(activeSetlists.length,'setlist') }}</p>
          <div class="h-me-section"><h2>Appearance</h2><div class="h-segmented" aria-label="Theme">
            <button v-for="choice in ['system','light','dark']" :key="choice" type="button" :aria-pressed="theme===choice" @click="theme=choice">{{ choice[0].toUpperCase()+choice.slice(1) }}</button>
          </div></div>
          <div v-if="savedAt" class="h-me-section">
            <h2>Offline data</h2><p class="h-meta">Saved {{ new Date(savedAt).toLocaleString() }}</p>
            <button class="h-secondary" type="button" @click="showPopup('clear','Clear saved data?')">Clear saved data</button>
          </div>
          <div class="h-me-section"><button class="h-secondary" type="button" :disabled="offline" @click="logout">Sign out</button>
            <p v-if="offline" class="h-meta">Reconnect to sign out.</p></div>
        </div>
      </section>
    </main>

    <nav class="h-bottom" aria-label="Workspace">
      <template v-for="tab in destinations" :key="tab.id">
        <button v-if="tab.id==='setlists' && working" type="button" class="h-bottom-create" @click="showPopup('create','Create',$event.currentTarget)"><span><Plus /></span>Create</button>
        <button type="button" :aria-current="view===tab.id?'page':undefined" @click="cycleTab(tab.id)"><span><component :is="tab.icon" /></span>{{ tab.label }}</button>
      </template>
    </nav>

    <WorkspaceDialog v-if="popup" :key="popup.kind" :title="popup.title" :kind="popup.kind" :anchor="popup.anchor" @close="popup=null">
      <div v-if="popup.kind==='create'" class="h-menu">
        <button v-for="action in createActions" :key="action.label" type="button" data-menu-item @click="popup=null; openEditor(action.type,action.mode)">
          <component :is="action.icon" /><span><strong>{{ action.label }}</strong><small>{{ action.hint }}</small></span>
        </button>
      </div>
      <template v-else-if="popup.kind==='search'">
        <label class="h-search"><Search /><input v-model="search" type="search" placeholder="Search songs and setlists" aria-label="Search songs and setlists"
          autocomplete="off" data-initial-focus @keydown.enter="searchEnter"></label>
        <div v-if="!search.trim() && searches.length" class="h-menu h-search-results">
          <div class="h-actions"><h3>Recent searches</h3><button class="h-ghost h-end" type="button" @click="searches=[]; writeSetting('hymn:searches:'+owner,null)">Clear</button></div>
          <button v-for="entry in searches" :key="entry" type="button" data-menu-item @click="search=entry">{{ entry }}</button>
        </div>
        <div v-else-if="smallSearch.trim()" class="h-menu h-search-results" aria-live="polite">
          <template v-for="type in ['songs','setlists']" :key="type">
            <h3 v-if="searchResults[type].length">{{ type === 'songs' ? 'Songs' : 'Setlists' }}</h3>
            <button v-for="{item,excerpt} in searchResults[type]" :key="item.id" type="button" data-menu-item @click="openSearchItem(type,item)">
              <span class="h-row-copy">
                <strong><template v-for="(part,index) in emphasize(item.title ?? item.name)" :key="index"><mark v-if="index===1 && part">{{ part }}</mark><template v-else>{{ part }}</template></template></strong>
                <small v-if="excerpt"><template v-for="(part,index) in emphasize(excerpt)" :key="index"><mark v-if="index===1 && part">{{ part }}</mark><template v-else>{{ part }}</template></template></small>
              </span>
            </button>
          </template>
          <p v-if="!searchResults.songs.length&&!searchResults.setlists.length" class="h-meta">No songs or setlists found.</p>
        </div>
      </template>
      <div v-else-if="popup.kind==='context'" class="h-menu">
        <button v-if="popup.type==='songs'" type="button" data-menu-item @click="openItem('songs',{id:popup.item.id ?? popup.item.song_id}); popup=null"><BookOpen /> Open</button>
        <button v-if="popup.type==='songs' && readingSong" type="button" data-menu-item @click="showPopup('display','Display',$event.currentTarget)"><Type /> Display</button>
        <button v-if="working && popup.type==='songs' && activeSetlists.length" type="button" data-menu-item @click="showPopup('attach','Add to setlist',null,popup.item)"><ListPlus /> Add to setlist</button>
        <button v-if="working && popup.type==='setlists'" type="button" data-menu-item @click="openEditor('setlists','write',popup.item); popup=null"><PenLine /> Edit</button>
        <button v-if="working" type="button" data-menu-item @click="duplicate(popup.type,popup.item)"><Copy /> Duplicate</button>
        <button type="button" data-menu-item @click="share(popup.type,popup.item)"><Share2 /> Share</button>
        <button v-if="working && popup.item.id" type="button" data-menu-item class="h-danger" @click="deletePrompt(popup.type,popup.item)"><Trash2 /> Delete</button>
      </div>
      <div v-else-if="popup.kind==='sort'" class="h-menu">
        <button type="button" data-menu-item @click="sort='title';popup=null">Title, A to Z <Check v-if="sort==='title'" /></button>
        <button v-if="hasEdited" type="button" data-menu-item @click="sort='edited';popup=null">Recently edited <Check v-if="sort==='edited'" /></button>
      </div>
      <div v-else-if="popup.kind==='account'" class="h-menu">
        <button type="button" data-menu-item @click="popup=null; cycleTab('me')"><UserRound /> Me</button>
        <button type="button" data-menu-item :disabled="offline" @click="logout">Sign out</button>
      </div>
      <div v-else-if="popup.kind==='display'">
        <p class="h-meta">Lyric size</p><div class="h-segmented">
          <button type="button" aria-label="Smaller lyrics" @click="resizeLyrics(-2)">A−</button>
          <button type="button" aria-label="Larger lyrics" @click="resizeLyrics(2)">A+</button>
        </div>
        <button v-if="hasWake" class="h-secondary h-display-wake" type="button" role="switch" :aria-checked="wakeOn" @click="toggleWake">Keep screen on · {{ wakeOn ? 'On' : 'Off' }}</button>
      </div>
      <div v-else-if="popup.kind==='attach'" class="h-menu">
        <button v-for="item in activeSetlists" :key="item.id" type="button" :disabled="busy" data-menu-item @click="attachSong(item,popup.item)"><ListMusic />{{ item.name }}</button>
      </div>
      <div v-else-if="popup.kind==='share'" class="h-actions">
        <button class="h-primary" type="button" @click="copyShare()"><Copy /> Copy text</button><button v-if="hasShare" class="h-secondary" type="button" @click="copyShare(true)"><Share2 /> Share…</button>
      </div>
      <label v-else-if="popup.kind==='copy'" class="h-field">Select and copy the text<textarea :value="popup.item" readonly rows="7"></textarea></label>
      <div v-else-if="popup.kind==='delete' || popup.kind==='clear'">
        <p class="h-meta" v-if="popup.kind==='delete'">{{ popup.type === 'songs' ? 'This song will also be removed from setlists that use it.' : 'The setlist and its lineup will be deleted.' }}</p>
        <p class="h-meta" v-else>Reconnect to download a fresh copy of your library.</p>
        <div class="h-actions h-confirm">
          <button class="h-danger-button" type="button" @click="popup.kind==='delete' ? queueDelete(popup.type,popup.item) : clearSaved()">{{ popup.kind==='delete'?'Delete':'Clear saved data' }}</button>
          <button class="h-secondary" type="button" data-initial-focus @click="popup=null">Cancel</button>
        </div>
      </div>
      <dl v-else-if="popup.kind==='shortcuts'" class="h-shortcuts">
        <dt>Search</dt><dd>/ or Ctrl / Cmd + K</dd><dt>Create</dt><dd>C</dd><dt>Refresh</dt><dd>R</dd><dt>Move in a list</dt><dd>↑ / ↓ or J / K</dd>
        <dt>Open</dt><dd>Enter</dd><dt>Edit</dt><dd>E</dd><dt>Previous / next song</dt><dd>[ / ]</dd><dt>Close or go back</dt><dd>Esc</dd>
      </dl>
    </WorkspaceDialog>

    <div v-if="toast" class="h-toast" role="status">{{ toast.text }}
      <button v-if="toast.undo" class="h-ghost" type="button" @click="toast.undo(); message('Restored')">Undo</button>
    </div>
  </div>
</template>
