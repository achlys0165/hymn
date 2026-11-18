<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowDown, ArrowUp, ClipboardList, GripVertical, Plus, Search, X } from 'lucide-vue-next';
import { matchSetlist } from '../../shared/setlistMatcher.js';
import { moveScheduleSong } from '../../shared/scheduleOrder.js';
import { formatDate, nextSunday, parseDate, serviceTimeFromInput, serviceTimeInput } from '../utils/workspace.js';
import WorkspaceDialog from './WorkspaceDialog.vue';

const SongEditor = defineAsyncComponent(() => import('./SongEditor.vue'));
const props = defineProps({
  setlist: Object, lineup: { type: Array, default: () => [] }, songs: Array,
  flow: String, busy: Boolean, canSave: Boolean, createSong: Function, draftKey: String,
});
const emit = defineEmits(['save', 'cancel', 'dirty']);
const defaultDate = nextSunday();
const initial = {
  name: props.setlist?.name ?? formatDate(defaultDate),
  date: props.setlist ? props.setlist.date ?? '' : defaultDate,
  description: props.setlist?.description ?? '',
  status: props.setlist?.status ?? 'draft',
  service_time: props.setlist?.service_time ?? '',
};
const draft = ref({ ...initial });
const ids = ref(props.lineup.map(song => Number(song.song_id)));
const startIds = JSON.stringify(ids.value);
const songMap = computed(() => new Map(props.songs.map(song => [Number(song.id), song])));
const lineupMap = new Map(props.lineup.map(song => [Number(song.song_id), song]));
const titles = id => songMap.value.get(id) || lineupMap.get(id);
const query = ref('');
const limit = ref(60);
const picker = ref(props.flow === 'paste' ? 'paste' : '');
const text = ref('');
const matches = ref([]);
const method = ref('append');
const missing = ref(null);
const songBusy = ref(false);
const pasteDirty = ref(false);
const undo = ref(null);
const timeCapability = matchMedia('(pointer:coarse)');
const coarse = ref(timeCapability.matches);
const updatePointer = () => { coarse.value = timeCapability.matches; };
let matchTimer;
let undoTimer;
let dragging;
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return props.songs.filter(song => [song.title, song.artist].some(value => value?.toLocaleLowerCase().includes(needle)));
});
const chosen = computed(() => [...new Set(matches.value.filter(entry => entry.status === 'matched').map(entry => Number(entry.song.id)))]);
const valid = computed(() => draft.value.name.trim() && (!draft.value.date || parseDate(draft.value.date)));
const nativeTime = computed(() => coarse.value && (!draft.value.service_time || serviceTimeInput(draft.value.service_time)));

watch([draft, ids, pasteDirty], () => {
  emit('dirty', JSON.stringify(draft.value) !== JSON.stringify(initial) || JSON.stringify(ids.value) !== startIds || pasteDirty.value);
}, { deep: true, flush: 'sync' });
watch(query, () => { limit.value = 60; });
watch(text, value => {
  clearTimeout(matchTimer);
  matches.value = [];
  pasteDirty.value = Boolean(value.trim());
  matchTimer = setTimeout(() => { matches.value = matchSetlist(value, props.songs); }, 150);
});

