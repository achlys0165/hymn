<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowDown, ArrowUp, Camera, Clipboard, Copy, Plus, Trash2 } from 'lucide-vue-next';
import { joinLyrics, lyricsForEditor, readSetting, sectionName, splitLyrics, writeSetting } from '../utils/workspace.js';

const props = defineProps({ song: Object, busy: Boolean, flow: String, draftKey: String, canSave: Boolean });
const emit = defineEmits(['save', 'cancel', 'dirty']);
const initialLyrics = lyricsForEditor(props.song);
const initial = { title: props.song?.title ?? '', artist: props.song?.artist ?? '', category: props.song?.category ?? 'praise_worship', lyrics: initialLyrics };
const draft = ref({ ...initial });
const restored = ref(readSetting(props.draftKey, null));
const rawMode = ref(props.flow === 'paste');
const sections = ref(splitLyrics(initialLyrics));
const sectionType = ref('Verse');
const rawField = ref(null);
const titleField = ref(null);
const photo = ref(null);
const file = ref(null);
const recognized = ref('');
const scanning = ref(false);
const scanStatus = ref('');
const scanError = ref('');
const valid = computed(() => draft.value.title.trim());
let active = true;
let latestDraft;
let timer;

watch(draft, data => {
  const changed = JSON.stringify(data) !== JSON.stringify(initial);
  emit('dirty', changed);
  latestDraft = changed ? { ...data } : null;
  clearTimeout(timer);
  timer = setTimeout(() => writeSetting(props.draftKey, latestDraft), 200);
}, { deep: true, flush: 'sync' });

function syncSections() { draft.value.lyrics = joinLyrics(sections.value); }
function setRaw(value) { draft.value.lyrics = value; sections.value = splitLyrics(value); }
function moveSection(index, delta) {
  if (index + delta < 0 || index + delta >= sections.value.length) return;
  const separators = sections.value.map(section => section.separator);
  const [section] = sections.value.splice(index, 1);
  sections.value.splice(index + delta, 0, section);
  sections.value.forEach((entry, position) => { entry.separator = separators[position]; });
  syncSections();
}
function addSection() {
  sections.value.push({ prefix: '[' + sectionType.value + ']\n', text: '', separator: '' });
  syncSections();
}
function rename(section, value) {
  const name = value.replace(/[\[\]\r\n]/g, '').trim();
  section.prefix = name ? '[' + name + ']\n' : '';
  syncSections();
}
function openRaw() {
  rawMode.value = true;
  nextTick(() => rawField.value?.focus());
}
function restoreDraft() {
  const saved = restored.value;
  draft.value = { ...initial, ...saved };
  sections.value = splitLyrics(draft.value.lyrics);
  restored.value = null;
}
function choosePhoto(event) {
  const selected = event.target.files?.[0];
  event.target.value = '';
  if (!selected) return;
  file.value = selected;
  scanPhoto();
}
async function scanPhoto() {
  if (!file.value || scanning.value) return;
  scanError.value = '';
  recognized.value = '';
  const source = file.value;
  if (source.size > 15 * 1024 * 1024) { scanError.value = 'Choose a photo under 15 MB.'; return; }
  scanning.value = true;
  scanStatus.value = 'Preparing photo…';
  try {
    const { cleanOcrText, extractTextFromImage } = await import('../utils/lyricsOcr.js');
    let input = source;
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(source);
      try {
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        input = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .85)) || source;
      } finally {
        bitmap.close();
      }
    }
    if (!active) return;
    const text = await extractTextFromImage(input, { onProgress({ status, progress }) {
      if (active && status === 'recognizing text') scanStatus.value = 'Scanning… ' + Math.round(progress * 100) + '%';
    } });
    if (!active) return;
    const result = cleanOcrText(text);
    recognized.value = result.text;
    scanStatus.value = result.text ? 'Review the extracted lyrics before inserting.' : '';
    if (!result.text) scanError.value = 'No readable text was found. Try a clearer photo.';
  } catch (error) {
    scanStatus.value = '';
    scanError.value = /heic|heif/i.test(source.type + source.name)
      ? 'This browser could not open that HEIC photo. Try a JPEG or PNG copy.' : 'The photo could not be read. Try again or choose another image.';
  } finally {
    scanning.value = false;
  }
}
function insertScan() {
  setRaw(draft.value.lyrics + (draft.value.lyrics ? '\n\n' : '') + recognized.value);
  recognized.value = '';
  scanStatus.value = '';
}
function save() {
  if (!valid.value || props.busy || !props.canSave) return;
  const lyrics = draft.value.lyrics === initialLyrics ? props.song?.lyrics ?? draft.value.lyrics : draft.value.lyrics;
  emit('save', { ...draft.value, lyrics });
}
onMounted(() => {
  if (props.flow === 'paste') rawField.value?.focus();
  else if (props.flow !== 'scan' && matchMedia('(pointer:fine)').matches) titleField.value?.focus();
});
onBeforeUnmount(() => {
  active = false;
  clearTimeout(timer);
  if (latestDraft) writeSetting(props.draftKey, latestDraft);
});
</script>

