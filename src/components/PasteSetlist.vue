<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { AlertCircle, Check, ChevronLeft, Clipboard, Copy, LoaderCircle, Plus, Search, X } from 'lucide-vue-next';
import { detectSetlistHeading, indexSetlistLibrary, matchSetlist, normalizeSetlistTitle } from '../../shared/setlistMatcher.js';
import { formatDate, nextSunday, normalizeLyricLabels, parseDate, pluralCount, readSetting, songCount, writeSetting } from '../utils/workspace.js';
import DateField from './DateField.vue';
import GrowingTextarea from './GrowingTextarea.vue';
import LyricsPhotoScan from './LyricsPhotoScan.vue';
import SegmentedControl from './SegmentedControl.vue';
import SongPicker from './SongPicker.vue';
import WorkspaceDialog from './WorkspaceDialog.vue';

const props=defineProps({
  songs:{type:Array,required:true}, existingIds:{type:Array,default:()=>[]}, createSetlist:Boolean, staged:Boolean,
  canSave:Boolean, loading:Boolean, draftKey:String, confirmSongs:{type:Function,required:true},
});
const emit=defineEmits(['close','completed','dirty']);
const text=ref(readSetting(props.draftKey,''));
const media=matchMedia('(min-width:900px)');
const desktop=ref(media.matches);
const screen=ref('paste');
const showReview=computed(()=>desktop.value||screen.value==='review');
const showPaste=computed(()=>desktop.value||screen.value==='paste');
const field=ref(null);
const review=ref(null);
const matches=ref([]);
const filter=ref('all');
const mode=ref('append');
const editFields=ref(false);
const date=ref(nextSunday());
const name=ref(formatDate(date.value));
const manualName=ref(false);
const clipboardHint=ref(false);
const choice=ref(null);
const choiceAnchor=ref(null);
const busy=ref(false);
const scanningEntry=ref(null);
const failure=ref('');
const unresolvedFailure=ref(false);
const pending=ref(false);
const titleSuggestion=computed(()=>detectSetlistHeading(text.value));
const relevantMode=computed(()=>!props.createSetlist&&props.existingIds.length>0);
const index=computed(()=>indexSetlistLibrary(props.songs));
const modeOptions=[{value:'append',label:'Add to end'},{value:'replace',label:'Replace songs'}];
const labels={
  matched:{text:'Matched',icon:Check},check:{text:'Check match',icon:AlertCircle},
  choose:{text:'Choose one',icon:Search},missing:{text:'Not found',icon:AlertCircle},
  duplicate:{text:'Duplicate',icon:Copy},new:{text:'New song',icon:Plus},skipped:{text:'Skipped',icon:X},
};
let timer;
let completed=false;
const updateWidth=()=>{desktop.value=media.matches;};
function updateReview() {
  const previous=new Map(matches.value.map(entry=>[entry.id+'\0'+entry.raw,entry]));
  matches.value=matchSetlist(text.value,props.songs,index.value).map(entry=>{
    const old=previous.get(entry.id+'\0'+entry.raw);
    return {...entry, choice:old?.choice, intent:old?.intent, newTitle:old?.newTitle??entry.title,
      newArtist:old?.newArtist??entry.artist, lyrics:old?.lyrics??'', rejected:old?.rejected};
  });
  pending.value=false;
}
watch([text,index],()=>{
  clearTimeout(timer);
  pending.value=true;
  timer=setTimeout(updateReview,150);
},{ immediate:true });
watch(text,value=>{
  if(!completed) writeSetting(props.draftKey,value||null);
  emit('dirty',Boolean(value.trim()));
  failure.value='';
},{immediate:true});
watch(date,value=>{if(value&&!manualName.value) name.value=formatDate(value);});

