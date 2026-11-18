<script setup>
import { computed, nextTick, ref, useId } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';
const value = defineModel(String);
const props = defineProps({ label:String, options:{type:Array,required:true} });
const open=ref(false);
const active=ref(0);
const button=ref(null);
const list=ref(null);
const id=useId();
const current=computed(()=>props.options.find(option=>option.value===value.value));
async function show(delta=0) {
  active.value=Math.max(0,props.options.indexOf(current.value));
  active.value=Math.max(0,Math.min(props.options.length-1,active.value+delta));
  open.value=true;
  await nextTick();
  list.value?.focus();
}
function close(restore=false) {
  open.value=false;
  if(restore) button.value?.focus();
}
function choose(option) {
  if (!option) return;
  value.value=option.value;
  close(true);
}
function navigate(event) {
  if(event.key==='Tab') { close(); return; }
  if(event.key==='Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
  if(event.key==='Enter'||event.key===' ') { event.preventDefault(); choose(props.options[active.value]); return; }
  const indexes={ArrowUp:active.value-1,ArrowDown:active.value+1,Home:0,End:props.options.length-1};
  if(!(event.key in indexes)) return;
  event.preventDefault();
  active.value=Math.max(0,Math.min(props.options.length-1,indexes[event.key]));
  list.value?.children[active.value]?.scrollIntoView({block:'nearest'});
}
</script>

<template>
  <div class="h-field h-listbox-field" @focusout="!$event.currentTarget.contains($event.relatedTarget) && close()">
    <span :id="id+'-label'">{{ label }}</span>
    <button ref="button" class="h-input h-field-trigger" type="button" :aria-labelledby="id+'-label '+id+'-value'"
      aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open?id+'-list':undefined"
      @click="open ? close() : show()" @keydown.down.prevent="show()" @keydown.up.prevent="show()">
      <span :id="id+'-value'">{{ current?.label ?? 'Choose' }}</span><ChevronDown />
    </button>
    <ul v-if="open" :id="id+'-list'" ref="list" class="h-listbox" role="listbox" tabindex="-1"
      :aria-labelledby="id+'-label'" :aria-activedescendant="id+'-'+active" @keydown="navigate">
      <li v-for="(option,index) in options" :id="id+'-'+index" :key="option.value" role="option" :aria-selected="option.value===value"
        :data-active="index===active || undefined" @pointerdown.prevent @click="choose(option)">
        {{ option.label }} <Check v-if="option.value===value" />
      </li>
    </ul>
  </div>
</template>
