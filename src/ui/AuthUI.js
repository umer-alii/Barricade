/**
 * Auth modal + lobby profile card account state.
 *
 * Views inside #auth-modal: signin | register | reset | username (first-login
 * username picker). Also renders the signed-in / signed-out state of the
 * lobby profile card and exposes requireLogin() for ranked/friends/chat gating.
 */

import { isSupabaseConfigured } from '../config/supabaseConfig.js';
import {
  initAuth, onAuthChange, isLoggedIn, getProfile, getSession,
  signInEmail, signUpEmail, signInOAuth, sendPasswordReset, signOut,
  createMyProfile, updateMyUsername
} from '../network/SupabaseClient.js';
import { tierForRating } from '../social/Leaderboard.js';

export class AuthUI {
  constructor(toast) {
    this.toast = toast;
    this.modal = document.getElementById('auth-modal');
    this.errorEl = document.getElementById('auth-error');
    this._wireModal();
    this._wireProfileCard();
  }

  /** Start session restore; resolves when initial auth state is known. */
  async init() {
    if (!isSupabaseConfigured()) {
      this.renderAccountState();
      return;
    }
    onAuthChange(() => this.renderAccountState());
    await initAuth();
    // First login without a profile row → force the username picker
    if (isLoggedIn() && !getProfile()) {
      this.open('username');
    }
  }

  /** Gate an action behind login. Returns true if logged in with a profile. */
  requireLogin(message) {
    if (!isSupabaseConfigured()) {
      this.toast.show('Accounts are not configured on this deployment.');
      return false;
    }
    if (isLoggedIn() && getProfile()) return true;
    if (message) this.toast.show(message);
    this.open(isLoggedIn() ? 'username' : 'signin');
    return false;
  }

  open(view = 'signin') {
    this._showView(view);
    this._setError('');
    this.modal?.classList.remove('hidden');
  }

  close() {
    this.modal?.classList.add('hidden');
  }

  // ─── internal ──────────────────────────────────────────────────────────────

