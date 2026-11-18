<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
const value=defineModel({type:String,default:''});
const field=ref(null);
let observer,width=0;
function resize() {
  const node=field.value;
  if(!node||CSS.supports('field-sizing','content')) return;
  node.style.height='auto';
  node.style.height=(node.scrollHeight+node.offsetHeight-node.clientHeight)+'px';
}
watch(value,()=>nextTick(resize));
onMounted(()=>{
  resize();
  if(!CSS.supports('field-sizing','content') && typeof ResizeObserver==='function') {
    observer=new ResizeObserver(([entry])=>{
      if(entry.contentRect.width===width) return;
      width=entry.contentRect.width;
      resize();
    });
    observer.observe(field.value);
  }
});
onBeforeUnmount(()=>observer?.disconnect());
defineExpose({ field });
</script>
<template><textarea ref="field" v-model="value" class="h-input h-growing" @input="resize"></textarea></template>
