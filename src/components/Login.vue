<script>
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
      toastMessage: '',
      toastVisible: false,
      toastTimer: null,
    };
  },

  mounted() {
    this.generateParticles();
    // Only a non-sensitive convenience value (the username to pre-fill) is
    // ever stored client-side. Actual login state lives in an httpOnly
    // cookie set by the server, which JS here can't read or forge.
    const saved = localStorage.getItem('hymn_remember_user');
    if (saved) {
      this.username = saved;
      this.remember = true;
    }
  },

  beforeUnmount() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  },

  methods: {
    generateParticles() {
      const container = this.$refs.particles;
      if (!container) return;
      container.innerHTML = '';
      for (let i = 0; i < 18; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = 2 + Math.random() * 4;
        p.style.cssText = `
          width: ${size}px; height: ${size}px;
          left: ${Math.random() * 100}%;
          animation-duration: ${12 + Math.random() * 16}s;
          animation-delay: ${Math.random() * -20}s;
          opacity: ${0.3 + Math.random() * 0.4};
        `;
        container.appendChild(p);
      }
    },

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
      this.isRegistering = !this.isRegistering;
      this.clearErrors();
      this.$nextTick(() => {
        this.generateParticles();
      });
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

        this.$router.push('/');
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
      if (!this.regPassword.trim() || this.regPassword.length < 6) {
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
    <!-- Background layers -->
    <div class="bg-gradient"></div>
    <div class="glare"></div>
    <div class="noise"></div>
    <div class="particles" ref="particles"></div>

    <!-- Login card -->
    <div class="login-wrap">
      <div class="login-card">
        <div class="logo-area">
          <div class="logo-mark">
            <img src="/Logo.png" alt="Hymn Logo" width="28" height="28" class="rounded-md"/> 
          </div>
          <span class="logo-name">Hymn</span>
        </div>
        <p class="tagline">TOP-Multimedia Songs and Schedules</p>

        <!-- LOGIN FORM -->
        <form v-if="!isRegistering" @submit.prevent="onSubmit" autocomplete="off">
          <div class="field-group">
            <div class="field-label">Username</div>
            <input
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
            <div class="field-label">Password</div>
            <input
              class="field-input"
              :class="{ 'field-input-error': passwordError }"
              type="password"
              v-model="password"
              placeholder="Enter your password"
              autocomplete="current-password"
              @input="clearErrors"
            />
            <div v-if="passwordError" class="field-error">Password is required</div>
          </div>

          <div class="field-row">
            <label class="remember-wrap">
              <input type="checkbox" v-model="remember" />
              <span class="remember-label">Remember me</span>
            </label>
            <a href="#" class="forgot-link">Forgot password?</a>
          </div>

          <button type="submit" class="btn btn-accent" :disabled="isSubmitting">
            {{ isSubmitting ? 'Signing in…' : 'Sign In' }}
          </button>

          <div class="switch-mode">
            <span>Don't have an account?</span>
            <button type="button" class="link-btn" @click="toggleMode">Create one</button>
          </div>
        </form>

        <!-- REGISTER FORM -->
        <form v-else @submit.prevent="onRegister" autocomplete="off">
          <div class="field-group">
            <div class="field-label">Username *</div>
            <input
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
            <div class="field-label">Display Name</div>
            <input
              class="field-input"
              type="text"
              v-model="regDisplayName"
              placeholder="Your name (optional)"
              autocomplete="name"
            />
          </div>

          <div class="field-group">
            <div class="field-label">Password *</div>
            <input
              class="field-input"
              :class="{ 'field-input-error': regPasswordError }"
              type="password"
              v-model="regPassword"
              placeholder="Min 6 characters"
              autocomplete="new-password"
              @input="clearErrors"
            />
            <div v-if="regPasswordError" class="field-error">Password must be at least 6 characters</div>
          </div>

          <div class="field-group">
            <div class="field-label">Confirm Password *</div>
            <input
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
            {{ isSubmitting ? 'Creating account…' : 'Create Account' }}
          </button>

          <div class="switch-mode">
            <span>Already have an account?</span>
            <button type="button" class="link-btn" @click="toggleMode">Sign in</button>
          </div>
        </form>

      </div>
    </div>

    <div class="toast" :class="{ show: toastVisible }">{{ toastMessage }}</div>
  </div>
</template>