const rows=computed(()=>{
  const seen=new Map();
  const outside=new Set(relevantMode.value&&mode.value==='append'?props.existingIds.map(Number):[]);
  return matches.value.map((entry,index)=>{
    const intent=entry.intent??(!props.loading&&!props.songs.length?'create':'');
    const song=entry.choice || (!entry.rejected && ['matched','duplicate'].includes(entry.review) ? entry.song : null);
    let status=entry.review;
    let reason='';
    if(entry.rejected&&!entry.choice) status='missing';
    if(intent==='skip') status='skipped';
    else if(intent==='create') {
      const key=normalizeSetlistTitle(entry.newTitle)+'\0'+normalizeSetlistTitle(entry.newArtist);
      const earlier=seen.get(key);
      if(earlier!=null) { status='duplicate'; reason='Same as line '+earlier; }
      else {
        status='new';
        if(entry.newTitle.trim()) seen.set(key,index+1);
      }
    }
    else if(song) {
      const earlier=seen.get(Number(song.id));
      if(earlier!=null) { status='duplicate'; reason='Same as line '+earlier; }
      else if(outside.has(Number(song.id))) { status='duplicate'; reason='Already in this setlist.'; }
      else { status='matched'; seen.set(Number(song.id),index+1); }
    }
    const resolved=status==='matched'||status==='new'&&entry.newTitle.trim();
    return {entry,number:index+1,status,reason,song,resolved};
  });
});
const attention=computed(()=>rows.value.filter(row=>!row.resolved&&row.status!=='skipped'));
const shown=computed(()=>filter.value==='attention'?attention.value:rows.value);
const accepted=computed(()=>rows.value.filter(row=>row.resolved));
const matched=computed(()=>accepted.value.filter(row=>row.status==='matched').length);
const needed=computed(()=>rows.value.filter(row=>['check','choose'].includes(row.status)).length);
const missing=computed(()=>rows.value.filter(row=>row.status==='missing').length);
const newSongs=computed(()=>accepted.value.length-matched.value);
const skipped=computed(()=>rows.value.length-accepted.value.length);
const outcome=computed(()=>{
  const count=songCount(accepted.value.length);
  return props.createSetlist?'Create setlist with '+count:mode.value==='replace'?'Replace with '+count:props.staged?'Add '+count+' to this draft':'Add '+count+' to this setlist';
});
function setChoice(entry,song) {
  entry.choice=song;
  entry.intent='';
  entry.rejected=false;
  choice.value=null;
}
function openPicker(entry,event) {
  const bounds=event.currentTarget.getBoundingClientRect();
  choiceAnchor.value={left:bounds.left,top:bounds.top,right:bounds.right};
  choice.value=entry;
}
function skip(entry) {
  entry.intent='skip';
  choice.value=null;
}
function focusInput() {
  nextTick(()=>{if(media.matches) field.value?.field?.focus();});
}
function reviewNow() {
  if(!text.value.trim()) return;
  clearTimeout(timer);
  updateReview();
  screen.value='review';
  nextTick(()=>review.value?.focus({preventScroll:true}));
}
async function pasteFromClipboard() {
  try {
    const value=await navigator.clipboard.readText();
    const node=field.value?.field;
    if(node) {
      node.focus();
      node.setRangeText(value,node.selectionStart,node.selectionEnd,'end');
      node.dispatchEvent(new Event('input',{bubbles:true}));
    } else text.value=value;
    clipboardHint.value=false;
  } catch {
    clipboardHint.value=true;
    field.value?.field?.focus();
  }
}
function showUnresolved() {
  screen.value='review';
  filter.value='all';
  nextTick(()=>{
    const row=rows.value.find(row=>!row.resolved);
    const element=review.value?.querySelector('[data-review-line="'+row?.number+'"]');
    element?.scrollIntoView({block:'nearest'});
    element?.focus({preventScroll:true});
  });
}
function close() {
  if(busy.value) return;
  if(text.value.trim()&&!window.confirm('Discard pasted songs? A draft of your text will be kept on this device.')) return;
  emit('close');
}
async function submit() {
  if(busy.value||scanningEntry.value!==null||pending.value||!accepted.value.length||!props.canSave||unresolvedFailure.value) return;
  if(props.createSetlist&&(!name.value.trim()||date.value&&!parseDate(date.value))) {
    editFields.value=true;
    failure.value='Enter a setlist name and a valid date.';
    return;
  }
  busy.value=true;
  failure.value='';
  try {
    const result=await props.confirmSongs({
      entries:accepted.value.map(({entry,song,status})=>status==='new'
        ?{title:entry.newTitle,artist:entry.newArtist,lyrics:normalizeLyricLabels(entry.lyrics).trim()}:{id:Number(song.id)}),
      mode:relevantMode.value?mode.value:'append',
      fields:props.createSetlist?{ name:name.value,date:date.value,status:'draft',description:'',service_time:'' }:undefined,
    });
    completed=true;
    writeSetting(props.draftKey,null);
    emit('dirty',false);
    emit('completed',result);
  } catch(error) {
    failure.value=error.message || 'Could not save your setlist.';
    unresolvedFailure.value=Boolean(error.uncertain);
  } finally {
    busy.value=false;
  }
}
onMounted(()=>{media.addEventListener('change',updateWidth);focusInput();});
onBeforeUnmount(()=>{media.removeEventListener('change',updateWidth);clearTimeout(timer);});
</script>