<template>
  <form class="h-editor" @submit.prevent="save">
    <h1>{{ song?.id ? 'Edit song' : 'Write a song' }}</h1>
    <div v-if="restored" class="h-actions"><button class="h-secondary" type="button" @click="restoreDraft">Restore draft</button><button class="h-ghost" type="button" @click="writeSetting(draftKey, null); restored = null">Discard saved draft</button></div>
    <label class="h-field">Title<input ref="titleField" v-model="draft.title" required maxlength="300" autocapitalize="words"></label>
    <label class="h-field">Artist <span class="h-meta">Optional</span><input v-model="draft.artist" autocapitalize="words"></label>
    <label class="h-field">Category
      <select v-model="draft.category"><option value="praise_worship">Praise and worship</option><option value="solemn">Solemn</option><option value="devotion">Devotion</option></select>
    </label>
    <section class="h-actions h-editor-tools" aria-label="Lyrics tools">
      <button class="h-secondary" type="button" @click="openRaw"><Clipboard /> Paste lyrics</button>
      <button class="h-secondary" type="button" :disabled="scanning" @click="photo?.click()"><Camera /> Scan photo</button>
      <input ref="photo" type="file" accept="image/*" hidden @change="choosePhoto">
      <label v-if="flow === 'scan'" class="h-secondary h-capture"><Camera /> Take photo<input type="file" accept="image/*" capture="environment" @change="choosePhoto"></label>
    </section>
    <p v-if="scanStatus" class="h-meta" role="status">{{ scanStatus }}</p>
    <div v-if="scanError" class="h-actions"><p class="h-danger" role="alert">{{ scanError }}</p><button type="button" class="h-ghost" @click="scanPhoto">Retry</button></div>
    <section v-if="recognized" class="h-service">
      <label class="h-field">Review scanned lyrics<textarea v-model="recognized" rows="5" spellcheck="false"></textarea></label>
      <div class="h-actions"><button class="h-primary" type="button" @click="insertScan">Insert lyrics</button><button class="h-ghost" type="button" @click="recognized = ''; scanStatus = ''">Discard scan</button></div>
    </section>
    <div class="h-actions"><h2>Lyrics</h2><button class="h-ghost h-end" type="button" @click="rawMode = !rawMode">{{ rawMode ? 'Edit sections' : 'Edit as text' }}</button></div>
    <textarea v-if="rawMode" ref="rawField" class="h-input h-raw-lyrics" aria-label="Lyrics" rows="9" :value="draft.lyrics"
      autocorrect="off" spellcheck="false" autocapitalize="sentences" placeholder="[Verse 1]" @input="setRaw($event.target.value)"></textarea>
    <template v-else>
      <section v-for="(section,index) in sections" :key="index" class="h-lyric-edit">
        <label class="h-field">Section name<input :value="sectionName(section)" placeholder="Untitled section" @change="rename(section, $event.target.value)"></label>
        <textarea class="h-input" rows="3" :aria-label="'Lyrics for ' + (sectionName(section) || 'section ' + (index+1))" :value="section.text"
          autocorrect="off" spellcheck="false" autocapitalize="sentences" @input="section.text = $event.target.value; syncSections()"
          @keydown.alt.up.prevent="moveSection(index,-1)" @keydown.alt.down.prevent="moveSection(index,1)"></textarea>
        <div class="h-actions">
          <button class="h-icon" type="button" title="Move section up" aria-label="Move section up" :disabled="index === 0" @click="moveSection(index,-1)"><ArrowUp /></button>
          <button class="h-icon" type="button" title="Move section down" aria-label="Move section down" :disabled="index === sections.length-1" @click="moveSection(index,1)"><ArrowDown /></button>
          <button class="h-icon" type="button" title="Duplicate section" aria-label="Duplicate section" @click="sections.splice(index+1,0,{...section}); syncSections()"><Copy /></button>
          <button class="h-icon h-danger" type="button" title="Delete section" aria-label="Delete section" @click="sections.splice(index,1); syncSections()"><Trash2 /></button>
        </div>
      </section>
      <div class="h-actions">
        <select v-model="sectionType" class="h-input" aria-label="Section type"><option v-for="type in ['Verse','Chorus','Pre-chorus','Bridge','Intro','Outro','Tag']" :key="type">{{ type }}</option></select>
        <button type="button" class="h-secondary" @click="addSection"><Plus /> Add section</button>
      </div>
    </template>
    <footer class="h-editor-footer">
      <button class="h-primary" :disabled="!valid || busy || !canSave || scanning">{{ busy ? 'Saving…' : 'Save song' }}</button>
      <button class="h-secondary" type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
    </footer>
  </form>
</template>
