/**
 * Friends card in the lobby: my player ID, add-by-ID, incoming/outgoing
 * requests, live friends list with Chat + Invite actions.
 */

import {
  searchByPlayerId, sendFriendRequest, acceptFriendRequest,
  removeFriendship, listRelationships, subscribeFriendships
} from '../social/Friends.js';
import { isLoggedIn, getProfile } from '../network/SupabaseClient.js';

export class FriendsUI {
  /**
   * @param {object} opts
   * @param {object} opts.toast          Toast instance
   * @param {function} opts.onChat       (friendProfile) => void
   * @param {function} opts.onInvite     (friendProfile) => void
   */
  constructor({ toast, onChat, onInvite }) {
    this.toast = toast;
    this.onChat = onChat;
    this.onInvite = onInvite;
    this._unsubscribe = null;

    document.getElementById('friend-add-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this._handleAdd();
    });
    document.getElementById('friend-add-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleAdd();
    });

    document.addEventListener('barricade:auth-changed', (e) => {
      if (e.detail.loggedIn && e.detail.profile) this.start();
      else this.stop();
    });
  }

  async start() {
    await this.refresh();
    if (!this._unsubscribe) {
      this._unsubscribe = await subscribeFriendships(() => this.refresh());
    }
  }

  stop() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  async _handleAdd() {
    const input = document.getElementById('friend-add-input');
    const pid = input?.value?.trim().toUpperCase();
    if (!pid || pid.length !== 6) {
      this.toast.show('Enter a 6-character player ID (e.g. AB12CD).');
      return;
    }
    if (pid === getProfile()?.player_id) {
      this.toast.show("That's your own player ID!");
      return;
    }
    try {
      const target = await searchByPlayerId(pid);
      if (!target) {
        this.toast.show('No player found with that ID.');
        return;
      }
      await sendFriendRequest(target.id);
      this.toast.show(`Friend request sent to ${target.username}!`);
      if (input) input.value = '';
      this.refresh();
    } catch (err) {
      this.toast.show(err.message || 'Failed to send request.');
    }
  }

  async refresh() {
    if (!isLoggedIn()) return;
    const { friends, incoming, outgoing } = await listRelationships();
    this._renderRequests(incoming, outgoing);
    this._renderFriends(friends);
  }

  _renderRequests(incoming, outgoing) {
    const section = document.getElementById('friend-requests-section');
    const list = document.getElementById('friend-requests-list');
    if (!section || !list) return;

    const hasAny = incoming.length > 0 || outgoing.length > 0;
    section.classList.toggle('hidden', !hasAny);
    list.innerHTML = '';
    if (!hasAny) return;

    for (const req of incoming) {
      const row = this._row(req.profile);
      const actions = document.createElement('div');
      actions.className = 'friend-actions';
      actions.append(
        this._btn('✓', 'Accept', async () => {
          await acceptFriendRequest(req.friendshipId);
          this.toast.show(`You are now friends with ${req.profile.username}!`);
        }),
        this._btn('✕', 'Decline', () => removeFriendship(req.friendshipId))
      );
      row.appendChild(actions);
      list.appendChild(row);
    }

    for (const req of outgoing) {
      const row = this._row(req.profile, 'sent');
      const actions = document.createElement('div');
      actions.className = 'friend-actions';
      actions.appendChild(this._btn('✕', 'Cancel request', () => removeFriendship(req.friendshipId)));
      row.appendChild(actions);
      list.appendChild(row);
    }
  }

  _renderFriends(friends) {
    const list = document.getElementById('friends-list');
    if (!list) return;
    list.innerHTML = '';

    if (friends.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'friends-empty';
      empty.textContent = 'No friends yet — share your player ID above.';
      list.appendChild(empty);
      return;
    }

    for (const friend of friends) {
      const row = this._row(friend.profile);
      const actions = document.createElement('div');
      actions.className = 'friend-actions';
      actions.append(
        this._btn('💬', 'Chat', () => this.onChat?.(friend.profile)),
        this._btn('⚔️', 'Invite to game', () => this.onInvite?.(friend.profile)),
        this._btn('🗑', 'Remove friend', () => {
          if (confirm(`Remove ${friend.profile.username} from your friends?`)) {
            removeFriendship(friend.friendshipId);
          }
        })
      );
      row.appendChild(actions);
      list.appendChild(row);
    }
  }

  _row(profile, badge = null) {
    const row = document.createElement('div');
    row.className = 'friend-row';

    const avatar = document.createElement('span');
    avatar.className = 'friend-avatar';
    avatar.textContent = (profile?.username || '?').charAt(0).toUpperCase();

    const info = document.createElement('div');
    info.className = 'friend-info';
    const name = document.createElement('span');
    name.className = 'friend-name';
    name.textContent = profile?.username || 'Unknown';
    const meta = document.createElement('span');
    meta.className = 'friend-meta';
    meta.textContent = badge === 'sent'
      ? 'Request sent…'
      : `${profile?.player_id || ''} · ${profile?.elo_rating ?? '—'}`;
    info.append(name, meta);

    row.append(avatar, info);
    return row;
  }

  _btn(icon, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'friend-action-btn';
    btn.title = title;
    btn.textContent = icon;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try {
        await onClick();
        this.refresh();
      } catch (err) {
        this.toast.show(err.message || 'Action failed.');
      } finally {
        btn.disabled = false;
      }
    });
    return btn;
  }
}
