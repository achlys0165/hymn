<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { ArrowDown, ArrowUp, Clipboard, Copy, GripVertical, Trash2 } from 'lucide-vue-next';
import { isChordLine } from '../utils/lyricsOcr.js';
import { joinLyrics, lyricLabel, lyricsForEditor, normalizeLyricLabels, readSetting, sectionName, splitLyrics, tidyPastedLyrics, writeSetting } from '../utils/workspace.js';
import EditorFooter from './EditorFooter.vue';
import FormListbox from './FormListbox.vue';
import GrowingTextarea from './GrowingTextarea.vue';
import LyricsPhotoScan from './LyricsPhotoScan.vue';
import SegmentedControl from './SegmentedControl.vue';

const props = defineProps({ song: Object, busy: Boolean, flow: String, draftKey: String, canSave: Boolean });
const emit = defineEmits(['save', 'cancel', 'dirty']);
const initialLyrics = lyricsForEditor(props.song);
const initial = { title: props.song?.title ?? '', artist: props.song?.artist ?? '', category: props.song?.category ?? 'praise_worship', lyrics: initialLyrics };
const draft = ref({ ...initial });
const restored = ref(readSetting(props.draftKey, null));
const mode=ref('write');
const choices=[{value:'write',label:'Write'},{value:'preview',label:'Preview'},{value:'sections',label:'Sections'}];
const labelButtons=['Verse','Chorus','Pre-chorus','Bridge','Intro','Outro','Tag','Interlude'];
const categories=[{value:'praise_worship',label:'Praise and worship'},{value:'solemn',label:'Solemn'},{value:'devotion',label:'Devotion'}];
const sections = ref(splitLyrics(initialLyrics));
const analyzed=ref(initialLyrics);
const rawField = ref(null);
const textField=()=>rawField.value?.field;
const titleField = ref(null);
const form=useId();
const error=ref('');
const clipboardHint=ref(false);
const undo=ref(null);
const dismissed=ref(new Set());
const nameIntro=ref(false);
const introName=ref('Intro');
const showSuggestions=ref(true);
const wideQuery=matchMedia('(min-width:1200px)');
const desktopQuery=matchMedia('(min-width:900px)');
const wide=ref(wideQuery.matches);
const desktop=ref(desktopQuery.matches);
const wideChange=()=>{wide.value=wideQuery.matches; desktop.value=desktopQuery.matches; if(wide.value&&mode.value==='preview') mode.value='write';};
const modes=computed(()=>wide.value?choices.filter(choice=>choice.value!=='preview'):choices);
let caret=[0,0];
let dragIndex=null;
let warnedEmpty=false;
let analysisTimer;
let idleAnalysis;
const scanning = ref(false);
const previewText=computed(()=>props.song?.id && analyzed.value===initialLyrics ? initialLyrics : normalizeLyricLabels(analyzed.value).trim());
const preview=computed(()=>splitLyrics(previewText.value));
const conversion=computed(()=>previewText.value!==analyzed.value && splitLyrics(analyzed.value).some(section=>{
  const name=sectionName(section);
  return name && section.prefix.trim()!=='['+name+']';
}));
const sectionLines=text=>text.split(/\r?\n/).filter(line=>line.trim()).length;
const suggestions=computed(()=>{
  const result=[];
  const blocks=sections.value;
  const labeled=blocks.findIndex(section=>section.prefix);
  if (labeled<0&&analyzed.value.trim()) result.push({key:'verses',text:'No section labels found. Split on blank lines as Verse 1, Verse 2…?',action:'Apply'});
  if (labeled>0&&blocks.slice(0,labeled).some(section=>section.text.trim())) {
    result.push({key:'intro',text:'Lines before the first label stay unlabeled.',action:'Name it…'});
    const first=blocks[0]?.text.split(/\r?\n/)[0]?.trim() || '';
    if (!draft.value.title.trim()&&first&&first.length<=70&&!isChordLine(first)) result.push({key:'title',text:'Use “'+first+'” as the title?',action:'Use as title',title:first});
  }
  for(let index=0; index<blocks.length; index++) {
    const block=blocks[index];
    const name=sectionName(block);
    if(!name||block.text.trim()) continue;
    const original=blocks.slice(0,index).find(item=>sectionName(item)===name && item.text.trim());
    if(original) result.push({key:'empty-'+index,text:name+' (line '+(analyzed.value.slice(0,block.start).split('\n').length)+') is empty. Copy the earlier section?',action:'Copy lines',ignore:'Keep empty',index,original});
  }
  const chords=analyzed.value.split(/\r?\n/).filter(line=>!lyricLabel(line)&&isChordLine(line)).length;
  if (chords) result.push({key:'chords',text:'Found '+chords+' chord '+(chords===1?'line.':'lines.'),action:'Remove chord lines'});
  return result.filter(item=>!dismissed.value.has(item.key));
});
let latestDraft;
let timer;

