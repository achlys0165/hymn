<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { ArrowDown, ArrowUp, ClipboardList, GripVertical, Plus, X } from 'lucide-vue-next';
import { moveScheduleSong } from '../../shared/scheduleOrder.js';
import { formatDate, nextSunday, parseDate, serviceTimeFromInput, serviceTimeInput } from '../utils/workspace.js';
import DateField from './DateField.vue';
import EditorFooter from './EditorFooter.vue';
import FormListbox from './FormListbox.vue';
import GrowingTextarea from './GrowingTextarea.vue';
import PasteSetlist from './PasteSetlist.vue';
import SongPicker from './SongPicker.vue';

const props = defineProps({
  setlist: Object, lineup: { type: Array, default: () => [] }, songs: Array,
  busy: Boolean, canSave: Boolean, pasteSongs: Function, draftKey: String,
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
const startIds = ref(JSON.stringify(ids.value));
const stagedSongs=ref({});
let nextTemporaryId=-1;
const songMap = computed(() => new Map(props.songs.map(song => [Number(song.id), song])));
const lineupMap = new Map(props.lineup.map(song => [Number(song.song_id), song]));
const titles = id => songMap.value.get(id) || lineupMap.get(id) || stagedSongs.value[id];
const picker = ref('');
const pasteDirty = ref(false);
const form=useId();
const statuses=['draft','ready','live','archived'].map(value=>({value,label:value[0].toUpperCase()+value.slice(1)}));
const undo = ref(null);
const timeCapability = matchMedia('(pointer:coarse)');
const coarse = ref(timeCapability.matches);
const updatePointer = () => { coarse.value = timeCapability.matches; };
let undoTimer;
let dragging;
const valid = computed(() => draft.value.name.trim() && (!draft.value.date || parseDate(draft.value.date)));
const nativeTime = computed(() => coarse.value && (!draft.value.service_time || serviceTimeInput(draft.value.service_time)));

watch([draft, ids, startIds, pasteDirty], () => {
  emit('dirty', JSON.stringify(draft.value) !== JSON.stringify(initial) || JSON.stringify(ids.value) !== startIds.value || pasteDirty.value);
}, { deep: true, flush: 'sync' });
function closePicker() {
  pasteDirty.value=false;
  picker.value='';
}
async function applyPaste(plan) {
  const before=[...ids.value];
  if(props.setlist) {
    const receipt=await props.pasteSongs({...plan,setlistId:props.setlist.id,baseIds:before},restored=>{
      const committed=JSON.stringify(receipt.ids);
      if(JSON.stringify(ids.value)===committed) ids.value=restored;
      startIds.value=JSON.stringify(restored);
    });
    startIds.value=JSON.stringify(receipt.ids);
    ids.value=receipt.ids;
    return receipt;
  }
  const planned=plan.entries.map(entry=>{
    if(entry.id) return entry.id;
    const id=nextTemporaryId--;
    stagedSongs.value[id]=entry;
    return id;
  });
  ids.value=[...new Set([...(plan.mode==='append'?before:[]),...planned])];
  setUndo('Songs updated in this draft',before,10000);
  return null;
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
function save() {
  if (!valid.value || !props.canSave || props.busy) return;
  emit('save', { ...draft.value, song_ids: ids.value,
    pendingSongs:ids.value.some(id=>id<0)?ids.value.map(id=>id<0?stagedSongs.value[id]:{id}):undefined });
}
onMounted(() => timeCapability.addEventListener('change', updatePointer));
onBeforeUnmount(() => {
  clearTimeout(undoTimer);
  timeCapability.removeEventListener('change', updatePointer);
});
</script>

<template>
    <form :id="form" class="h-editor" @submit.prevent="save">
      <h1>{{ setlist ? 'Edit setlist' : 'New setlist' }}</h1>
      <label class="h-field">Name<input v-model="draft.name" required maxlength="300" autocapitalize="words"></label>
      <div class="h-field-pair">
        <DateField v-model="draft.date" />
        <label class="h-field">Service time <span class="h-meta">Optional</span>
          <input v-if="nativeTime" type="time" step="900" :value="serviceTimeInput(draft.service_time)"
            @change="draft.service_time = serviceTimeFromInput($event.target.value, draft.service_time)">
          <input v-else v-model="draft.service_time" placeholder="e.g. 9:00 AM">
        </label>
      </div>
      <FormListbox v-model="draft.status" label="Status" :options="statuses" />
      <label class="h-field">Description <span class="h-meta">Optional</span><GrowingTextarea v-model="draft.description" rows="2" /></label>
      <div class="h-actions h-editor-tools">
        <h2>Songs</h2>
        <button class="h-secondary h-end" type="button" @click="picker = 'songs'"><Plus /> Add songs</button>
        <button class="h-ghost" type="button" @click="picker = 'paste'"><ClipboardList /> Paste setlist</button>
      </div>
      <p v-if="!ids.length" class="h-meta">Add songs to this setlist.</p>
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
      <EditorFooter :form="form" :busy="busy" :disabled="!valid||!canSave" label="Save setlist" @cancel="emit('cancel')" />
    </form>
    <SongPicker v-if="picker==='songs'" :songs="songs" title="Add songs" :disabled-ids="ids" @choose="addSong($event.id)" @close="closePicker" />
    <PasteSetlist v-if="picker==='paste'" :songs="songs" :existing-ids="ids" :staged="!setlist" :can-save="canSave"
      :draft-key="draftKey+':pasted'" :confirm-songs="applyPaste" @dirty="pasteDirty=$event" @close="closePicker" @completed="closePicker" />
</template>
