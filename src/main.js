import { createApp } from 'vue'
import App from './App.vue'
import './styles/theme.css'
import router from './router';

createApp(App).use(router).mount('#app');

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}