watch(draft, data => {
  const changed = JSON.stringify(data) !== JSON.stringify(initial);
  emit('dirty', changed);
  latestDraft = changed ? { ...data } : null;
  clearTimeout(timer);
  timer = setTimeout(() => writeSetting(props.draftKey, latestDraft), 200);
}, { deep: true, flush: 'sync' });

function analyze() {
  analyzed.value=draft.value.lyrics;
  sections.value=splitLyrics(analyzed.value);
}
watch(()=>draft.value.lyrics,()=>{
  clearTimeout(analysisTimer);
  if(idleAnalysis) window.cancelIdleCallback?.(idleAnalysis);
  analysisTimer=setTimeout(()=>{
    if(window.requestIdleCallback) idleAnalysis=window.requestIdleCallback(analyze,{timeout:25});
    else analyze();
  },120);
});
watch(mode,(next,previous)=>{
  if(next!=='write') analyze();
  if(next==='write'&&previous!==next) nextTick(restoreCaret);
});
function rememberCaret() {
  const element=textField();
  if(element) caret=[element.selectionStart,element.selectionEnd];
}
function restoreCaret() {
  const element=textField();
  if (!element) return;
  const selection=[...caret];
  element.focus({preventScroll:true});
  element.setSelectionRange(...selection);
  caret=selection;
}
function syncSections() { draft.value.lyrics=joinLyrics(sections.value); analyzed.value=draft.value.lyrics; }
function focusOutline(section) {
  mode.value='write';
  caret=[section.start,section.end];
  nextTick(()=>{
    restoreCaret();
    const element=textField();
    if (!element) return;
    const before=element.value.slice(0,section.start);
    const style=getComputedStyle(element);
    const measure=document.createElement('div');
    Object.assign(measure.style,{position:'fixed',visibility:'hidden',width:element.clientWidth+'px',whiteSpace:'pre-wrap',overflowWrap:'anywhere',
      font:style.font,lineHeight:style.lineHeight,padding:style.padding,boxSizing:'border-box'});
    measure.textContent=before+'\u200b';
    document.body.append(measure);
    const y=element.getBoundingClientRect().top+measure.offsetHeight;
    measure.remove();
    element.closest('.h-detail')?.scrollBy({top:y-innerHeight*.36});
  });
}
function moveSection(index, delta) {
  if (index + delta < 0 || index + delta >= sections.value.length) return;
  const separators = sections.value.map(section => section.separator);
  const [section] = sections.value.splice(index, 1);
  sections.value.splice(index + delta, 0, section);
  sections.value.forEach((entry, position) => { entry.separator = separators[position]; });
  syncSections();
}
function rename(section, value) {
  const name = value.replace(/[\[\]\r\n]/g, '').trim();
  section.prefix = name ? '[' + name + ']\n' : '';
  syncSections();
}
function moveSectionTo(from,to) {
  if(!Number.isInteger(from)||!Number.isInteger(to)||from===to||!sections.value[from]||!sections.value[to]) return;
  const separators=sections.value.map(section=>section.separator);
  const [section]=sections.value.splice(from,1);
  sections.value.splice(to,0,section);
  sections.value.forEach((entry,index)=>{entry.separator=separators[index];});
  syncSections();
}
function touchDrop(event) {
  if(event.pointerType!=='touch') return;
  const entry=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-lyric-index]');
  moveSectionTo(dragIndex,Number(entry?.dataset.lyricIndex));
  dragIndex=null;
}
function insertText(text,start,end) {
  const element=textField();
  if(!element) return;
  element.focus({preventScroll:true});
  element.setSelectionRange(start,end);
  if(!document.execCommand?.('insertText',false,text)) {
    element.setRangeText(text,start,end,'end');
    element.dispatchEvent(new Event('input',{bubbles:true}));
  }
  draft.value.lyrics=element.value;
  rememberCaret();
}
function applyText(text,label) {
  const before={lyrics:draft.value.lyrics,title:draft.value.title};
  mode.value='write';
  nextTick(()=>{
    insertText(text,0,textField()?.value.length ?? 0);
    undo.value={...before,after:draft.value.lyrics,afterTitle:draft.value.title,label};
  });
}
function pasted(raw) {
  const element=textField();
  if(!element||!raw) return;
  const before={lyrics:draft.value.lyrics,title:draft.value.title};
  const start=element.selectionStart;
  const end=element.selectionEnd;
  let tidied=tidyPastedLyrics(raw);
  const preceding=element.value.slice(0,start);
  if (lyricLabel(tidied.split('\n')[0])&&preceding.trim()&&!preceding.endsWith('\n\n')) tidied=(preceding.endsWith('\n')?'\n':'\n\n')+tidied;
  insertText(tidied,start,end);
  clipboardHint.value=false;
  if (tidied!==raw) undo.value={...before,after:draft.value.lyrics,afterTitle:draft.value.title,label:'Tidied pasted text'};
}
function onPaste(event) {
  const raw=event.clipboardData?.getData('text/plain');
  if(raw==null) return;
  event.preventDefault();
  pasted(raw);
}
async function readClipboard() {
  mode.value='write';
  await nextTick();
  restoreCaret();
  try { pasted(await navigator.clipboard.readText()); }
  catch { clipboardHint.value=true; }
}
function insertLabel(type) {
  mode.value='write';
  nextTick(()=>{
    const element=textField();
    if(!element) return;
    if(document.activeElement===element) rememberCaret();
    const [start,end]=caret;
    const numbered=['Verse','Bridge'].includes(type);
    const prior=splitLyrics(draft.value.lyrics).map(sectionName).filter(name=>name===type||name.startsWith(type+' '));
    const highest=Math.max(prior.length,...prior.map(name=>Number(name.match(/\d+/)?.[0]||0)));
    const heading='['+type+(numbered?' '+(highest+1):'')+']\n';
    const before=element.value.slice(0,start);
    const spacing=!before||/\n[ \t]*\n$/.test(before)?'':before.endsWith('\n')?'\n':'\n\n';
    insertText(spacing+heading+element.value.slice(start,end),start,end);
    const cursor=start+spacing.length+heading.length;
    caret=[cursor,cursor];
    restoreCaret();
  });
}
function applySuggestion(item) {
  if(item.key==='intro') { nameIntro.value=true; return; }
  if(item.key==='title') {
    const before=draft.value.title;
    draft.value.title=item.title;
    undo.value={lyrics:draft.value.lyrics,title:before,after:draft.value.lyrics,afterTitle:item.title,label:'Title added'};
  } else if(item.key==='chords') {
    applyText(draft.value.lyrics.replace(/^[^\n]*(?:\n|$)/gm,line=>!lyricLabel(line)&&isChordLine(line)?'':line),'Chord lines removed');
  } else {
    const blocks=splitLyrics(draft.value.lyrics);
    if(item.key==='verses') {
      let index=0;
      for(const block of blocks) if(block.text.trim()) block.prefix='[Verse '+ ++index +']\n';
    } else if(blocks[item.index]) blocks[item.index].text=item.original.text;
    applyText(joinLyrics(blocks),'Suggestion applied');
  }
}
function applyIntro() {
  const label=introName.value.replace(/[\[\]\r\n]/g,'').trim();
  const blocks=splitLyrics(draft.value.lyrics);
  const intro=blocks.find(section=>!section.prefix&&section.text.trim());
  if(label&&intro) { intro.prefix='['+label+']\n'; applyText(joinLyrics(blocks),'Section named'); }
  nameIntro.value=false;
}
function undoSuggestion() {
  const previous=undo.value;
  if(!previous||draft.value.lyrics!==previous.after||draft.value.title!==previous.afterTitle) return;
  if(previous.lyrics!==draft.value.lyrics) {
    mode.value='write';
    nextTick(()=>insertText(previous.lyrics,0,textField()?.value.length??0));
  }
  draft.value.title=previous.title;
  undo.value=null;
}
function restoreDraft() {
  const saved = restored.value;
  draft.value = { ...initial, ...saved };
  analyze();
  restored.value = null;
}
function insertScan(scan) {
  mode.value='write';
  nextTick(()=>{
    const end=textField()?.value.length??0;
    insertText((end?'\n\n':'')+scan,end,end);
  });
}
function save() {
  if (props.busy || !props.canSave || scanning.value) return;
  if(!draft.value.title.trim()) { error.value='Enter a song title.'; titleField.value?.focus(); return; }
  const unchanged=Boolean(props.song?.id) && JSON.stringify(draft.value)===JSON.stringify(initial);
  const lyrics = draft.value.lyrics === initialLyrics ? props.song?.lyrics ?? draft.value.lyrics : normalizeLyricLabels(draft.value.lyrics).trim();
  if (!unchanged&&!lyrics.trim()&&!warnedEmpty) {
    if(!window.confirm('Save this song without lyrics? You can add lyrics later.')) return;
    warnedEmpty=true;
  }
  emit('save', { ...draft.value, lyrics },unchanged);
}
function shortcut(event) {
  if(event.defaultPrevented||document.querySelector('.h-dialog[open]')) return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s') { event.preventDefault(); save(); }
}
onMounted(() => {
  wideQuery.addEventListener('change',wideChange);
  desktopQuery.addEventListener('change',wideChange);
  window.addEventListener('keydown',shortcut);
  if (props.flow !== 'scan') textField()?.focus({preventScroll:desktop.value});
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  clearTimeout(analysisTimer);
  if(idleAnalysis) window.cancelIdleCallback?.(idleAnalysis);
  wideQuery.removeEventListener('change',wideChange);
  desktopQuery.removeEventListener('change',wideChange);
  window.removeEventListener('keydown',shortcut);
  if (latestDraft) writeSetting(props.draftKey, latestDraft);
});
</script>

