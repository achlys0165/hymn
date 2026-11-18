<script setup>
import {computed, ref} from 'vue';
import { Check, Search } from 'lucide-vue-next';
import { normalizeSetlistTitle } from '../../shared/setlistMatcher.js';
import WorkspaceDialog from './WorkspaceDialog.vue';

const props=defineProps({songs:Array,initial:String,disabledIds:Array,title:String,allowSkip:Boolean,anchor:Object});
const emit=defineEmits(['choose','close','skip']);
const query=ref(props.initial??'');
const limit=ref(60);
const results=computed(()=>{
  const needle=normalizeSetlistTitle(query.value);
  return props.songs.filter(song=>!needle||[song.title,song.artist].some(value=>normalizeSetlistTitle(value).includes(needle)));
});
const canFocus=matchMedia('(pointer:fine)').matches;
function marked(value='') {
  const q=query.value.trim();
  const index=q?value.toLocaleLowerCase().indexOf(q.toLocaleLowerCase()):-1;
  return index<0?[value]:[value.slice(0,index),value.slice(index,index+q.length),value.slice(index+q.length)];
}
</script>

<template>
  <WorkspaceDialog :title="title||'Search library'" kind="song-picker" :anchor="anchor" @close="emit('close')">
    <label class="h-field">Search library <span class="h-search"><Search /><input v-model="query" type="search" autocomplete="off"
      :data-initial-focus="canFocus?'':undefined" @input="limit=60"></span></label>
    <div class="h-menu">
      <button v-for="song in results.slice(0,limit)" :key="song.id" type="button" class="h-picker-row" data-menu-item
        :disabled="disabledIds?.includes(Number(song.id))" @click="emit('choose',song)">
        <span class="h-row-copy">
          <strong><template v-for="(part,index) in marked(song.title)" :key="index"><mark v-if="index===1">{{ part }}</mark><template v-else>{{ part }}</template></template></strong>
          <small v-if="song.artist"><template v-for="(part,index) in marked(song.artist)" :key="index"><mark v-if="index===1">{{ part }}</mark><template v-else>{{ part }}</template></template></small>
        </span><Check v-if="disabledIds?.includes(Number(song.id))" />
      </button>
    </div>
    <p v-if="!results.length" class="h-meta">No songs found. Try another title or artist.</p>
    <button v-if="results.length>limit" type="button" class="h-ghost" @click="limit+=60">Show more songs</button>
    <template #footer>
      <button v-if="allowSkip" type="button" class="h-secondary" @click="emit('skip')">Skip this line</button>
      <button v-else type="button" class="h-primary" @click="emit('close')">Done</button>
    </template>
  </WorkspaceDialog>
</template>