function choose(entry, song) {
  entry.song = song;
  entry.status = 'matched';
}
function applyPaste() {
  if (!chosen.value.length) return;
  const before = [...ids.value];
  ids.value = method.value === 'replace' ? chosen.value : [...new Set([...before, ...chosen.value])];
  picker.value = '';
  text.value = '';
  setUndo('Lineup updated', before, 10000);
}
function setUndo(message, before, delay) {
  clearTimeout(undoTimer);
  undo.value = { message, before };
  undoTimer = setTimeout(() => { undo.value = null; }, delay);
}
function addSong(id) {
  id = Number(id);
  if (!ids.value.includes(id)) ids.value = [...ids.value, id];
}
function removeSong(id) {
  const before = [...ids.value];
  ids.value = ids.value.filter(songId => songId !== id);
  setUndo('Removed ' + (titles(id)?.title ?? 'song'), before, 8000);
}
function move(index, offset) { ids.value = moveScheduleSong(ids.value, index, offset); }
function beginDrag(event, id) {
  dragging = id;
  if (event.pointerType === 'touch') event.currentTarget.setPointerCapture(event.pointerId);
}
function finishDrag(target) {
  const targetId = Number(target?.closest('[data-lineup-id]')?.dataset.lineupId);
  if (dragging != null && ids.value.includes(targetId) && dragging !== targetId) {
    const next = [...ids.value];
    const from = next.indexOf(dragging);
    const to = next.indexOf(targetId);
    next.splice(from, 1);
    next.splice(to, 0, dragging);
    ids.value = next;
  }
  dragging = null;
}
function finishTouchDrag(event) {
  if (event.pointerType === 'touch') finishDrag(document.elementFromPoint(event.clientX,event.clientY));
}
async function saveMissing(payload) {
  songBusy.value = true;
  try {
    const song = await props.createSong(payload);
    if (song) { choose(missing.value, song); missing.value = null; picker.value = 'paste'; }
  } finally {
    songBusy.value = false;
  }
}
function save() {
  if (!valid.value || !props.canSave || props.busy) return;
  emit('save', { ...draft.value, song_ids: ids.value });
}
onMounted(() => timeCapability.addEventListener('change', updatePointer));
onBeforeUnmount(() => {
  clearTimeout(matchTimer);
  clearTimeout(undoTimer);
  timeCapability.removeEventListener('change', updatePointer);
});
</script>

