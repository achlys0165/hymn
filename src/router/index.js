import { createRouter, createWebHistory } from 'vue-router';
import Login from '@/components/Login.vue';
import Main from '@/components/Main.vue';

const routes = [
  { path: '/login', component: Login, meta: { public: true } },
  { path: '/', component: Main, meta: { requiresAuth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, from, next) => {
  if (!to.meta.requiresAuth && !to.meta.public) {
    next();
    return;
  }

  // The session cookie is httpOnly, so it can't be read here directly —
  // the only way to know if it's still valid is to ask the server.
  let isLoggedIn = false;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    isLoggedIn = res.ok;
  } catch {
    isLoggedIn = false;
  }

  if (to.meta.requiresAuth && !isLoggedIn) {
    next('/login');
  } else if (to.meta.public && isLoggedIn) {
    next('/');
  } else {
    next();
  }
});

export default router;