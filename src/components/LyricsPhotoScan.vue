<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { Camera } from 'lucide-vue-next';
import { cleanOcrText, extractTextFromImage } from '../utils/lyricsOcr.js';
import GrowingTextarea from './GrowingTextarea.vue';

defineProps({ disabled:Boolean, camera:Boolean });
const emit=defineEmits(['insert','busy']);
const photo=ref(null);
const capture=ref(null);
const file=ref(null);
const recognized=ref('');
const scanning=ref(false);
const status=ref('');
const error=ref('');
let active=true;
watch(scanning,value=>emit('busy',value),{flush:'sync'});
function choosePhoto(event) {
  const selected=event.target.files?.[0];
  event.target.value='';
  if(!selected) return;
  file.value=selected;
  scanPhoto();
}
async function scanPhoto() {
  if(!file.value||scanning.value) return;
  error.value='';
  recognized.value='';
  status.value='';
  const source=file.value;
  if(source.size>15*1024*1024) { error.value='Choose a photo under 15 MB.'; return; }
  scanning.value=true;
  status.value='Preparing photo…';
  try {
    let input=source;
    if(typeof createImageBitmap==='function') {
      const bitmap=await createImageBitmap(source);
      try {
        const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));
        canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        const context=canvas.getContext('2d');
        context.fillStyle='#fff';
        context.fillRect(0,0,canvas.width,canvas.height);
        context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        input=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85))||source;
      } finally { bitmap.close(); }
    }
    if(!active) return;
    const text=await extractTextFromImage(input,{onProgress({status:stage,progress}) {
      if(active&&stage==='recognizing text') status.value='Scanning… '+Math.round(progress*100)+'%';
    }});
    if(!active) return;
    recognized.value=cleanOcrText(text).text;
    status.value=recognized.value?'Review the extracted lyrics before inserting.':'';
    if(!recognized.value) error.value='No readable text was found. Try a clearer photo.';
  } catch {
    if(!active) return;
    status.value='';
    error.value=/heic|heif/i.test(source.type+source.name)
      ?'This browser could not open that HEIC photo. Try a JPEG or PNG copy.':'The photo could not be read. Try again or choose another image.';
  } finally { scanning.value=false; }
}
function discard() { recognized.value=''; status.value=''; }
function insert() { emit('insert',recognized.value); discard(); }
onBeforeUnmount(()=>{ active=false; emit('busy',false); });
</script>

<template>
  <section class="h-lyrics-scan" :aria-busy="scanning" :inert="disabled">
    <div class="h-actions h-editor-tools" aria-label="Lyrics tools">
      <slot />
      <button class="h-secondary" type="button" :disabled="scanning||disabled" @click="photo?.click()"><Camera /> Scan photo</button>
      <input ref="photo" type="file" accept="image/*" hidden :disabled="scanning||disabled" @change="choosePhoto">
      <button v-if="camera" class="h-secondary" type="button" :disabled="scanning||disabled" @click="capture?.click()"><Camera /> Take photo</button>
      <input v-if="camera" ref="capture" type="file" accept="image/*" capture="environment" hidden :disabled="scanning||disabled" @change="choosePhoto">
    </div>
    <p v-if="status" class="h-meta" role="status">{{ status }}</p>
    <div v-if="error" class="h-actions"><p class="h-danger" role="alert">{{ error }}</p><button type="button" class="h-ghost" :disabled="scanning" @click="scanPhoto">Retry</button></div>
    <section v-if="recognized" class="h-service">
      <label class="h-field">Review scanned lyrics<GrowingTextarea v-model="recognized" rows="5" spellcheck="false" /></label>
      <div class="h-actions"><button class="h-primary" type="button" :disabled="!recognized.trim()" @click="insert">Insert lyrics</button><button class="h-ghost" type="button" @click="discard">Discard scan</button></div>
    </section>
  </section>
</template>