<template>
  <SongEditor v-if="missing" :song="{ title: missing.title, artist: missing.artist }" :busy="songBusy"
    :can-save="canSave" :draft-key="draftKey + ':missing'" @save="saveMissing" @cancel="missing = null; picker = 'paste'" />
  <template v-else>
    <form class="h-editor" @submit.prevent="save">
      <h1>{{ setlist ? 'Edit setlist' : 'New setlist' }}</h1>
      <label class="h-field">Name<input v-model="draft.name" required maxlength="300" autocapitalize="words"></label>
      <div class="h-field-pair">
        <label class="h-field">Date<input v-model="draft.date" type="date"></label>
        <label class="h-field">Service time <span class="h-meta">Optional</span>
          <input v-if="nativeTime" type="time" step="900" :value="serviceTimeInput(draft.service_time)"
            @change="draft.service_time = serviceTimeFromInput($event.target.value, draft.service_time)">
          <input v-else v-model="draft.service_time" placeholder="e.g. 9:00 AM">
        </label>
      </div>
      <label class="h-field">Status
        <select v-model="draft.status"><option value="draft">Draft</option><option value="ready">Ready</option><option value="live">Live</option><option value="archived">Archived</option></select>
      </label>
      <label class="h-field">Description <span class="h-meta">Optional</span><textarea v-model="draft.description" rows="2"></textarea></label>
      <div class="h-actions h-editor-tools">
        <h2>Lineup</h2>
        <button class="h-secondary h-end" type="button" @click="picker = 'songs'"><Plus /> Add songs</button>
        <button class="h-ghost" type="button" @click="picker = 'paste'"><ClipboardList /> Paste setlist</button>
      </div>
      <p v-if="!ids.length" class="h-meta">Add songs to build your lineup.</p>
      <ol v-else class="h-lineup">
        <li v-for="(id, index) in ids" :key="id" :data-lineup-id="id" @dragover.prevent @drop.prevent="finishDrag($event.currentTarget)">
          <button class="h-icon h-grab" type="button" draggable="true" :aria-label="'Reorder ' + titles(id)?.title"
            @pointerdown="beginDrag($event,id)" @pointercancel="dragging = null" @dragstart="$event.dataTransfer.setData('text/plain',String(id)); dragging = id"
            @dragend="dragging = null" @pointerup="finishTouchDrag"
            @keydown.alt.up.prevent="move(index,-1)" @keydown.alt.down.prevent="move(index,1)"><GripVertical /></button>
          <span class="h-number">{{ index+1 }}</span>
          <span class="h-row-copy"><strong>{{ titles(id)?.title ?? 'Unavailable song' }}</strong><small v-if="titles(id)?.artist">{{ titles(id).artist }}</small></span>
          <button class="h-icon" type="button" aria-label="Move song up" :disabled="index === 0" @click="move(index,-1)"><ArrowUp /></button>
          <button class="h-icon" type="button" aria-label="Move song down" :disabled="index === ids.length-1" @click="move(index,1)"><ArrowDown /></button>
          <button class="h-icon h-danger" type="button" aria-label="Remove song" @click="removeSong(id)"><X /></button>
        </li>
      </ol>
      <div v-if="undo" class="h-inline-undo" role="status">{{ undo.message }} <button type="button" class="h-ghost" @click="ids = undo.before; undo = null">Undo</button></div>
      <footer class="h-editor-footer">
        <button class="h-primary" :disabled="!valid || !canSave || busy">{{ busy ? 'Saving…' : 'Save setlist' }}</button>
        <button class="h-secondary" type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
      </footer>
    </form>
    <WorkspaceDialog v-if="picker === 'songs'" key="song-picker" title="Add songs" kind="picker" @close="picker = ''">
      <label class="h-search"><Search /><input v-model="query" type="search" aria-label="Search songs to add" placeholder="Search songs"></label>
      <div class="h-menu">
        <button v-for="song in filtered.slice(0,limit)" :key="song.id" class="h-picker-row" type="button" :disabled="ids.includes(Number(song.id))" @click="addSong(song.id)">
          <span class="h-row-copy"><strong>{{ song.title }}</strong><small v-if="song.artist">{{ song.artist }}</small></span><span>{{ ids.includes(Number(song.id)) ? 'Added' : 'Add' }}</span>
        </button>
      </div>
      <button v-if="filtered.length > limit" class="h-ghost" type="button" @click="limit += 60">Show more songs</button>
      <p v-if="!filtered.length" class="h-meta">No songs found.</p>
      <template #footer><button type="button" class="h-primary" @click="picker = ''">Done</button></template>
    </WorkspaceDialog>
    <WorkspaceDialog v-if="picker === 'paste'" key="paste-picker" title="Paste setlist" kind="paste" @close="picker = ''">
      <label class="h-field">One song per line<textarea v-model="text" rows="5" placeholder="Paste song titles" spellcheck="false"></textarea></label>
      <ul v-if="matches.length" class="h-paste-results" aria-label="Matching preview">
        <li v-for="entry in matches" :key="entry.id">
          <strong>{{ entry.title }}</strong>
          <p class="h-meta">{{ entry.status === 'matched' ? 'Matched to ' + entry.song.title : entry.status === 'duplicate' ? 'Already included' : entry.status === 'suggested' ? 'Choose a match' : 'Song not found' }}</p>
          <div v-if="['suggested','missing'].includes(entry.status)" class="h-actions">
            <select v-if="songs.length" class="h-input" :aria-label="'Match ' + entry.title" value=""
              @change="choose(entry, songMap.get(Number($event.target.value)))">
              <option value="" disabled>Choose a song</option>
              <optgroup v-if="entry.suggestions.length" label="Suggested"><option v-for="suggestion in entry.suggestions" :key="suggestion.song.id" :value="suggestion.song.id">{{ suggestion.song.title }}</option></optgroup>
              <optgroup label="Library"><option v-for="song in songs" :key="song.id" :value="song.id">{{ song.title }}</option></optgroup>
            </select>
            <button v-if="entry.status === 'missing' && canSave" class="h-ghost" type="button" @click="picker = ''; missing = entry">Create song</button>
          </div>
        </li>
      </ul>
      <fieldset v-if="matches.length" class="h-paste-method">
        <legend>Apply to lineup</legend>
        <label><input v-model="method" type="radio" value="append"> Add to lineup</label>
        <label><input v-model="method" type="radio" value="replace"> Replace lineup</label>
      </fieldset>
      <template #footer><button class="h-primary" type="button" :disabled="!chosen.length" @click="applyPaste">Apply {{ chosen.length || '' }}</button></template>
    </WorkspaceDialog>
  </template>
</template>