<template>
  <form :id="form" class="h-editor h-song-editor" novalidate @submit.prevent="save">
    <h1>{{ song?.id ? 'Edit song' : 'Write a song' }}</h1>
    <div v-if="restored" class="h-actions"><button class="h-secondary" type="button" @click="restoreDraft">Restore draft</button><button class="h-ghost" type="button" @click="writeSetting(draftKey, null); restored = null">Discard saved draft</button></div>
    <label class="h-field">Title<input ref="titleField" v-model="draft.title" required maxlength="300" autocapitalize="words"
      :aria-invalid="Boolean(error)" :aria-describedby="error?form+'-error':undefined" @input="error=''">
      <span v-if="error" :id="form+'-error'" class="h-danger">{{ error }}</span>
    </label>
    <label class="h-field">Artist <span class="h-meta">Optional</span><input v-model="draft.artist" autocapitalize="words"></label>
    <FormListbox v-model="draft.category" label="Category" :options="categories" />
    <LyricsPhotoScan :disabled="busy" :camera="flow==='scan'" @busy="scanning=$event" @insert="insertScan">
      <button v-if="flow==='paste'" class="h-primary" type="button" @click="readClipboard"><Clipboard /> Paste from clipboard</button>
    </LyricsPhotoScan>
    <p v-if="clipboardHint" class="h-meta" role="status">Long-press in the lyrics field to paste, or press Ctrl/Cmd+V.</p>
    <div class="h-actions"><h2>Lyrics</h2><SegmentedControl v-model="mode" class="h-end" :choices="modes" label="Lyrics view" /></div>
    <div class="h-lyrics-work" :class="{'h-lyrics-split':wide&&mode==='write'}">
      <section v-show="mode==='write'" class="h-lyrics-write">
        <div v-if="desktop" class="h-label-buttons" aria-label="Insert lyric label">
          <button v-for="type in labelButtons" :key="type" type="button" class="h-chip" :title="'Insert '+type+' label'" @pointerdown.prevent @click="insertLabel(type)">{{ type }}</button>
        </div>
        <label class="h-field">Write lyrics
          <GrowingTextarea ref="rawField" v-model="draft.lyrics" class="h-raw-lyrics" aria-label="Lyrics" autocorrect="off" spellcheck="false" autocapitalize="sentences"
            :placeholder="'[Verse 1]\nPaste or type your verse here\n\n[Chorus]\nPaste or type your chorus here'" @paste="onPaste" @select="rememberCaret"
            @focus="rememberCaret" @input="rememberCaret" @blur="rememberCaret" @click="rememberCaret" @keyup="rememberCaret" />
        </label>
        <div v-if="sections.length" class="h-lyric-outline" aria-label="Detected sections">
          <button v-for="(section,index) in sections" :key="index" type="button" class="h-chip" @click="focusOutline(section)">
            {{ sectionName(section)||'Unlabeled' }} · {{ sectionLines(section.text) }} {{ sectionLines(section.text)===1?'line':'lines' }}
          </button>
        </div>
        <div v-if="undo && draft.lyrics===undo.after && draft.title===undo.afterTitle" class="h-inline-undo" role="status">{{ undo.label }}
          <button class="h-ghost" type="button" @click="undoSuggestion">Undo</button></div>
        <section v-if="showSuggestions && suggestions.length" class="h-suggestions">
          <div class="h-actions"><h3>Suggestions</h3><button class="h-ghost h-end" type="button" @click="showSuggestions=false">Dismiss</button></div>
          <div v-for="item in suggestions" :key="item.key">
            <p class="h-meta">{{ item.text }}</p><div class="h-actions">
              <button class="h-secondary" type="button" @click="applySuggestion(item)">{{ item.action }}</button>
              <button class="h-ghost" type="button" @click="dismissed.add(item.key)">{{ item.ignore||'Ignore' }}</button>
            </div>
          </div>
          <div v-if="nameIntro" class="h-actions">
            <label class="h-field">Section name<input v-model="introName"></label><button type="button" class="h-secondary" @click="applyIntro">Name section</button>
          </div>
        </section>
      </section>
      <section v-if="mode==='preview'||wide&&mode==='write'" aria-label="Lyrics preview" class="h-lyrics-preview">
        <h3>Preview</h3>
        <p v-if="conversion" class="h-meta">Labels will be saved as [Chorus], [Verse 1]…</p>
        <p v-if="!previewText.trim()" class="h-meta">Lyrics will appear here.</p>
        <section v-for="(section,index) in preview" :key="index" class="h-lyric-section">
          <h2 v-if="sectionName(section)" class="h-meta">{{ sectionName(section) }}</h2><p>{{ section.text }}</p>
        </section>
      </section>
    </div>
    <template v-if="mode==='sections'">
      <section v-for="(section,index) in sections" :key="index" class="h-lyric-edit" :data-lyric-index="index"
        @dragover.prevent @drop.prevent="moveSectionTo(dragIndex,index); dragIndex=null">
        <label class="h-field">Section name<input :value="sectionName(section)" placeholder="Untitled section" @change="rename(section, $event.target.value)"></label>
        <label class="h-field">Section lyrics<GrowingTextarea :model-value="section.text" rows="3"
          autocorrect="off" spellcheck="false" autocapitalize="sentences" @update:model-value="value=>{section.text=value;syncSections()}"
          @keydown.alt.up.prevent="moveSection(index,-1)" @keydown.alt.down.prevent="moveSection(index,1)" /></label>
        <div class="h-actions">
          <button class="h-icon h-grab" type="button" draggable="true" aria-label="Drag section"
            @dragstart="$event.dataTransfer.setData('text/plain',String(index));dragIndex=index" @dragend="dragIndex=null"
            @pointerdown="event=>{if(event.pointerType==='touch'){dragIndex=index;event.currentTarget.setPointerCapture(event.pointerId)}}"
            @pointerup="touchDrop" @pointercancel="dragIndex=null"><GripVertical /></button>
          <button class="h-icon" type="button" title="Move section up" aria-label="Move section up" :disabled="index === 0" @click="moveSection(index,-1)"><ArrowUp /></button>
          <button class="h-icon" type="button" title="Move section down" aria-label="Move section down" :disabled="index === sections.length-1" @click="moveSection(index,1)"><ArrowDown /></button>
          <button class="h-icon" type="button" title="Duplicate section" aria-label="Duplicate section" @click="sections.splice(index+1,0,{...section}); syncSections()"><Copy /></button>
          <button class="h-icon h-danger" type="button" title="Delete section" aria-label="Delete section" @click="sections.splice(index,1); syncSections()"><Trash2 /></button>
        </div>
      </section>
      <p v-if="!sections.length" class="h-meta">Write or paste lyrics to add sections.</p>
    </template>
    <EditorFooter :form="form" :busy="busy" :disabled="!canSave||scanning" label="Save song" @cancel="emit('cancel')">
      <template v-if="mode==='write'&&!desktop" #toolbar>
        <div class="h-label-buttons" aria-label="Insert lyric label">
          <button v-for="type in labelButtons" :key="type" type="button" class="h-chip" :title="'Insert '+type+' label'"
            @pointerdown.prevent @click="insertLabel(type)">{{ type }}</button>
        </div>
      </template>
    </EditorFooter>
  </form>
</template>
