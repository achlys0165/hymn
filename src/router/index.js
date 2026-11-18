import { createRouter, createWebHistory } from 'vue-router';
import { checkSession, workspaceUser } from '../utils/workspaceApi.js';

const workspace = () => import('../components/Main.vue');

const routes = [
  { path: '/login', name: 'login', component: () => import('../components/Login.vue') },
  { path: '/', name: 'home', component: workspace, meta: { requiresAuth: true } },
  { path: '/songs/:id(\\d+)?', name: 'songs', component: workspace, meta: { requiresAuth: true } },
  { path: '/setlists/:id(\\d+)?', name: 'setlists', component: workspace, meta: { requiresAuth: true } },
  { path: '/me', name: 'me', component: workspace, meta: { requiresAuth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, from) => {
  if (to.meta.requiresAuth) {
    if (from.meta.requiresAuth && workspaceUser.value) return true;
    return await checkSession({ offline: true }) ? true : { name: 'login', query: { next: to.fullPath } };
  }
  if (to.name === 'login' && !from.meta.requiresAuth && await checkSession()) return { name: 'home' };
  if (!to.matched.length) return { name: 'home' };
});

export default router;