<template>
  <WorkspaceDialog title="Paste setlist" kind="paste-flow" no-auto-focus @close="close">
    <div class="h-paste-layout">
      <section v-show="showPaste" class="h-paste-pane h-paste-write">
        <label class="h-field">Paste your songs
          <span class="h-meta">One song per line</span>
          <GrowingTextarea ref="field" v-model="text" class="h-paste-input" spellcheck="false" :disabled="busy"
            autocorrect="off" placeholder="1. Goodness of God - Bethel Music" />
        </label>
        <button class="h-secondary" type="button" :disabled="busy" @click="pasteFromClipboard"><Clipboard /> Paste from clipboard</button>
        <p v-if="clipboardHint" class="h-meta" role="status">Long-press in the field to paste, or press Ctrl/Cmd+V.</p>
      </section>
      <section v-show="showReview" ref="review" class="h-paste-pane h-paste-review" aria-label="Review matched songs" tabindex="-1" :inert="busy">
        <button v-if="!desktop" class="h-ghost" type="button" :disabled="busy" @click="screen='paste';nextTick(()=>field?.field?.focus())"><ChevronLeft /> Back to paste</button>
        <div v-if="createSetlist" class="h-paste-fields">
          <div class="h-actions"><strong>{{ name || 'New setlist' }}</strong>
            <button class="h-ghost" type="button" :disabled="busy" :aria-expanded="editFields" @click="editFields=!editFields">{{ editFields?'Done':'Edit' }}</button>
          </div>
          <div v-if="editFields" class="h-field-pair">
            <label class="h-field">Name<input v-model="name" maxlength="300" @input="manualName=true"></label>
            <DateField v-model="date" />
          </div>
          <div v-if="titleSuggestion&&titleSuggestion.title!==name" class="h-actions">
            <p class="h-meta">Use “{{ titleSuggestion.title }}” as the setlist name?</p>
            <button class="h-ghost" type="button" @click="manualName=true;name=titleSuggestion.title">Use it</button>
          </div>
        </div>
        <div v-if="relevantMode" class="h-paste-fields">
          <SegmentedControl v-model="mode" :choices="modeOptions" label="Setlist songs" />
          <p v-if="mode==='replace'" class="h-meta">This replaces the {{ songCount(existingIds.length) }} currently in this setlist. You can undo it after saving.</p>
        </div>
        <template v-if="loading">
          <p class="h-meta" role="status">Loading your library…</p><div v-for="i in 3" :key="i" class="h-skeleton"></div>
        </template>
        <template v-else>
          <p v-if="!songs.length" class="h-meta">Your library is empty. Every line will become a new song.</p>
          <p v-if="!rows.length" class="h-meta">Matched songs will appear here.</p>
          <div v-else class="h-paste-summary">
            <p class="h-meta" aria-live="polite">{{ pluralCount(rows.length,'line') }} · {{ matched }} matched · {{ needed }} need a choice · {{ missing }} not found<template v-if="newSongs"> · {{ newSongs }} new</template></p>
            <div class="h-actions"><button class="h-chip" type="button" :aria-pressed="filter==='all'" @click="filter='all'">All</button>
              <button class="h-chip" type="button" :aria-pressed="filter==='attention'" @click="filter='attention'">Needs attention ({{ attention.length }})</button></div>
          </div>
          <ol class="h-paste-rows">
            <li v-for="{entry,number,status,song,reason,resolved} in shown" :key="entry.id" :data-review-line="number" tabindex="-1"
              :class="{ 'needs-attention':!resolved&&status!=='skipped', 'is-skipped':status==='skipped' }">
              <div class="h-paste-row">
                <span class="h-number">{{ number }}</span>
                <div class="h-row-copy">
                  <strong>{{ song?.title ?? entry.title }}</strong>
                  <small v-if="song?.artist">{{ song.artist }}</small>
                </div>
                <span class="h-paste-status"><component :is="labels[status].icon" />{{ labels[status].text }}</span>
                <button v-if="status==='matched'" class="h-ghost" type="button" :disabled="busy" @click="openPicker(entry,$event)">Change</button>
              </div>
              <p v-if="entry.raw!==entry.title" class="h-meta h-pasted-line">Pasted: {{ entry.raw }}</p>
              <div v-if="status==='check'" class="h-paste-extra">
                <p class="h-meta">Suggested by title: {{ entry.suggestions[0]?.song.title }}<template v-if="entry.suggestions[0]?.song.artist"> · {{ entry.suggestions[0].song.artist }}</template></p>
                <div class="h-actions">
                  <button class="h-secondary" type="button" @click="setChoice(entry,entry.suggestions[0]?.song)">Use this song</button>
                  <button class="h-ghost" type="button" @click="entry.rejected=true">Not this one</button>
                </div>
              </div>
              <div v-else-if="status==='choose'" class="h-paste-extra h-menu">
                <button v-for="{song:option} in entry.suggestions" :key="option.id" type="button" @click="setChoice(entry,option)">
                  <span class="h-row-copy"><strong>{{ option.title }}</strong><small v-if="option.artist">{{ option.artist }}</small></span>
                </button>
                <button class="h-ghost" type="button" @click="openPicker(entry,$event)">Other…</button>
              </div>
              <div v-else-if="status==='missing'" class="h-paste-extra h-actions">
                <button class="h-primary" type="button" @click="openPicker(entry,$event)"><Search /> Search library</button>
                <button class="h-secondary" type="button" @click="entry.intent='create'"><Plus /> Create song</button>
              </div>
              <div v-else-if="status==='new'" class="h-paste-extra h-paste-new-song">
                <label class="h-field">New song title<input v-model="entry.newTitle" maxlength="300"></label>
                <label class="h-field">Artist <span class="h-meta">Optional</span><input v-model="entry.newArtist" maxlength="300"></label>
                <LyricsPhotoScan camera :disabled="busy||scanningEntry!==null&&scanningEntry!==entry.id"
                  @busy="scanningEntry=$event?entry.id:null" @insert="entry.lyrics+=(entry.lyrics?'\n\n':'')+$event" />
                <label class="h-field">Lyrics<GrowingTextarea v-model="entry.lyrics" rows="6" spellcheck="false" autocorrect="off"
                  placeholder="Write or paste lyrics here. Use a blank line between sections." /></label>
                <p class="h-meta">{{ staged?'The song and its lyrics will be added to your library when you save the draft.':'The song and its lyrics will be added to your library when you confirm.' }} You can leave lyrics blank and add them later.</p>
                <button class="h-ghost" type="button" @click="openPicker(entry,$event)">Use a library song instead</button>
              </div>
              <div v-else-if="status==='duplicate'" class="h-paste-extra">
                <p class="h-meta">{{ reason }} A setlist can contain each song once.</p>
                <button class="h-ghost" type="button" @click="openPicker(entry,$event)">Choose another version</button>
              </div>
              <button v-else-if="status==='skipped'" class="h-ghost h-paste-extra" type="button" @click="entry.intent=''">Undo skip</button>
              <button v-if="!['matched','skipped','duplicate'].includes(status)" class="h-ghost h-paste-extra" type="button" @click="skip(entry)">Skip this line</button>
            </li>
          </ol>
        </template>
      </section>
    </div>
    <template #footer>
      <div class="h-paste-footer">
        <div v-if="showReview" class="h-paste-outcome">
          <p v-if="failure" class="h-danger" role="alert">{{ failure }}</p>
          <p v-else-if="!canSave" class="h-meta" role="status">Offline · Reconnect to save this setlist.</p>
          <p v-else-if="!accepted.length" class="h-meta">Resolve at least one song to continue.</p>
          <p v-else class="h-meta">{{ songCount(accepted.length) }} will be {{ mode==='replace'?'used':'added' }}.</p>
          <button v-if="skipped" class="h-ghost" type="button" :disabled="busy" @click="showUnresolved">{{ pluralCount(skipped,'line') }} will be skipped</button>
        </div>
        <div class="h-paste-buttons">
          <button v-if="!showReview" class="h-primary" type="button" :disabled="!text.trim()" @click="reviewNow">Review</button>
          <button v-else class="h-primary" type="button" :disabled="busy||scanningEntry!==null||pending||!accepted.length||!canSave||loading||unresolvedFailure" @click="submit">
            <LoaderCircle v-if="busy" class="h-spinning" />
            {{ busy ? (createSetlist?'Creating…':'Saving…') : failure&&!unresolvedFailure ? 'Try again' : outcome }}
          </button>
          <button class="h-secondary" type="button" :disabled="busy" @click="close">Cancel</button>
        </div>
      </div>
    </template>
    <SongPicker v-if="choice" :songs="songs" :initial="choice.title" :anchor="choiceAnchor" allow-skip
      @choose="setChoice(choice,$event)" @skip="skip(choice)" @close="choice=null" />
  </WorkspaceDialog>
</template>
