/**
 * Chat drawer (bottom-right): one conversation at a time — either a DM with
 * a friend, or the current match room's chat. Realtime, independent of the
 * game-state polling loop.
 */

import {
  sendDirectMessage, fetchDirectMessages, subscribeDirectMessages,
  sendRoomMessage, fetchRoomMessages, subscribeRoomMessages,
  MAX_MESSAGE_LENGTH
} from '../social/Chat.js';
import { isLoggedIn, getUserId } from '../network/SupabaseClient.js';

export class ChatUI {
  constructor(toast) {
    this.toast = toast;
    this.drawer = document.getElementById('chat-drawer');
    this.messagesEl = document.getElementById('chat-messages');
    this.titleEl = document.getElementById('chat-title');
    this.inputEl = document.getElementById('chat-input');
    this.fab = document.getElementById('chat-fab');
    this.fabBadge = document.getElementById('chat-fab-badge');

    // Active conversation: { kind: 'dm', friend } | { kind: 'room', code, resolveName }
    this.conversation = null;
    this._unsubConversation = null;
    this._unsubGlobalDm = null;
    this._unread = 0;
    this._lastDmFriend = null;

    if (this.inputEl) this.inputEl.maxLength = MAX_MESSAGE_LENGTH;

    document.getElementById('chat-send-btn')?.addEventListener('click', () => this._send());
    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._send();
      }
    });
    document.getElementById('chat-close-btn')?.addEventListener('click', () => this.closeDrawer());
    this.fab?.addEventListener('click', () => {
      if (this.conversation) this._showDrawer();
      else if (this._lastDmFriend) this.openDirect(this._lastDmFriend);
    });

    document.addEventListener('barricade:auth-changed', (e) => {
      if (e.detail.loggedIn) this._startGlobalDmFeed();
      else this._teardownAll();
    });
  }

  /** Open a 1:1 conversation with a friend. */
  async openDirect(friendProfile) {
    if (!isLoggedIn()) return;
    await this._setConversation({ kind: 'dm', friend: friendProfile });
    this.titleEl.textContent = `💬 ${friendProfile.username}`;
    const history = await fetchDirectMessages(friendProfile.id);
    this._renderHistory(history);
    this._lastDmFriend = friendProfile;
  }

  /**
   * Pre-bind the chat channel for an online match room. Doesn't force the
   * drawer open — the floating chat button appears and the player opts in.
   */
  async openRoom(roomCode) {
    if (!isLoggedIn()) return;
    if (this.conversation?.kind === 'room' && this.conversation.code === roomCode) return;
    await this._setConversation({ kind: 'room', code: roomCode });
    this.titleEl.textContent = `💬 Room ${roomCode}`;
    const history = await fetchRoomMessages(roomCode);
    this._renderHistory(history, false);
    this.showFab();
  }

  /** Leave the current room conversation (match ended / left room). */
  closeRoom() {
    if (this.conversation?.kind === 'room') {
      this._clearConversation();
      this.closeDrawer();
      this.hideFab();
    }
  }

  closeDrawer() {
    this.drawer?.classList.add('hidden');
  }

  showFab() {
    if (isLoggedIn()) this.fab?.classList.remove('hidden');
  }

  hideFab() {
    this.fab?.classList.add('hidden');
    this._setUnread(0);
  }

  // ─── internal ──────────────────────────────────────────────────────────────

  async _setConversation(conv) {
    this._clearConversation();
    this.conversation = conv;
    if (this.messagesEl) this.messagesEl.innerHTML = '';

    if (conv.kind === 'room') {
      this._unsubConversation = await subscribeRoomMessages(conv.code, (msg) => {
        if (msg.sender_id === getUserId()) return; // own messages echoed locally
        this._appendMessage(msg);
        this._notifyIfHidden();
      });
    }
    // DMs arrive via the global feed (_startGlobalDmFeed)
  }

  _clearConversation() {
    if (this._unsubConversation) {
      this._unsubConversation();
      this._unsubConversation = null;
    }
    this.conversation = null;
  }

  async _startGlobalDmFeed() {
    if (this._unsubGlobalDm) return;
    this._unsubGlobalDm = await subscribeDirectMessages((msg) => {
      const conv = this.conversation;
      if (conv?.kind === 'dm' && msg.sender_id === conv.friend.id) {
        this._appendMessage(msg);
        this._notifyIfHidden();
      } else {
        this.toast.show('💬 New message from a friend — open Friends to reply.');
      }
    });
  }

  _teardownAll() {
    this._clearConversation();
    if (this._unsubGlobalDm) {
      this._unsubGlobalDm();
      this._unsubGlobalDm = null;
    }
    this.closeDrawer();
    this.hideFab();
    this._lastDmFriend = null;
  }

  async _send() {
    const conv = this.conversation;
    const text = this.inputEl?.value?.trim();
    if (!conv || !text) return;
    try {
      if (conv.kind === 'dm') await sendDirectMessage(conv.friend.id, text);
      else await sendRoomMessage(conv.code, text);
      this._appendMessage({
        sender_id: getUserId(),
        content: text,
        created_at: new Date().toISOString()
      });
      if (this.inputEl) this.inputEl.value = '';
    } catch (err) {
      this.toast.show(err.message || 'Failed to send message.');
    }
  }

  _renderHistory(messages, show = true) {
    if (!this.messagesEl) return;
    this.messagesEl.innerHTML = '';
    for (const msg of messages) this._appendMessage(msg, false);
    this._scrollToBottom();
    if (show) this._showDrawer();
  }

  _appendMessage(msg, scroll = true) {
    if (!this.messagesEl) return;
    const mine = msg.sender_id === getUserId();
    const row = document.createElement('div');
    row.className = `chat-msg ${mine ? 'chat-msg-mine' : 'chat-msg-theirs'}`;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = msg.content;

    const time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = new Date(msg.created_at)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.append(bubble, time);
    this.messagesEl.appendChild(row);
    if (scroll) this._scrollToBottom();
  }

  _scrollToBottom() {
    if (this.messagesEl) this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  _showDrawer() {
    this.drawer?.classList.remove('hidden');
    this._setUnread(0);
    this.inputEl?.focus();
  }

  _notifyIfHidden() {
    if (this.drawer?.classList.contains('hidden')) {
      this._setUnread(this._unread + 1);
    }
  }

  _setUnread(count) {
    this._unread = count;
    if (this.fabBadge) {
      this.fabBadge.textContent = count > 9 ? '9+' : String(count);
      this.fabBadge.classList.toggle('hidden', count === 0);
    }
  }
}
