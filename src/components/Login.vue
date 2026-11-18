<script>
import '../styles/login.css';

// API_BASE: set VITE_API_URL in your frontend .env if the backend isn't
// reachable at a same-origin "/api" path (see backend README for why
// same-origin + a dev proxy is the simplest, most secure setup).
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default {
  name: 'LoginPage',

  data() {
    return {
      // Form fields
      username: '',
      password: '',
      showPassword: false,
      remember: false,

      // Registration fields
      isRegistering: false,
      regUsername: '',
      regPassword: '',
      regConfirmPassword: '',
      regDisplayName: '',

      // Errors
      userError: false,
      passwordError: false,
      regUsernameError: false,
      regPasswordError: false,
      regConfirmError: false,

      // UI state
      isSubmitting: false,
      registrationEnabled: false,
      toastMessage: '',
      toastVisible: false,
      toastTimer: null,
    };
  },

  async mounted() {
    // Only a non-sensitive convenience value (the username to pre-fill) is
    // ever stored client-side. Actual login state lives in an httpOnly
    // cookie set by the server, which JS here can't read or forge.
    const saved = localStorage.getItem('hymn_remember_user');
    if (saved) {
      this.username = saved;
      this.remember = true;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/config`);
      if (res.ok) {
        const data = await res.json();
        this.registrationEnabled = data.registrationEnabled === true;
      }
    } catch {
      // Registration stays closed when configuration cannot be verified.
      this.registrationEnabled = false;
    }
  },

  beforeUnmount() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  },

  methods: {
    clearErrors() {
      this.userError = false;
      this.passwordError = false;
      this.regUsernameError = false;
      this.regPasswordError = false;
      this.regConfirmError = false;
    },

    showToast(msg) {
      this.toastMessage = msg;
      this.toastVisible = true;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toastVisible = false;
      }, 2800);
    },

    toggleMode() {
      if (!this.registrationEnabled && !this.isRegistering) return;
      this.isRegistering = !this.isRegistering;
      this.clearErrors();
      this.showPassword = false;
    },

    async onSubmit() {
      this.clearErrors();
      let ok = true;

      if (!this.username.trim()) {
        this.userError = true;
        ok = false;
      }
      if (!this.password.trim()) {
        this.passwordError = true;
        ok = false;
      }

      if (!ok) return;

      this.isSubmitting = true;

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // required so the browser stores/sends the httpOnly session cookie
          body: JSON.stringify({
            username: this.username.trim(),
            password: this.password,
            remember: this.remember,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Login failed');
        }

        // Non-sensitive display info only — NOT the session itself.
        sessionStorage.setItem('hymn_user', JSON.stringify(data.user));

        if (this.remember) {
          localStorage.setItem('hymn_remember_user', this.username.trim());
        } else {
          localStorage.removeItem('hymn_remember_user');
        }

        const next = this.$route.query.next;
        const destination = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
          && this.$router.resolve(next).meta.requiresAuth ? next : '/';
        this.$router.replace(destination);
      } catch (err) {
        this.showToast(err.message || 'Login failed');
      } finally {
        this.isSubmitting = false;
      }
    },

    async onRegister() {
      this.clearErrors();
      let ok = true;

      if (!this.regUsername.trim() || this.regUsername.trim().length < 3) {
        this.regUsernameError = true;
        ok = false;
      }
      if (!this.regPassword.trim() || this.regPassword.length < 10) {
        this.regPasswordError = true;
        ok = false;
      }
      if (this.regPassword !== this.regConfirmPassword) {
        this.regConfirmError = true;
        ok = false;
      }

      if (!ok) return;

      this.isSubmitting = true;

      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: this.regUsername.trim(),
            password: this.regPassword,
            displayName: this.regDisplayName.trim() || this.regUsername.trim(),
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Registration failed');
        }

        this.showToast('Account created! Please sign in.');
        this.isRegistering = false;
        this.username = this.regUsername.trim();
        this.password = '';
        this.regUsername = '';
        this.regPassword = '';
        this.regConfirmPassword = '';
        this.regDisplayName = '';
      } catch (err) {
        this.showToast(err.message || 'Registration failed');
      } finally {
        this.isSubmitting = false;
      }
    },
  },
};
</script>

<template>
  <div class="login-page">
    <!-- Login card -->
    <div class="login-wrap">
      <div class="login-card">
        <div class="logo-area">
          <div class="logo-mark">
            <img src="/Logo1.png" alt="" width="36" height="36">
          </div>
          <span class="logo-name">Hymn</span>
        </div>
        <h1>{{ isRegistering ? 'Create account' : 'Sign in' }}</h1>

        <!-- LOGIN FORM -->
        <form v-if="!isRegistering" @submit.prevent="onSubmit" autocomplete="off">
          <div class="field-group">
            <label class="field-label" for="login-username">Username</label>
            <input
              id="login-username"
              class="field-input"
              :class="{ 'field-input-error': userError }"
              type="text"
              v-model="username"
              placeholder="Enter your username"
              autocomplete="username"
              @input="clearErrors"
            />
            <div v-if="userError" class="field-error">Please enter your username</div>
          </div>

          <div class="field-group">
            <label class="field-label" for="login-password">Password</label>
            <div class="login-password"><input
              id="login-password"
              class="field-input"
              :class="{ 'field-input-error': passwordError }"
              :type="showPassword ? 'text' : 'password'"
              v-model="password"
              placeholder="Enter your password"
              autocomplete="current-password"
              @input="clearErrors"
            /><button type="button" class="link-btn" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button></div>
            <div v-if="passwordError" class="field-error">Password is required</div>
          </div>

          <div class="field-row">
            <label class="remember-wrap">
              <input type="checkbox" v-model="remember" />
              <span class="remember-label">Remember me</span>
            </label>
          </div>

          <button type="submit" class="btn btn-accent" :disabled="isSubmitting">
            {{ isSubmitting ? 'Signing in…' : 'Sign in' }}
          </button>

          <div v-if="registrationEnabled" class="switch-mode">
            <span>Don't have an account?</span>
            <button type="button" class="link-btn" @click="toggleMode">Create one</button>
          </div>
        </form>

        <!-- REGISTER FORM -->
        <form v-else @submit.prevent="onRegister" autocomplete="off">
          <div class="field-group">
            <label class="field-label" for="register-username">Username</label>
            <input
              id="register-username"
              class="field-input"
              :class="{ 'field-input-error': regUsernameError }"
              type="text"
              v-model="regUsername"
              placeholder="Choose a username (min 3 chars)"
              autocomplete="username"
              @input="clearErrors"
            />
            <div v-if="regUsernameError" class="field-error">Username must be at least 3 characters</div>
          </div>

          <div class="field-group">
            <label class="field-label" for="register-display-name">Display name · Optional</label>
            <input
              id="register-display-name"
              class="field-input"
              type="text"
              v-model="regDisplayName"
              placeholder="Your name (optional)"
              autocomplete="name"
            />
          </div>

          <div class="field-group">
            <label class="field-label" for="register-password">Password</label>
            <input
              id="register-password"
              class="field-input"
              :class="{ 'field-input-error': regPasswordError }"
              type="password"
              v-model="regPassword"
              placeholder="Min 10 characters"
              autocomplete="new-password"
              @input="clearErrors"
            />
            <div v-if="regPasswordError" class="field-error">Password must be at least 10 characters</div>
          </div>

          <div class="field-group">
            <label class="field-label" for="register-confirm">Confirm password</label>
            <input
              id="register-confirm"
              class="field-input"
              :class="{ 'field-input-error': regConfirmError }"
              type="password"
              v-model="regConfirmPassword"
              placeholder="Re-enter password"
              autocomplete="new-password"
              @input="clearErrors"
            />
            <div v-if="regConfirmError" class="field-error">Passwords do not match</div>
          </div>

          <button type="submit" class="btn btn-accent" :disabled="isSubmitting">
            {{ isSubmitting ? 'Creating account…' : 'Create account' }}
          </button>

          <div class="switch-mode">
            <span>Already have an account?</span>
            <button type="button" class="link-btn" @click="toggleMode">Sign in</button>
          </div>
        </form>

      </div>
    </div>

    <div v-if="toastVisible" class="login-notice" role="status">{{ toastMessage }}</div>
  </div>
</template>