  _showView(view) {
    this.modal?.querySelectorAll('[data-auth-view]').forEach(el => {
      el.classList.toggle('hidden', el.dataset.authView !== view);
    });
    this.modal?.querySelectorAll('.auth-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.target === view);
    });
  }

  _setError(msg) {
    if (!this.errorEl) return;
    this.errorEl.textContent = msg || '';
    this.errorEl.classList.toggle('hidden', !msg);
  }

  async _busy(btn, fn) {
    this._setError('');
    if (btn) btn.disabled = true;
    try {
      await fn();
    } catch (err) {
      this._setError(err.message || 'Something went wrong');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _wireModal() {
    if (!this.modal) return;

    document.getElementById('auth-close-btn')?.addEventListener('click', () => {
      // Don't let users dismiss the username picker while profile is missing
      if (isLoggedIn() && !getProfile()) return;
      this.close();
    });

    this.modal.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => this._showView(tab.dataset.target));
    });
    this.modal.querySelectorAll('[data-auth-goto]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this._showView(link.dataset.authGoto);
      });
    });

    document.getElementById('auth-signin-btn')?.addEventListener('click', (e) => {
      this._busy(e.currentTarget, async () => {
        const email = document.getElementById('auth-signin-email')?.value?.trim();
        const password = document.getElementById('auth-signin-password')?.value;
        if (!email || !password) throw new Error('Enter your email and password');
        await signInEmail(email, password);
        this.close();
        this.toast.show('Signed in!');
        if (!getProfile()) this.open('username');
      });
    });

    document.getElementById('auth-register-btn')?.addEventListener('click', (e) => {
      this._busy(e.currentTarget, async () => {
        const email = document.getElementById('auth-register-email')?.value?.trim();
        const password = document.getElementById('auth-register-password')?.value;
        if (!email || !password) throw new Error('Enter an email and password');
        if (password.length < 8) throw new Error('Password must be at least 8 characters');
        const data = await signUpEmail(email, password);
        if (data.session) {
          this.open('username');
        } else {
          this.close();
          this.toast.show('Check your email to verify your account, then sign in.');
        }
      });
    });

    document.getElementById('auth-reset-btn')?.addEventListener('click', (e) => {
      this._busy(e.currentTarget, async () => {
        const email = document.getElementById('auth-reset-email')?.value?.trim();
        if (!email) throw new Error('Enter your email');
        await sendPasswordReset(email);
        this.close();
        this.toast.show('Password reset email sent.');
      });
    });

    this.modal.querySelectorAll('[data-oauth]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._busy(btn, () => signInOAuth(btn.dataset.oauth));
      });
    });

    document.getElementById('auth-username-btn')?.addEventListener('click', (e) => {
      this._busy(e.currentTarget, async () => {
        const username = document.getElementById('auth-username-input')?.value?.trim();
        if (!username || username.length < 2 || username.length > 16) {
          throw new Error('Username must be 2-16 characters');
        }
        await createMyProfile(username);
        this.close();
        this.toast.show(`Welcome, ${username}!`);
      });
    });
  }

  _wireProfileCard() {
    document.getElementById('btn-account-signin')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.open('signin');
    });
    document.getElementById('btn-account-signout')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await signOut();
      this.toast.show('Signed out.');
    });
    document.getElementById('my-player-id')?.addEventListener('click', () => {
      const pid = getProfile()?.player_id;
      if (pid) {
        navigator.clipboard?.writeText(pid);
        this.toast.show('Player ID copied!');
      }
    });
  }

  /**
   * Rename via the existing pencil-edit flow when signed in.
   * Returns true if handled (DB update), false → caller falls back to localStorage.
   */
  async saveUsername(username) {
    if (!isLoggedIn() || !getProfile()) return false;
    await updateMyUsername(username);
    return true;
  }

  /** Sync the lobby profile card with the current auth/profile state. */
  renderAccountState() {
    const profile = getProfile();
    const loggedIn = isLoggedIn();

    const signinBtn = document.getElementById('btn-account-signin');
    const signoutBtn = document.getElementById('btn-account-signout');
    const idBadge = document.getElementById('my-player-id');
    const ratingEl = document.getElementById('profile-rating-display');
    const friendsCard = document.getElementById('friends-card');
    const configured = isSupabaseConfigured();

    signinBtn?.classList.toggle('hidden', !configured || loggedIn);
    signoutBtn?.classList.toggle('hidden', !loggedIn);
    friendsCard?.classList.toggle('hidden', !(loggedIn && profile));

    if (idBadge) {
      idBadge.classList.toggle('hidden', !profile);
      if (profile) idBadge.textContent = `ID: ${profile.player_id}`;
    }

    if (profile) {
      const nameEl = document.getElementById('profile-name-display');
      const avatarEl = document.getElementById('profile-avatar-display');
      if (nameEl) nameEl.textContent = profile.username;
      if (avatarEl) avatarEl.textContent = profile.username.charAt(0).toUpperCase();
      if (ratingEl) {
        const tier = tierForRating(profile.elo_rating);
        ratingEl.textContent = `${tier.icon} ${profile.elo_rating} · ${tier.name}`;
      }
      const w = document.getElementById('stats-wins');
      const l = document.getElementById('stats-losses');
      const r = document.getElementById('stats-ratio');
      if (w) w.textContent = profile.wins;
      if (l) l.textContent = profile.losses;
      const total = profile.wins + profile.losses;
      if (r) r.textContent = total > 0 ? `${Math.round((profile.wins / total) * 100)}%` : '0%';
    } else if (ratingEl) {
      ratingEl.textContent = loggedIn ? 'Pick a username to finish setup' : 'Rating: — (guest)';
    }

    document.dispatchEvent(new CustomEvent('barricade:auth-changed', {
      detail: { loggedIn, profile, session: getSession() }
    }));
  }
}
