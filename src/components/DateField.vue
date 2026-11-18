<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { formatDate, localDateKey, parseDate } from '../utils/workspace.js';
import WorkspaceDialog from './WorkspaceDialog.vue';

const value=defineModel(String);
const props=defineProps({label:{type:String,default:'Date'}});
const media=matchMedia('(pointer:coarse)');
const coarse=ref(media.matches);
const open=ref(false);
const month=ref(new Date());
const months=new Intl.DateTimeFormat('en', {month:'long',year:'numeric'});
const weeks=['Su','Mo','Tu','We','Th','Fr','Sa'];
const cells=computed(()=>{
  const year=month.value.getFullYear();
  const monthIndex=month.value.getMonth();
  const lead=new Date(year,monthIndex,1).getDay();
  const end=new Date(year,monthIndex+1,0).getDate();
  return Array.from({length:Math.ceil((lead+end)/7)*7},(_,index)=>{
    const day=index-lead+1;
    return day>0&&day<=end?{ day,key:localDateKey(new Date(year,monthIndex,day)) }:null;
  });
});
const update=()=>{coarse.value=media.matches; open.value=false;};
function changeMonth(step) { month.value=new Date(month.value.getFullYear(),month.value.getMonth()+step,1); }
function choose(date) { value.value=date; open.value=false; }
function show() { month.value=parseDate(value.value) || new Date(); open.value=true; }
onMounted(()=>media.addEventListener('change',update));
onBeforeUnmount(()=>media.removeEventListener('change',update));
</script>

<template>
  <label v-if="coarse" class="h-field">{{ props.label }}<input v-model="value" type="date"></label>
  <div v-else class="h-field">
    <span>{{ props.label }}</span>
    <button class="h-input h-field-trigger" type="button" :aria-label="props.label+': '+(formatDate(value,true)||'No date')" aria-haspopup="dialog" @click="show">
      <span>{{ formatDate(value) || 'Pick a date' }}</span><CalendarDays />
    </button>
    <WorkspaceDialog v-if="open" title="Choose a date" kind="calendar" @close="open=false">
      <div class="h-calendar-month">
        <button type="button" class="h-icon" aria-label="Previous month" @click="changeMonth(-1)"><ChevronLeft /></button>
        <strong aria-live="polite">{{ months.format(month) }}</strong>
        <button type="button" class="h-icon" aria-label="Next month" @click="changeMonth(1)"><ChevronRight /></button>
      </div>
      <div class="h-calendar-grid">
        <span v-for="day in weeks" :key="day" aria-hidden="true">{{ day }}</span>
        <template v-for="(day,index) in cells" :key="index">
          <button v-if="day" class="h-icon" type="button" :aria-label="formatDate(day.key,true)" :aria-pressed="value===day.key"
            :data-initial-focus="value===day.key ? '' : undefined" @click="choose(day.key)">{{ day.day }}</button>
          <span v-else></span>
        </template>
      </div>
      <template #footer><button class="h-ghost" type="button" @click="choose('')">Clear date</button></template>
    </WorkspaceDialog>
  </div>
</template>
