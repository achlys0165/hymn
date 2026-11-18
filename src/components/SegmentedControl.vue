<script setup>
import { computed } from 'vue';
const value = defineModel(String);
const props = defineProps({ choices: { type:Array, required:true }, label:String });
const index = computed(() => Math.max(0,props.choices.findIndex(option=>option.value===value.value)));
function move(event,delta) {
  const next=(index.value+delta+props.choices.length)%props.choices.length;
  value.value=props.choices[next].value;
  event.currentTarget.children[next]?.focus();
}
</script>

<template>
  <div class="h-field-segments" role="group" :aria-label="label" :style="{'--options':choices.length,'--choice':index}"
    @keydown.left.prevent="move($event,-1)" @keydown.right.prevent="move($event,1)">
    <button v-for="option in choices" :key="option.value" type="button" :aria-pressed="value===option.value" @click="value=option.value">{{ option.label }}</button>
  </div>
</template>
