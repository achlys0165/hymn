<script setup>
import { nextTick, onBeforeUnmount } from 'vue';
import { CalendarDays, Ellipsis, Trash2 } from 'lucide-vue-next';
import { dateTile, lyricSections, monogram, songCount } from '../utils/workspace.js';

defineProps({
  items: { type: Array, required: true },
  kind: { type: String, required: true },
  selectedId: Number,
  deletable: Boolean,
  letterHeaders: Boolean,
});
const emit = defineEmits(['open', 'menu', 'remove']);
let press;
let swipe;
let ignoreClick = 0;

const note = item => item.artist || lyricSections(item).flatMap(section=>section.text.split(/\r?\n/)).find(line=>line.trim()) || '';

function pressRow(event, item) {
  if (event.pointerType !== 'touch') return;
  const anchor = event.currentTarget;
  if (event.clientX < 22) return;
  swipe = { x: event.clientX, y: event.clientY };
  press = setTimeout(() => {
    ignoreClick = Date.now() + 600;
    emit('menu', item, anchor);
    navigator.vibrate?.(10);
  }, 350);
}

function moveRow(event) {
  if (swipe && Math.hypot(event.clientX - swipe.x, event.clientY - swipe.y) > 9) clearTimeout(press);
}

function releaseRow(event, item, deletable) {
  clearTimeout(press);
  if (swipe && deletable && event.clientX - swipe.x < -60 && Math.abs(event.clientY - swipe.y) < 32) {
    ignoreClick = Date.now() + 500;
    const row = event.currentTarget.closest('.h-library-row');
    row?.classList.add('revealed');
    nextTick(() => row?.querySelector('.h-swipe-delete')?.focus({ preventScroll: true }));
  }
  swipe = null;
}

function cancelPress() {
  clearTimeout(press);
  swipe = null;
}
onBeforeUnmount(cancelPress);
</script>

<template>
  <div v-for="({ item, letter }) in items" :key="item.id" class="h-row-wrapper">
    <p v-if="letterHeaders && letter" class="h-letter" :data-letter="letter">{{ letter }}</p>
    <div class="h-library-row" :class="{ 'is-selected': item.id === selectedId }" :data-id="item.id"
      @contextmenu.prevent="emit('menu', item, $event.currentTarget)"
    >
      <button class="h-row-main" type="button" data-library-item
        @click="Date.now() >= ignoreClick && emit('open', item)"
        @pointerdown="pressRow($event, item)" @pointermove="moveRow" @pointerup="releaseRow($event, item, deletable)" @pointercancel="cancelPress"
      >
        <span v-if="kind === 'songs'" class="h-monogram" :data-tone="monogram(item.title).tone" aria-hidden="true">{{ monogram(item.title).initials }}</span>
        <span v-else-if="dateTile(item.date)" class="h-date" aria-hidden="true"><strong>{{ dateTile(item.date).day }}</strong>{{ dateTile(item.date).month }}</span>
        <span v-else class="h-date h-undated" title="No date"><CalendarDays aria-label="No date" /></span>
        <span class="h-row-copy">
          <strong>{{ kind === 'songs' ? item.title : item.name }}</strong>
          <small v-if="kind === 'songs' && note(item)">{{ note(item) }}</small>
          <small v-else-if="kind === 'setlists'">
            {{ songCount(item.song_count ?? 0) }}<template v-if="item.service_time"> · {{ item.service_time }}</template>
            <template v-if="item.status"> · <span class="h-dot"></span> <span class="h-status-text">{{ item.status }}</span></template>
          </small>
        </span>
      </button>
      <button class="h-icon h-more" type="button" :aria-label="'Actions for ' + (item.title ?? item.name)"
        @click="emit('menu', item, $event.currentTarget)"><Ellipsis /></button>
      <button v-if="deletable" class="h-icon h-swipe-delete h-danger" type="button" :aria-label="'Delete ' + (item.title ?? item.name)"
        @click="$event.currentTarget.closest('.h-library-row').classList.remove('revealed'); emit('remove', item)"><Trash2 /></button>
    </div>
  </div>
</template>
