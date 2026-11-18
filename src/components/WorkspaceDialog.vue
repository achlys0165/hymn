<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps({ title: String, kind: String, anchor: Object });
const emit = defineEmits(['close']);
const dialog = ref(null);
let opener;
let sheetStart = null;

function positionMenu() {
  const element = dialog.value;
  element.style.removeProperty('--menu-left');
  element.style.removeProperty('--menu-top');
  if (!props.anchor || !matchMedia('(min-width:900px)').matches) return;
  const edge = props.kind === 'create' ? props.anchor.right + 8 : props.anchor.left;
  element.style.setProperty('--menu-left', Math.max(8, Math.min(edge, innerWidth - element.offsetWidth - 8)) + 'px');
  element.style.setProperty('--menu-top', Math.max(8, Math.min(props.anchor.top, innerHeight - element.offsetHeight - 8)) + 'px');
}

function clickBackdrop(event) {
  if (event.target !== dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) emit('close');
}

function moveFocus(event) {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  const choices = [...dialog.value.querySelectorAll('[data-menu-item]:not(:disabled)')];
  if (!choices.length) return;
  event.preventDefault();
  const current = choices.indexOf(document.activeElement);
  const step = event.key === 'ArrowDown' ? 1 : -1;
  choices[current < 0 ? (step > 0 ? 0 : choices.length - 1) : (current + step + choices.length) % choices.length].focus();
}

onMounted(async () => {
  opener = document.activeElement;
  dialog.value.showModal();
  positionMenu();
  window.addEventListener('resize', positionMenu);
  await nextTick();
  (dialog.value?.querySelector('[data-initial-focus], [data-menu-item]') || dialog.value)?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', positionMenu);
  dialog.value?.close();
  if (opener?.isConnected) opener.focus({ preventScroll: true });
});
</script>

<template>
  <dialog
    ref="dialog" class="h-dialog" :data-kind="kind" aria-labelledby="h-dialog-title"
    @cancel.prevent="emit('close')" @click="clickBackdrop" @keydown="moveFocus"
  >
    <header class="h-dialog-header">
      <div class="h-sheet-handle" aria-hidden="true"
        @pointerdown="event => { sheetStart = event.clientY; event.target.setPointerCapture(event.pointerId) }"
        @pointercancel="sheetStart = null"
        @pointerup="event => { if (sheetStart !== null && event.clientY - sheetStart > 40) emit('close'); sheetStart = null }"
      ></div>
      <h2 id="h-dialog-title">{{ title }}</h2>
      <button class="h-icon" type="button" aria-label="Close" @click="emit('close')"><X /></button>
    </header>
    <div class="h-dialog-body"><slot /></div>
    <footer v-if="$slots.footer" class="h-dialog-footer"><slot name="footer" /></footer>
  </dialog>
</template>
