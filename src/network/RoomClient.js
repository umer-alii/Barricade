/**
 * Online room networking client — create/join rooms, poll state, send actions.
 */

const SESSION_KEYS = {
  code: 'barricade_room_code',
  token: 'barricade_player_token',
  index: 'barricade_player_index'
};

const POLL_INTERVAL_MS = 800;

export class RoomClient {
  constructor() {
    this.code = null;
    this.playerToken = null;
    this.playerIndex = null;
    this.version = 0;
    this.lastHistoryLength = 0;
    this.status = null;
    this.pollTimer = null;
    this.onStateUpdate = null;
    this.onStatusChange = null;
    this.onError = null;
    this.onOpponentDisconnect = null;
    this._lastOpponentConnected = null;
    this._polling = false;
    this.timeControl = null;
    this.mode = null;
    this.isPrivate = false;
    this.onPollComplete = null;
  }

  get apiBase() {
    return '/api/rooms';
  }

  saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEYS.code, this.code);
      sessionStorage.setItem(SESSION_KEYS.token, this.playerToken);
      sessionStorage.setItem(SESSION_KEYS.index, String(this.playerIndex));
    } catch (_) { /* ignore */ }
  }

  clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEYS.code);
      sessionStorage.removeItem(SESSION_KEYS.token);
      sessionStorage.removeItem(SESSION_KEYS.index);
    } catch (_) { /* ignore */ }
  }

  static loadSession() {
    try {
      const code = sessionStorage.getItem(SESSION_KEYS.code);
      const token = sessionStorage.getItem(SESSION_KEYS.token);
      const index = sessionStorage.getItem(SESSION_KEYS.index);
      if (code && token) {
        return { code, token, playerIndex: parseInt(index, 10) };
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  _trackState(data) {
    if (data?.gameState?.history) {
      this.lastHistoryLength = data.gameState.history.length;
    }
  }

  async createRoom(playerName, timeControl = null, mode = null, isPrivate = false, accessToken = null) {
    const res = await fetch(`${this.apiBase}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, timeControl, mode, isPrivate, accessToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create room');

    this.code = data.code;
    this.playerToken = data.playerToken;
    this.playerIndex = data.playerIndex;
    this.status = data.status;
    this.version = 0;
    this.lastHistoryLength = 0;
    this.timeControl = data.timeControl || timeControl || '15+10 (Rapid)';
    this.mode = data.mode || mode || 'Casual';
    this.isPrivate = !!(data.isPrivate ?? isPrivate);
    this.saveSession();
    this.startPolling();
    return data;
  }

  async joinRoom(code, playerName, existingToken = null, accessToken = null) {
    const res = await fetch(`${this.apiBase}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, playerName, playerToken: existingToken, accessToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to join room');

    this.code = data.code;
    this.playerToken = data.playerToken;
    this.playerIndex = data.playerIndex;
    this.status = data.status;
    this.version = data.version || 0;
    this.timeControl = data.timeControl || '15+10 (Rapid)';
    this.mode = data.mode || 'Casual';
    this.isPrivate = !!data.isPrivate;
    this._trackState(data);
    this.saveSession();
    this.startPolling();
    return data;
  }

  async reconnect() {
    const session = RoomClient.loadSession();
    if (!session) return null;

    this.code = session.code;
    this.playerToken = session.token;
    this.playerIndex = session.playerIndex;

    const data = await this.poll({ silent: true });
    if (data) {
      this.saveSession();
      this.startPolling();
    }
    return data;
  }

  async poll(options = {}) {
    const silent = options.silent === true;
    if (!this.code || !this.playerToken || this._polling) return null;
    this._polling = true;

    try {
      const params = new URLSearchParams({ code: this.code, token: this.playerToken });
      const res = await fetch(`${this.apiBase}/poll?${params}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404 || res.status === 403) {
          this.disconnect();
          if (!silent && this.onError) {
            this.onError(data.error || 'Room session expired');
          }
          return null;
        }
        throw new Error(data.error || 'Poll failed');
      }

      this._handlePollData(data);
      return data;
    } catch (err) {
      if (this.onError) this.onError(err.message);
      return null;
    } finally {
      this._polling = false;
    }
  }

  _shouldApplyState(data) {
    if (!data.gameState) return false;
    const serverHistoryLen = data.gameState.history?.length ?? 0;
    return (
      data.version !== this.version ||
      serverHistoryLen !== this.lastHistoryLength
    );
  }

  _handlePollData(data) {
    const prevStatus = this.status;
    this.status = data.status;
    this.timeControl = data.timeControl || '15+10 (Rapid)';
    this.mode = data.mode || 'Casual';
    this.isPrivate = !!data.isPrivate;

    if (prevStatus !== data.status && this.onStatusChange) {
      this.onStatusChange(data.status, data);
    }

    const opponent = data.players?.find(p => p && p.index !== this.playerIndex);
    if (opponent) {
      if (this._lastOpponentConnected === true && !opponent.connected && this.onOpponentDisconnect) {
        this.onOpponentDisconnect();
      }
      this._lastOpponentConnected = opponent.connected;
    }

    if (this._shouldApplyState(data)) {
      this.version = data.version;
      this._trackState(data);
      if (this.onStateUpdate) {
        this.onStateUpdate(data.gameState, data);
      }
    }

    if (this.onPollComplete) {
      this.onPollComplete(data);
    }
  }

  async sendAction(action) {
    if (!this.code || !this.playerToken) {
      throw new Error('Not connected to a room');
    }

    const params = new URLSearchParams({ code: this.code });
    const res = await fetch(`${this.apiBase}/action?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this.playerToken, action })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Action failed');
    }

    if (data.gameState) {
      const prevStatus = this.status;
      this.version = data.version;
      this._trackState(data);
      this.status = data.status;
      if (prevStatus !== data.status && this.onStatusChange) {
        this.onStatusChange(data.status, data);
      }
      if (this.onStateUpdate) {
        this.onStateUpdate(data.gameState, data);
      }
    }

    if (this.onPollComplete) {
      this.onPollComplete(data);
    }

    return data;
  }

  startPolling() {
    this.stopPolling();
    this.poll(); // immediate first poll
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  disconnect() {
    this.stopPolling();
    this.clearSession();
    this.code = null;
    this.playerToken = null;
    this.playerIndex = null;
    this.version = 0;
    this.lastHistoryLength = 0;
    this.status = null;
    this.timeControl = null;
    this.mode = null;
    this.isPrivate = false;
    this._lastOpponentConnected = null;
  }

  async cancelRoom() {
    if (!this.code || !this.playerToken) return;
    try {
      await fetch(`${this.apiBase}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: this.code, token: this.playerToken })
      });
    } catch (_) { /* ignore */ }
    this.disconnect();
  }

  isConnected() {
    return !!(this.code && this.playerToken);
  }
}
