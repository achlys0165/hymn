<script setup>
defineProps({form:String,disabled:Boolean,busy:Boolean,label:String});
const emit=defineEmits(['cancel']);
</script>
<template>
  <Teleport defer to="#h-editor-footer-host">
    <div v-if="$slots.toolbar" class="h-editor-toolbar"><slot name="toolbar" /></div>
    <footer class="h-editor-footer">
      <button class="h-primary" type="submit" :form="form" :disabled="disabled||busy">{{ busy?'Saving…':label }}</button>
      <button class="h-secondary" type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
    </footer>
  </Teleport>
</template>
