/**
 * Game Controller Class (MVC Orchestrator)
 */

import { GameState } from './GameState.js';
import { TurnManager } from './TurnManager.js';
import { Board } from '../board/Board.js';
import { Renderer } from '../board/Renderer.js';
import { Sidebar } from '../ui/Sidebar.js';
import { Toast } from '../ui/Toast.js';
import { MoveHistory } from '../ui/MoveHistory.js';
import { DragPreview } from '../ui/DragPreview.js';
import { MouseController } from '../input/MouseController.js';
import { DragController } from '../input/DragController.js';
import { validateWall } from '../walls/WallValidator.js';
import { getLegalMoves } from '../players/Movement.js';
import { getBestMove } from '../players/Bot.js';
import { cellToNotation, wallToNotation, notationToCell, notationToWall } from '../utils/Coordinates.js';
import { WALL_ORIENTATIONS, TOAST_MESSAGES } from '../utils/Constants.js';
import { RoomClient } from '../network/RoomClient.js';
import { formatClock, formatTimeControlLabel, getDisplayClocks } from '../utils/timeControl.js';
import { getDailyPuzzles, formatPuzzleDate, PUZZLES_PER_DAY } from '../puzzle/PuzzleGenerator.js';
import { replayHistory, applyNotationMove } from '../puzzle/PuzzleEngine.js';
import { getProgressForDate, recordAttempt, recordGiveUp, countCompleted } from '../puzzle/PuzzleProgress.js';
import { isSupabaseConfigured } from '../config/supabaseConfig.js';
import { isLoggedIn, getProfile, getAccessToken, fetchMyProfile } from '../network/SupabaseClient.js';
import { fetchLeaderboard, subscribeLeaderboard, tierForRating, LEADERBOARD_PAGE_SIZE } from '../social/Leaderboard.js';
import { sendDirectMessage } from '../social/Chat.js';
import { AuthUI } from '../ui/AuthUI.js';
import { FriendsUI } from '../ui/FriendsUI.js';
import { ChatUI } from '../ui/ChatUI.js';

export class Game {
  constructor() {
    this.gameState = new GameState();
    this.turnManager = new TurnManager();
    this.board = new Board();

    // Core UI modules
    this.renderer = new Renderer('board');
    this.dragPreview = new DragPreview(this.renderer.container);
    this.toast = new Toast('toast-container');
    this.moveHistoryUI = new MoveHistory('move-history-list');

    // Sidebar bindings
    this.sidebar = new Sidebar({
      onRestart: () => {
        if (this.isGameInProgress()) {
          this.showConfirm(
            "Restart Match?",
            "Are you sure you want to restart this match? All current progress will be lost.",
            () => this.restartGame()
          );
        } else {
          this.restartGame();
        }
      },
      onResign: () => {
        if (this.gameState.winner !== null) return;
        this.showConfirm(
          "Resign Match?",
          "Are you sure you want to resign from the match?",
          () => this.resignActivePlayer()
        );
      },
      onLobby: () => {
        if (this.isGameInProgress()) {
          this.showConfirm(
            "Return to Lobby?",
            "Are you sure you want to return to the Lobby? Your current game progress will be lost.",
            () => this.showLobby()
          );
        } else {
          this.showLobby();
        }
      },
      onUndo: () => {
        this.undoMoves();
      }
    });

    // Input handlers
    this.mouseController = new MouseController(this, this.renderer);
    this.dragController = new DragController(this, this.renderer, this.dragPreview);

    // Modal declarations
    this.winModal = document.getElementById('win-modal');
    this.winMessage = document.getElementById('win-message');
    this.winRestartBtn = document.getElementById('win-restart-btn');

    this.confirmModal = document.getElementById('confirm-modal');
    this.confirmTitle = document.getElementById('confirm-title');
    this.confirmMessage = document.getElementById('confirm-message');

    this.botTimeoutId = null; // ID of scheduled AI turn timeout
    this.roomClient = new RoomClient();
    this._onlineActionPending = false;
    this._clockTickTimer = null;
    this.puzzleSession = null;

    this.initModalEvents();
    this.initVsComputerModal();
    this.initLobbyEvents();
    this.initPuzzleEvents();
    this.initAccountFeatures();
    this.initThemeEvents();
    this._bindLayoutResize();
    this._bindPageSave();

    // Auto-restore any active match on page refresh
    this.loadStateFromStorage();
    this.tryReconnectOnline();

    // Bind your-room-card copy and leave buttons
    document.getElementById('btn-copy-invite')?.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('your-room-invite-input');
      if (input) {
        navigator.clipboard.writeText(input.value).then(() => {
          this.toast.show('Invite link copied!');
        }).catch(() => {
          this.toast.show('Could not copy automatically.');
        });
      }
    });

    document.getElementById('btn-leave-room')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (this.roomClient.isConnected()) {
        await this.roomClient.cancelRoom();
      } else {
        this.roomClient.disconnect();
      }
      this.showLobby();
    });

    // Handle join-by-URL parameter ?room=CODE
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam && !localStorage.getItem('barricade_game_state_v1') && !RoomClient.loadSession()) {
      // Clear URL parameter so refreshing doesn't keep trying to join
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      this.handleJoinRoom(roomParam.toUpperCase());
    }
  }

  /**
   * Returns true if the local player can act right now.
   */
  isLocalPlayerTurn() {
    if (this.gameState.winner !== null) return false;
    if (this.gameState.gameMode === 'local') return true;
    if (this.isPuzzleMode()) {
      return !this.puzzleSession?.locked
        && this.gameState.currentPlayer === this.gameState.humanPlayerIndex;
    }
    return this.gameState.currentPlayer === this.gameState.humanPlayerIndex;
  }

  isPuzzleMode() {
    return this.gameState.gameMode === 'puzzle';
  }

  /**
   * Returns true if the game is in online multiplayer mode.
   */
  isOnlineMode() {
    return this.gameState.gameMode === 'online';
  }

  /**
   * Re-cache board geometry after viewport/orientation changes.
   */
  _bindLayoutResize() {
    this._resizeTimer = null;
    const refreshLayout = () => {
      if (!this.renderer?.container) return;
      if (this.mouseController) {
        this.mouseController.cellRects = [];
        this.mouseController.cacheGrid();
      }
      if (this.dragController) {
        this.dragController.cacheIntersections();
      }
    };
    const scheduleRefresh = () => {
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(refreshLayout, 120);
    };
    window.addEventListener('resize', scheduleRefresh);
    window.addEventListener('orientationchange', scheduleRefresh);
  }

  _bindPageSave() {
    const save = () => {
      if (this.isPuzzleMode()) this.saveStateToStorage();
    };
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
  }

  /**
   * Drop stale online room session (puzzle mode only).
   */
  _clearOnlineSession() {
    if (this.roomClient.isConnected() || RoomClient.loadSession()) {
      this.roomClient.disconnect();
    }
  }

  /**
   * Attempt to reconnect to an online room after page refresh.
   */
  async tryReconnectOnline() {
    // Puzzle uses localStorage restore — don't let a stale room token hijack it
    if (this.gameState.gameMode === 'puzzle') {
      this._clearOnlineSession();
      return;
    }

    const session = RoomClient.loadSession();
    if (!session) {
      this.startLobbyPolling();
      return;
    }
    if (this.gameState.gameMode === 'online') return;

    this.roomClient.onStateUpdate = (state) => this.applyOnlineState(state);
    this.roomClient.onStatusChange = (status, data) => this.handleOnlineStatusChange(status, data);
    this.roomClient.onError = (msg) => {
      if (msg) this.toast.show(msg);
    };
    this.roomClient.onOpponentDisconnect = () => {
      this.toast.show('Opponent disconnected. Waiting for reconnection...');
    };

    try {
      const data = await this.roomClient.reconnect();
      if (!data) {
        this.startLobbyPolling();
        return;
      }

      this.gameState.gameMode = 'online';
      this.gameState.humanPlayerIndex = this.roomClient.playerIndex;
      this.gameState.roomCode = this.roomClient.code;

      if (data.status === 'playing' && data.gameState) {
        this.gameState.applyServerState(data.gameState);
        this.hideLobby();
        this.hideOnlinePanels();
        this.board.init();
        this.renderer.init();
        this.updateBoardOrientation();
        if (this.dragPreview) this.dragPreview.reappend(this.renderer.container);
        this.updateUI();
        this.showRoomCodeBadge();
        this.startClockTick();
        this._openRoomChat();
      } else if (data.status === 'waiting') {
        this.showWaitingRoom(this.roomClient.code);
        this.startLobbyPolling();
      }
    } catch (_) {
      this.roomClient.disconnect();
      this.startLobbyPolling();
    }
  }

  /**
   * Evaluates if a match is actively in progress
   * @returns {boolean}
   */
  isGameInProgress() {
    if (this.gameState.winner !== null) return false;
    if (this.gameState.history.length > 0) return true;
    if (this.gameState.horizontalWalls.length > 0 || this.gameState.verticalWalls.length > 0) return true;

    const p1 = this.gameState.players[0];
    const p2 = this.gameState.players[1];
    if (p1.col !== 4 || p1.row !== 0) return true;
    if (p2.col !== 4 || p2.row !== 8) return true;

    return false;
  }

  /**
   * Bind event listeners for Light/Dark theme switching
   */
  initThemeEvents() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        themeToggleBtn.textContent = isLight ? '☀️' : '🌙';
      });
    }
  }

  /**
   * Bind event listeners to modal actions
   */
  initModalEvents() {
    if (this.winRestartBtn) {
      this.winRestartBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (this.isOnlineMode()) {
          this.winRestartBtn.disabled = true;
          this.winRestartBtn.textContent = 'Waiting...';
          try {
            await this.roomClient.sendAction({ type: 'rematch' });
          } catch (err) {
            this.toast.show(err.message || 'Rematch request failed');
            this.winRestartBtn.disabled = false;
            this.winRestartBtn.textContent = 'Rematch';
          }
        } else {
          this.hideWinModal();
          this.restartGame();
        }
      });
    }
    const winLobbyBtn = document.getElementById('win-lobby-btn');
    if (winLobbyBtn) {
      winLobbyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.hideWinModal();
        this.showLobby();
      });
    }
  }

  /**
   * Bind event listeners for the vs Computer setup modal
   */
  initVsComputerModal() {
    const modal = document.getElementById('vs-computer-modal');
    const p1Btn = document.getElementById('vs-computer-p1');
    const p2Btn = document.getElementById('vs-computer-p2');
    const diffBtns = modal?.querySelectorAll('.modal-difficulty-options .modal-option-btn');
    const cancelBtn = document.getElementById('vs-computer-cancel-btn');
    const startBtn = document.getElementById('vs-computer-start-btn');

    if (!modal) return;

    let selectedSide = 'red';
    let selectedDiff = 'medium';

    // Handle starting player toggles
    p1Btn?.addEventListener('click', (e) => {
      e.preventDefault();
      p1Btn.classList.add('active');
      p2Btn?.classList.remove('active');
      selectedSide = 'red';
    });

    p2Btn?.addEventListener('click', (e) => {
      e.preventDefault();
      p2Btn.classList.add('active');
      p1Btn?.classList.remove('active');
      selectedSide = 'blue';
    });

    // Handle difficulty selections
    diffBtns?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        diffBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedDiff = btn.dataset.diff || 'medium';
      });
    });

    // Cancel modal
    cancelBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('hidden');
    });

    // Start Game
    startBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('hidden');

      this.gameState.gameMode = 'ai';
      this.gameState.botDifficulty = selectedDiff;
      this.gameState.humanPlayerIndex = (selectedSide === 'red') ? 0 : 1;

      this.restartGame();
      this.hideLobby();
    });

    // Open Modal when clicking "vs Computer" button in Lobby
    document.getElementById('quick-vs-bot-btn')?.addEventListener('click', (e) => {
      e.preventDefault();

      // Reset options to default active states when opening
      selectedSide = 'red';
      selectedDiff = 'medium';
      p1Btn?.classList.add('active');
      p2Btn?.classList.remove('active');
      diffBtns?.forEach(b => {
        if (b.dataset.diff === 'medium') b.classList.add('active');
        else b.classList.remove('active');
      });

      modal.classList.remove('hidden');
    });
  }

  /**
   * Bind event listeners to the dedicated lobby screen
   */
  initLobbyEvents() {
    this.lobbyScreen = document.getElementById('lobby-screen');
    this.selectedMode = 'local';
    this.selectedDifficulty = 'medium';
    this.selectedSide = 0;

    // --- Nickname Management ---
    this._loadNickname();
    this._initProfileEvents();

    // --- Quick Play Buttons ---
    document.getElementById('quick-local-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.gameState.gameMode = 'local';
      this.restartGame();
      this.hideLobby();
    });

    // --- Create Custom Room ---
    const casualBtn = document.getElementById('lobby-mode-casual');
    const rankedBtn = document.getElementById('lobby-mode-ranked');
    this._lobbyMode = 'Casual';
    casualBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this._lobbyMode = 'Casual';
      casualBtn.classList.add('active');
      rankedBtn?.classList.remove('active');
    });
    rankedBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this._lobbyMode = 'Ranked';
      rankedBtn.classList.add('active');
      casualBtn?.classList.remove('active');
    });

    document.getElementById('lobby-create-room-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleCreateRoom();
    });

    // --- Direct Join via Code ---
    document.getElementById('lobby-join-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('lobby-join-code-input');
      const code = input?.value?.trim().toUpperCase();
      if (!code) {
        this.toast.show('Please enter a room code.');
        return;
      }
      this.handleJoinRoom(code);
    });

    // --- Refresh Open Rooms ---
    document.getElementById('btn-refresh-rooms')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.fetchOpenRooms();
    });

    // --- Daily Puzzle ---
    document.getElementById('btn-daily-puzzle')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.launchDailyPuzzles();
    });

    this._updateLobbyPuzzleCard();

    // (Waiting room Copy and Leave listeners moved to constructor)

    // Setup room client callbacks
    this.roomClient.onStateUpdate = (state) => this.applyOnlineState(state);
    this.roomClient.onStatusChange = (status, data) => this.handleOnlineStatusChange(status, data);
    this.roomClient.onError = (msg) => {
      if (msg) this.toast.show(msg);
    };
    this.roomClient.onOpponentDisconnect = () => {
      this.toast.show('Opponent disconnected. Waiting for reconnection...');
    };
    this.roomClient.onPollComplete = (data) => this.updateOnlineRematchUI(data);

    // Initial room fetch
    this.fetchOpenRooms();
  }

  // --- Profile / Nickname Helpers ---

  _loadNickname() {
    const saved = localStorage.getItem('barricade_nickname');
    this.nickname = saved || `Guest-${Math.floor(10000 + Math.random() * 90000)}`;
    if (!saved) localStorage.setItem('barricade_nickname', this.nickname);
    this._syncProfileUI();
    this._loadStats();
  }

  _syncProfileUI() {
    // Signed-in users see their DB profile (rendered by AuthUI) instead
    if (isLoggedIn() && getProfile()) return;
    const nameEl = document.getElementById('profile-name-display');
    const avatarEl = document.getElementById('profile-avatar-display');
    if (nameEl) nameEl.textContent = this.nickname;
    if (avatarEl) avatarEl.textContent = this.nickname.charAt(0).toUpperCase();
  }

  _loadStats() {
    try {
      const raw = localStorage.getItem('barricade_stats_v1');
      this._stats = raw ? JSON.parse(raw) : { wins: 0, losses: 0 };
    } catch (_) {
      this._stats = { wins: 0, losses: 0 };
    }
    this._renderStats();
  }

  _saveStats() {
    localStorage.setItem('barricade_stats_v1', JSON.stringify(this._stats));
    this._renderStats();
  }

  _renderStats() {
    // Signed-in users see DB-backed stats (rendered by AuthUI) instead
    if (isLoggedIn() && getProfile()) return;
    const w = document.getElementById('stats-wins');
    const l = document.getElementById('stats-losses');
    const r = document.getElementById('stats-ratio');
    if (w) w.textContent = this._stats.wins;
    if (l) l.textContent = this._stats.losses;
    const total = this._stats.wins + this._stats.losses;
    if (r) r.textContent = total > 0 ? `${Math.round((this._stats.wins / total) * 100)}%` : '0%';
  }

  _recordWin() { this._stats.wins++; this._saveStats(); }
  _recordLoss() { this._stats.losses++; this._saveStats(); }

  _initProfileEvents() {
    const editBtn = document.getElementById('btn-edit-name');
    const editContainer = document.getElementById('name-edit-container');
    const editInput = document.getElementById('name-edit-input');
    const cancelBtn = document.getElementById('btn-name-cancel');
    const saveBtn = document.getElementById('btn-name-save');

    editBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (editInput) editInput.value = this.nickname;
      editContainer?.classList.remove('hidden');
    });

    cancelBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      editContainer?.classList.add('hidden');
    });

    saveBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      const val = editInput?.value?.trim();
      if (!val || val.length < 2 || val.length > 16) {
        this.toast.show('Nickname must be 2-16 characters.');
        return;
      }
      // Signed in → the profiles row is the source of truth
      if (isLoggedIn() && getProfile()) {
        try {
          await this.authUI.saveUsername(val);
          editContainer?.classList.add('hidden');
          this.toast.show('Username updated!');
        } catch (err) {
          this.toast.show(err.message || 'Failed to update username.');
        }
        return;
      }
      this.nickname = val;
      localStorage.setItem('barricade_nickname', val);
      this._syncProfileUI();
      editContainer?.classList.add('hidden');
      this.toast.show('Nickname updated!');
    });
  }

  // --- Accounts / Friends / Chat / Live Leaderboard ---

  initAccountFeatures() {
    this.authUI = new AuthUI(this.toast);
    this.chatUI = new ChatUI(this.toast);
    this.friendsUI = new FriendsUI({
      toast: this.toast,
      onChat: (friend) => this.chatUI.openDirect(friend),
      onInvite: (friend) => this.inviteFriendToGame(friend)
    });

    this._lbPage = 0;
    document.getElementById('leaderboard-prev')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this._lbPage > 0) {
        this._lbPage--;
        this._refreshLeaderboard();
      }
    });
    document.getElementById('leaderboard-next')?.addEventListener('click', (e) => {
      e.preventDefault();
      this._lbPage++;
      this._refreshLeaderboard();
    });

    document.addEventListener('barricade:auth-changed', (e) => {
      if (!e.detail.loggedIn) {
        // Back to guest identity: restore localStorage nickname/stats display
        this._syncProfileUI();
        this._renderStats();
        const ratingEl = document.getElementById('profile-rating-display');
        if (ratingEl) ratingEl.textContent = 'Rating: — (guest)';
      }
      this._refreshLeaderboard();
    });

    this.authUI.init();

    if (isSupabaseConfigured()) {
      this._refreshLeaderboard();
      subscribeLeaderboard(() => this._refreshLeaderboard());
    }
  }

  async _refreshLeaderboard() {
    if (!isSupabaseConfigured()) return;
    const list = document.getElementById('leaderboard-list');
    const pager = document.getElementById('leaderboard-pager');
    if (!list) return;

    const { rows, total } = await fetchLeaderboard(this._lbPage);
    // Page drifted past the end (e.g. after realtime shrink) → snap back
    if (rows.length === 0 && this._lbPage > 0) {
      this._lbPage = Math.max(0, Math.ceil(total / LEADERBOARD_PAGE_SIZE) - 1);
      if (total > 0) return this._refreshLeaderboard();
    }

    list.innerHTML = '';
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'leaderboard-empty';
      empty.textContent = 'No ranked players yet — be the first!';
      list.appendChild(empty);
    }

    const myId = getProfile()?.id;
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      if (row.rank <= 3) item.classList.add(`rank-${row.rank}`);
      if (row.id === myId) item.classList.add('leaderboard-me');

      const rank = document.createElement('span');
      if (row.rank <= 3) {
        rank.className = 'rank-badge';
        rank.textContent = ['🥇', '🥈', '🥉'][row.rank - 1];
      } else {
        rank.className = 'rank-num';
        rank.textContent = String(row.rank);
      }

      const name = document.createElement('span');
      name.className = 'player-name';
      name.textContent = row.username;
      name.title = `${row.player_id} · ${row.wins}W/${row.losses}L`;

      const rating = document.createElement('span');
      rating.className = 'player-rating';
      const tier = tierForRating(row.elo_rating);
      rating.innerHTML = `<span class="player-tier" title="${tier.name}">${tier.icon}</span>${row.elo_rating}`;

      item.append(rank, name, rating);
      list.appendChild(item);
    }

    if (pager) {
      const pages = Math.max(1, Math.ceil(total / LEADERBOARD_PAGE_SIZE));
      pager.classList.toggle('hidden', pages <= 1);
      const label = document.getElementById('leaderboard-page-label');
      if (label) label.textContent = `${this._lbPage + 1}/${pages}`;
      const prev = document.getElementById('leaderboard-prev');
      const next = document.getElementById('leaderboard-next');
      if (prev) prev.disabled = this._lbPage === 0;
      if (next) next.disabled = this._lbPage >= pages - 1;
    }
  }

  /** Display name for online play: profile username when signed in. */
  _playerDisplayName() {
    return getProfile()?.username || this.nickname;
  }

  /** Create a private room and DM the friend an invite with the code. */
  async inviteFriendToGame(friendProfile) {
    if (!this.authUI.requireLogin('Sign in to invite friends.')) return;
    try {
      if (this.roomClient.isConnected()) {
        await this.roomClient.cancelRoom();
      }
      const timeControl = document.getElementById('lobby-time-control')?.value || '15+10 (Rapid)';
      const data = await this.roomClient.createRoom(
        this._playerDisplayName(), timeControl, 'Casual', true, getAccessToken()
      );
      this.gameState.gameMode = 'online';
      this.gameState.humanPlayerIndex = 0;
      this.gameState.roomCode = data.code;
      this.showWaitingRoom(data.code);
      await sendDirectMessage(
        friendProfile.id,
        `Join my Barricade game! Room code: ${data.code} — ${window.location.origin}/?room=${data.code}`
      );
      this.toast.show(`Invite sent to ${friendProfile.username}!`);
    } catch (err) {
      this.toast.show(err.message || 'Failed to send invite.');
    }
  }

  /** Bind the in-match chat channel once an online game is live. */
  _openRoomChat() {
    if (!isLoggedIn() || !this.gameState.roomCode) return;
    this.chatUI.openRoom(this.gameState.roomCode);
  }

  /** After a ranked game settles server-side, pull fresh profile + board. */
  async _refreshRatingsAfterRanked() {
    if (!isLoggedIn() || (this.roomClient.mode || 'Casual') !== 'Ranked') return;
    await fetchMyProfile();
    this.authUI.renderAccountState();
    this._refreshLeaderboard();
  }

  // --- Open Rooms API ---

  async fetchOpenRooms() {
    const tbody = document.getElementById('open-rooms-list');
    if (!tbody) return;

    try {
      const res = await fetch('/api/rooms/list');
      const data = await res.json();
      let rooms = data.rooms || [];

      // If the host is currently in a room, ensure it's displayed in the list
      if (this.roomClient.isConnected() && this.roomClient.status === 'waiting') {
        const ownCode = this.roomClient.code;
        const alreadyInList = rooms.some(r => r.code === ownCode);
        if (!alreadyInList) {
          rooms.unshift({
            code: ownCode,
            status: 'waiting',
            hostName: this.nickname || 'You',
            timeControl: this.roomClient.timeControl || '15+10 (Rapid)',
            mode: this.roomClient.mode || 'Casual',
            isPrivate: this.roomClient.isPrivate
          });
        }
      }

      // Update room count header
      const countEl = document.getElementById('open-rooms-count');
      if (countEl) {
        countEl.textContent = rooms.length;
      }

      // Compare rooms to avoid unnecessary DOM updates/flickering
      const roomsJson = JSON.stringify(rooms);
      if (this._lastRoomsJson === roomsJson) {
        return;
      }
      this._lastRoomsJson = roomsJson;

      if (rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No active open rooms. Create one to get started!</td></tr>';
        return;
      }

      tbody.innerHTML = rooms.map(room => {
        const isOwn = this.roomClient.isConnected() && room.code === this.roomClient.code;
        const lockIconHtml = room.isPrivate ? '<span class="lock-icon">🔒</span>' : '';
        const actionHtml = isOwn
          ? `<button class="btn-leave-room-table" data-code="${this._escapeHtml(room.code)}">Leave</button>`
          : `<button class="btn-primary-lobby btn-join-room" data-code="${this._escapeHtml(room.code)}">Join</button>`;

        return `
          <tr>
            <td>${this._escapeHtml(room.hostName)}${lockIconHtml}</td>
            <td>-</td>
            <td><span class="open-room-time">${this._escapeHtml(room.timeControl ? formatTimeControlLabel(room.timeControl) : '15+10')}</span></td>
            <td>${this._escapeHtml(room.mode)}</td>
            <td>${actionHtml}</td>
          </tr>
        `;
      }).join('');

      // Bind join and leave buttons
      tbody.querySelectorAll('.btn-join-room').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const code = btn.dataset.code;
          if (code) this.handleJoinRoom(code);
        });
      });

      tbody.querySelectorAll('.btn-leave-room-table').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          if (this.roomClient.isConnected()) {
            await this.roomClient.cancelRoom();
          }
          this.showLobby();
        });
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Failed to fetch rooms.</td></tr>';
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  _updateLobbyPuzzleCard() {
    const { puzzleDate } = getDailyPuzzles();
    const dateEl = document.getElementById('lobby-puzzle-date');
    const progressEl = document.getElementById('lobby-puzzle-progress');
    if (dateEl) dateEl.textContent = formatPuzzleDate(puzzleDate);
    if (progressEl) {
      const done = countCompleted(puzzleDate);
      progressEl.textContent = `${done}/${PUZZLES_PER_DAY} completed`;
    }
  }

  launchDailyPuzzles() {
    this._clearOnlineSession();
    const { puzzleDate, puzzles } = getDailyPuzzles();
    const progress = getProgressForDate(puzzleDate);
    let startIndex = puzzles.findIndex(p => !(progress[p.id]?.solved || progress[p.id]?.gaveUp));
    if (startIndex < 0) startIndex = 0;

    this.puzzleSession = {
      puzzleDate,
      puzzles,
      currentIndex: startIndex,
      solved: false,
      gaveUp: false,
      showingSolution: false,
      locked: false
    };

    this.loadPuzzleAtIndex(startIndex);
  }

  loadPuzzleAtIndex(index) {
    if (!this.puzzleSession) return;
    const puzzle = this.puzzleSession.puzzles[index];
    if (!puzzle) return;

    this.puzzleSession.currentIndex = index;
    this.puzzleSession.solved = false;
    this.puzzleSession.gaveUp = false;
    this.puzzleSession.showingSolution = false;
    this.puzzleSession.locked = false;

    const prefix = puzzle.historyPrefix
      ? puzzle.historyPrefix.split(',').filter(Boolean)
      : [];

    if (puzzle.setup) {
      this.gameState.reset();
      this.gameState.players[0].col = puzzle.setup.players[0].col;
      this.gameState.players[0].row = puzzle.setup.players[0].row;
      this.gameState.players[0].walls = puzzle.setup.players[0].walls;
      this.gameState.players[1].col = puzzle.setup.players[1].col;
      this.gameState.players[1].row = puzzle.setup.players[1].row;
      this.gameState.players[1].walls = puzzle.setup.players[1].walls;
      this.gameState.horizontalWalls = [...(puzzle.setup.horizontalWalls || [])];
      this.gameState.verticalWalls = [...(puzzle.setup.verticalWalls || [])];
      this.gameState.currentPlayer = puzzle.sideToMove;
    } else {
      const replayed = replayHistory(prefix);
      this.gameState.reset();
      this.gameState.players[0].col = replayed.players[0].col;
      this.gameState.players[0].row = replayed.players[0].row;
      this.gameState.players[0].walls = replayed.players[0].walls;
      this.gameState.players[1].col = replayed.players[1].col;
      this.gameState.players[1].row = replayed.players[1].row;
      this.gameState.players[1].walls = replayed.players[1].walls;
      this.gameState.horizontalWalls = [...replayed.horizontalWalls];
      this.gameState.verticalWalls = [...replayed.verticalWalls];
      this.gameState.history = [...replayed.history];
      this.gameState.currentPlayer = puzzle.sideToMove;
    }

    this.gameState.gameMode = 'puzzle';
    this.gameState.humanPlayerIndex = puzzle.sideToMove;
    this.gameState.winner = null;
    this.gameState.activePuzzle = puzzle;

    this.board.init();
    this.renderer.init();
    this.updateBoardOrientation();
    if (this.dragPreview) this.dragPreview.reappend(this.renderer.container);
    this.dragController.wallSnap.intersections = [];
    this.mouseController.wallSnap.intersections = [];
    if (this.mouseController) this.mouseController.cellRects = [];
    setTimeout(() => {
      this.dragController.cacheIntersections();
      this.mouseController.cacheGrid();
    }, 450);

    this.hideLobby();
    this.showPuzzleUI();
    this.updateUI();
    this._updatePuzzlePanel();
    this.saveStateToStorage();
  }

  /**
   * Restore daily puzzle session + UI after a page refresh.
   */
  _restorePuzzleFromSaved(data) {
    if (data.gameMode !== 'puzzle') return false;

    const meta = data.puzzleSession;
    if (!meta) return false;

    const puzzleDate = meta.puzzleDate || getDailyPuzzles().puzzleDate;
    const { puzzles } = getDailyPuzzles(new Date(`${puzzleDate}T12:00:00`));
    const idx = Math.min(Math.max(meta.currentIndex ?? 0, 0), puzzles.length - 1);
    const puzzle = puzzles[idx];
    if (!puzzle) return false;

    this.puzzleSession = {
      puzzleDate,
      puzzles,
      currentIndex: idx,
      solved: !!meta.solved,
      gaveUp: !!meta.gaveUp,
      locked: !!meta.locked,
      showingSolution: !!meta.showingSolution
    };
    this.gameState.gameMode = 'puzzle';
    this.gameState.activePuzzle = puzzle;
    this.gameState.humanPlayerIndex = puzzle.sideToMove;

    this.showPuzzleUI();
    this._syncPuzzleHeader();
    this._syncPuzzleActions();
    this._updatePuzzlePanel();

    if (this.puzzleSession.locked) {
      this.renderer.setDisabled(true);
      if (this.puzzleSession.solved) {
        const el = document.getElementById('puzzle-feedback');
        if (el) {
          el.textContent = '✓ Correct! That\'s the best move.';
          el.className = 'puzzle-feedback correct';
          el.classList.remove('hidden');
        }
      }
    }

    return true;
  }

  showPuzzleUI() {
    document.querySelector('.main-container')?.classList.add('puzzle-active');
    document.getElementById('puzzle-sidebar-panel')?.classList.remove('hidden');
    document.querySelector('.sidebar-controls')?.classList.add('hidden');
    document.getElementById('resign-btn')?.classList.add('hidden');
    document.getElementById('undo-btn')?.classList.add('hidden');
    document.querySelector('.barricades-drag-section')?.classList.remove('hidden');
    this._syncPuzzleHeader();
    this._syncPuzzleActions();
  }

  hidePuzzleUI() {
    document.querySelector('.main-container')?.classList.remove('puzzle-active');
    document.getElementById('puzzle-sidebar-panel')?.classList.add('hidden');
    document.getElementById('puzzle-feedback')?.classList.add('hidden');
    document.querySelector('.sidebar-controls')?.classList.remove('hidden');
    document.getElementById('resign-btn')?.classList.remove('hidden');
    document.getElementById('undo-btn')?.classList.remove('hidden');
    this.puzzleSession = null;
    this.gameState.activePuzzle = null;
  }

  _syncPuzzleHeader() {
    if (!this.puzzleSession || !this.gameState.activePuzzle) return;
    const puzzle = this.gameState.activePuzzle;
    const dateEl = document.getElementById('puzzle-screen-date');
    const badgeEl = document.getElementById('puzzle-type-badge');
    const metaEl = document.getElementById('puzzle-screen-meta');
    const promptEl = document.getElementById('puzzle-screen-prompt');

    if (dateEl) dateEl.textContent = formatPuzzleDate(this.puzzleSession.puzzleDate);
    if (badgeEl) {
      badgeEl.textContent = puzzle.title || 'Puzzle';
      badgeEl.dataset.type = puzzle.type || 'win';
    }
    if (metaEl) {
      metaEl.textContent = `Puzzle ${this.puzzleSession.currentIndex + 1} of ${PUZZLES_PER_DAY}`;
    }
    if (promptEl) {
      if (this.puzzleSession.solved) {
        promptEl.textContent = 'Solved! Great tactical eye.';
      } else if (this.puzzleSession.gaveUp) {
        promptEl.textContent = `The solution was ${puzzle.bestMove.toUpperCase()} \u2014 it\u2019s shown on the board. Study the idea, then try again.`;
      } else {
        promptEl.textContent = puzzle.prompt || 'Red to move. Find the best move.';
      }
    }

    this._renderPuzzleDots();
  }

  _renderPuzzleDots() {
    const wrap = document.getElementById('puzzle-progress-dots');
    if (!wrap || !this.puzzleSession) return;
    const progress = getProgressForDate(this.puzzleSession.puzzleDate);
    wrap.innerHTML = '';
    this.puzzleSession.puzzles.forEach((p, i) => {
      const dot = document.createElement('span');
      dot.className = 'puzzle-dot';
      const st = progress[p.id];
      if (st?.solved) dot.classList.add('dot-solved');
      else if (st?.gaveUp) dot.classList.add('dot-failed');
      if (i === this.puzzleSession.currentIndex) dot.classList.add('dot-current');
      wrap.appendChild(dot);
    });
  }

  _syncPuzzleActions() {
    const solutionBtn = document.getElementById('puzzle-solution-btn');
    const nextBtn = document.getElementById('puzzle-next-btn');
    const retryBtn = document.getElementById('puzzle-retry-btn');
    const session = this.puzzleSession;
    if (!session) return;

    const isLast = session.currentIndex >= session.puzzles.length - 1;
    const done = session.solved || session.gaveUp;

    solutionBtn?.classList.toggle('hidden', done);
    nextBtn?.classList.toggle('hidden', !session.solved || isLast);
    retryBtn?.classList.toggle('hidden', !session.gaveUp);
  }

  _updatePuzzlePanel() {
    if (!this.puzzleSession || !this.gameState.activePuzzle) return;
    const progress = getProgressForDate(this.puzzleSession.puzzleDate);
    const attempts = progress[this.gameState.activePuzzle.id]?.attempts || 0;
    const el = document.getElementById('puzzle-attempts');
    if (el) el.textContent = `Attempts: ${attempts}`;
  }

  _showPuzzleFeedback(type, message) {
    const el = document.getElementById('puzzle-feedback');
    if (!el) return;
    el.textContent = message;
    el.className = `puzzle-feedback ${type}`;
    el.classList.remove('hidden');
    if (type === 'wrong') {
      setTimeout(() => el.classList.add('hidden'), 1500);
    }
  }

  handlePuzzleMove(notation) {
    if (!this.puzzleSession || !this.gameState.activePuzzle || this.puzzleSession.locked) return;

    const puzzle = this.gameState.activePuzzle;
    const correct = notation.toLowerCase() === puzzle.bestMove.toLowerCase();
    const progress = recordAttempt(this.puzzleSession.puzzleDate, puzzle.id, correct);
    this._updatePuzzlePanel();

    if (correct) {
      this.puzzleSession.solved = true;
      this.puzzleSession.locked = true;
      applyNotationMove(this.gameState, notation);
      this._showPuzzleFeedback('correct', '✓ Correct! That\'s the best move.');
      this._syncPuzzleHeader();
      this._syncPuzzleActions();
      this.updateUI();
      this.saveStateToStorage();
      this.renderer.setDisabled(true);
      return;
    }

    this._showPuzzleFeedback('wrong', '✗ Not the best move. Try again!');
    this.toast.show('Not the best move — try again!');
    this.saveStateToStorage();
  }

  showPuzzleSolution() {
    if (!this.puzzleSession || !this.gameState.activePuzzle) return;
    const puzzle = this.gameState.activePuzzle;
    recordGiveUp(this.puzzleSession.puzzleDate, puzzle.id);
    this.puzzleSession.gaveUp = true;
    this.puzzleSession.locked = true;
    this.puzzleSession.showingSolution = true;

    this.gameState.reset();
    if (puzzle.setup) {
      this.gameState.players[0].col = puzzle.setup.players[0].col;
      this.gameState.players[0].row = puzzle.setup.players[0].row;
      this.gameState.players[0].walls = puzzle.setup.players[0].walls;
      this.gameState.players[1].col = puzzle.setup.players[1].col;
      this.gameState.players[1].row = puzzle.setup.players[1].row;
      this.gameState.players[1].walls = puzzle.setup.players[1].walls;
      this.gameState.horizontalWalls = [...(puzzle.setup.horizontalWalls || [])];
      this.gameState.verticalWalls = [...(puzzle.setup.verticalWalls || [])];
    } else {
      const prefix = puzzle.historyPrefix.split(',').filter(Boolean);
      const replayed = replayHistory(prefix);
      this.gameState.players[0].col = replayed.players[0].col;
      this.gameState.players[0].row = replayed.players[0].row;
      this.gameState.players[0].walls = replayed.players[0].walls;
      this.gameState.players[1].col = replayed.players[1].col;
      this.gameState.players[1].row = replayed.players[1].row;
      this.gameState.players[1].walls = replayed.players[1].walls;
      this.gameState.horizontalWalls = [...replayed.horizontalWalls];
      this.gameState.verticalWalls = [...replayed.verticalWalls];
    }
    this.gameState.currentPlayer = puzzle.sideToMove;
    applyNotationMove(this.gameState, puzzle.bestMove);

    this._syncPuzzleHeader();
    this._syncPuzzleActions();
    this._updatePuzzlePanel();
    this.updateUI();
    this.renderer.setDisabled(true);
    this.saveStateToStorage();
  }

  nextPuzzle() {
    if (!this.puzzleSession) return;
    const next = this.puzzleSession.currentIndex + 1;
    if (next >= this.puzzleSession.puzzles.length) return;
    this.renderer.setDisabled(false);
    document.getElementById('puzzle-feedback')?.classList.add('hidden');
    this.loadPuzzleAtIndex(next);
  }

  exitPuzzleToLobby() {
    this.hidePuzzleUI();
    this.showLobby();
  }

  initPuzzleEvents() {
    document.getElementById('puzzle-back-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.exitPuzzleToLobby();
    });
    document.getElementById('puzzle-solution-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showPuzzleSolution();
    });
    document.getElementById('puzzle-next-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.nextPuzzle();
    });
    document.getElementById('puzzle-retry-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.puzzleSession) this.loadPuzzleAtIndex(this.puzzleSession.currentIndex);
    });
  }

  async handleCreateRoom() {
    const createBtn = document.getElementById('lobby-create-room-btn');
    if (createBtn) createBtn.disabled = true;
    try {
      const timeControl = document.getElementById('lobby-time-control')?.value || '15+10 (Rapid)';
      const mode = this._lobbyMode || 'Casual';
      const isPrivate = document.getElementById('lobby-private-room')?.checked || false;
      const playAs = document.getElementById('lobby-play-as')?.value || 'random';

      // Ranked play requires a real account (server enforces this too)
      if (mode === 'Ranked' && !this.authUI.requireLogin('Sign in to play ranked matches.')) {
        return;
      }

      const data = await this.roomClient.createRoom(
        this._playerDisplayName(), timeControl, mode, isPrivate, getAccessToken()
      );
      this.gameState.gameMode = 'online';
      this.gameState.humanPlayerIndex = playAs === 'blue' ? 1 : 0;
      this.gameState.roomCode = data.code;
      this.showWaitingRoom(data.code);
    } catch (err) {
      this.toast.show(err.message || 'Failed to create room');
    } finally {
      if (createBtn) createBtn.disabled = false;
    }
  }

  async handleJoinRoom(code) {
    // If we are currently in another waiting room, warn the player first!
    if (this.roomClient.isConnected() && this.roomClient.status === 'waiting') {
      this.showConfirm(
        "Leave Current Room?",
        "You must leave your current room before joining another game. Would you like to leave your room and join this one?",
        async () => {
          if (this.roomClient.isConnected()) {
            await this.roomClient.cancelRoom();
          }
          this.executeJoinRoom(code);
        }
      );
      return;
    }

    this.executeJoinRoom(code);
  }

  async executeJoinRoom(code) {
    const joinBtn = document.getElementById('lobby-join-btn');
    if (joinBtn) joinBtn.disabled = true;
    try {
      const data = await this.roomClient.joinRoom(code, this._playerDisplayName(), null, getAccessToken());
      this.gameState.gameMode = 'online';
      this.gameState.humanPlayerIndex = data.playerIndex;
      this.gameState.roomCode = data.code;
      this.hideLobby();
      this.hideOnlinePanels();

      if (data.status === 'playing' && data.gameState) {
        this.gameState.applyServerState(data.gameState);
        this.restartGameFromOnline();
        this.showRoomCodeBadge();
        this.startClockTick();
        this._openRoomChat();
      }
    } catch (err) {
      this.toast.show(err.message || 'Failed to join room');
    } finally {
      if (joinBtn) joinBtn.disabled = false;
    }
  }

  showWaitingRoom(code) {
    // Hide create card, show your room card
    document.getElementById('create-room-card')?.classList.add('hidden');
    const yourRoomCard = document.getElementById('your-room-card');
    if (yourRoomCard) {
      yourRoomCard.classList.remove('hidden');

      const codeEl = document.getElementById('your-room-code');
      if (codeEl) codeEl.textContent = code;

      const inviteInput = document.getElementById('your-room-invite-input');
      if (inviteInput) {
        inviteInput.value = `${window.location.origin}/?room=${code}`;
      }

      const privacyBadge = document.getElementById('your-room-privacy-badge');
      if (privacyBadge) {
        if (this.roomClient.isPrivate) {
          privacyBadge.textContent = '[🔒 Private]';
          privacyBadge.className = 'badge-private';
        } else {
          privacyBadge.textContent = '[Public]';
          privacyBadge.className = 'badge-public';
        }
      }

      const timeEl = document.getElementById('your-room-time-control');
      if (timeEl) {
        timeEl.textContent = formatTimeControlLabel(this.roomClient.timeControl || '15+10 (Rapid)');
      }

      const playAsEl = document.getElementById('your-room-play-as');
      if (playAsEl) {
        let sideText = 'Random';
        if (this.gameState.humanPlayerIndex === 0) sideText = 'Red (First)';
        if (this.gameState.humanPlayerIndex === 1) sideText = 'Blue (Second)';
        playAsEl.textContent = sideText;
      }

      const statusEl = document.getElementById('your-room-status');
      if (statusEl) {
        statusEl.textContent = 'Waiting for opponent...';
      }
    }

    // Refresh open rooms list immediately so our own room is shown
    this.fetchOpenRooms();
  }

  hideOnlinePanels() {
    document.getElementById('your-room-card')?.classList.add('hidden');
    document.getElementById('create-room-card')?.classList.remove('hidden');
    this.hideWinModal();
  }

  showRoomCodeBadge() {
    const badge = document.getElementById('room-code-badge');
    const badgeCode = document.getElementById('room-code-text');
    const timeBadge = document.getElementById('room-time-badge');
    if (badge && badgeCode && this.gameState.roomCode) {
      badgeCode.textContent = this.gameState.roomCode;
      badge.classList.remove('hidden');
    }
    if (timeBadge && this.isOnlineMode()) {
      const label = this.gameState.timeControlLabel
        || formatTimeControlLabel(this.roomClient.timeControl);
      if (label && label !== 'Unlimited') {
        timeBadge.textContent = ` · ${label}`;
        timeBadge.classList.remove('hidden');
      } else if (label === 'Unlimited') {
        timeBadge.textContent = ' · Unlimited';
        timeBadge.classList.remove('hidden');
      } else {
        timeBadge.classList.add('hidden');
      }
    }
  }

  hideRoomCodeBadge() {
    document.getElementById('room-code-badge')?.classList.add('hidden');
    document.getElementById('room-time-badge')?.classList.add('hidden');
  }

  startClockTick() {
    this.stopClockTick();
    if (!this.isOnlineMode() || this.gameState.isUnlimited) return;
    this._clockTickTimer = setInterval(() => this.updateClockDisplay(), 200);
  }

  stopClockTick() {
    if (this._clockTickTimer) {
      clearInterval(this._clockTickTimer);
      this._clockTickTimer = null;
    }
  }

  updateClockDisplay() {
    if (!this.isOnlineMode() || this.gameState.isUnlimited || !this.gameState.clocks) {
      return;
    }

    const clocks = getDisplayClocks(this.gameState);
    const clockTexts = clocks.map(ms => (ms === null ? null : formatClock(ms)));
    this.sidebar.update(
      this.gameState.currentPlayer,
      this.gameState.players[0].walls,
      this.gameState.players[1].walls,
      clockTexts
    );
  }

  handleOnlineStatusChange(status, data) {
    if (status === 'playing' && data.gameState) {
      this.hideLobby();
      this.hideOnlinePanels();
      this.gameState.applyServerState(data.gameState);
      if (this.roomClient.version < data.version) {
        this.roomClient.version = data.version;
      }
      this.restartGameFromOnline();
      this.showRoomCodeBadge();
      this.startClockTick();
      this._openRoomChat();
      this.toast.show('Opponent joined! Game started.');
    }
  }

  restartGameFromOnline() {
    this.board.init();
    this.renderer.init();
    this.updateBoardOrientation();
    if (this.dragPreview) this.dragPreview.reappend(this.renderer.container);
    this.dragController.wallSnap.intersections = [];
    this.mouseController.wallSnap.intersections = [];
    if (this.mouseController) this.mouseController.cellRects = [];
    setTimeout(() => {
      this.dragController.cacheIntersections();
      this.mouseController.cacheGrid();
    }, 450);
    this.updateUI();
  }

  applyOnlineState(state) {
    if (!state) return;
    const prevHistoryLen = this.gameState.history.length;
    const hadWinner = this.gameState.winner !== null;
    this.gameState.applyServerState(state);

    // Re-render walls when a new move was applied
    if (state.history && state.history.length !== prevHistoryLen) {
      this.renderer.clearWalls();
    }

    this.updateUI();
    this.updateBoardOrientation();

    if (!hadWinner && this.gameState.winner !== null) {
      this.stopClockTick();
      // Ranked games settle server-side the moment the winner is recorded —
      // pull the fresh Elo/stats into the profile card and leaderboard.
      this._refreshRatingsAfterRanked();
      if (this.gameState.endReason) {
        // Resign/timeout — no board animation to wait for
        this.showWinner(
          this.gameState.winner,
          this.gameState.endReason,
          this.gameState.resignedBy
        );
      } else {
        this._scheduleWinner(this.gameState.winner);
      }
    }
  }

  /**
   * Show the dedicated lobby screen and hide the game board
   */
  showLobby() {
    this.clearBotTimeout();
    this._clearWinnerTimer();
    this.stopClockTick();
    this.hidePuzzleUI();
    this.chatUI?.closeRoom();
    document.body.classList.remove('in-game');
    if (this.isOnlineMode()) {
      this.roomClient.disconnect();
      this.gameState.gameMode = 'local';
      this.gameState.reset();
    }
    this.hideRoomCodeBadge();
    this.hideOnlinePanels();
    this.clearStateFromStorage();

    // Reset room card panels
    document.getElementById('create-room-card')?.classList.remove('hidden');
    document.getElementById('your-room-card')?.classList.add('hidden');

    // Show lobby, hide game
    if (this.lobbyScreen) {
      this.lobbyScreen.classList.remove('hidden');
    }
    const mainContainer = document.querySelector('.main-container');
    if (mainContainer) mainContainer.classList.add('hidden');

    this.renderer.setDisabled(true);
    this._loadStats();
    this._updateLobbyPuzzleCard();
    this._refreshLeaderboard();
    this.fetchOpenRooms();
    this.startLobbyPolling();
  }

  /**
   * Hide the dedicated lobby screen and show the game board
   */
  hideLobby() {
    document.body.classList.add('in-game');
    if (this.lobbyScreen) {
      this.lobbyScreen.classList.add('hidden');
    }
    const mainContainer = document.querySelector('.main-container');
    if (mainContainer) mainContainer.classList.remove('hidden');

    this.renderer.setDisabled(false);
    this.stopLobbyPolling();
  }

  startLobbyPolling() {
    this.stopLobbyPolling();
    this._lobbyPollTimer = setInterval(() => {
      this.fetchOpenRooms();
    }, 3000);
  }

  stopLobbyPolling() {
    if (this._lobbyPollTimer) {
      clearInterval(this._lobbyPollTimer);
      this._lobbyPollTimer = null;
    }
    this._lastRoomsJson = null;
  }

  /**
   * Display custom confirmation modal with actions
   *
   * @param {string} title - The header title
   * @param {string} message - The detail message
   * @param {Function} onConfirm - The callback to execute on OK click
   */
  showConfirm(title, message, onConfirm) {
    if (!this.confirmModal) return;

    if (this.confirmTitle) this.confirmTitle.textContent = title;
    if (this.confirmMessage) this.confirmMessage.textContent = message;

    // Clone buttons to clear previous event listeners
    const oldOkBtn = document.getElementById('confirm-ok-btn');
    const oldCancelBtn = document.getElementById('confirm-cancel-btn');

    if (oldOkBtn && oldCancelBtn) {
      const newOkBtn = oldOkBtn.cloneNode(true);
      const newCancelBtn = oldCancelBtn.cloneNode(true);

      oldOkBtn.parentNode.replaceChild(newOkBtn, oldOkBtn);
      oldCancelBtn.parentNode.replaceChild(newCancelBtn, oldCancelBtn);

      newOkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.hideConfirmModal();
        onConfirm();
      });

      newCancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.hideConfirmModal();
      });
    }

    this.confirmModal.classList.remove('hidden');
  }

  /**
   * Hide the custom confirmation modal
   */
  hideConfirmModal() {
    if (this.confirmModal) {
      this.confirmModal.classList.add('hidden');
    }
  }

  /**
   * Execute movement for active player
   * @param {number} col
   * @param {number} row
   */
  moveActivePlayer(col, row, isBot = false) {
    if (this.gameState.winner !== null) return;
    if (!isBot && !this.isLocalPlayerTurn()) {
      this.toast.show(TOAST_MESSAGES.NOT_YOUR_TURN);
      return;
    }

    const activeIdx = this.gameState.currentPlayer;
    const player = this.gameState.players[activeIdx];
    const opponent = this.gameState.players[activeIdx === 0 ? 1 : 0];

    const legalMoves = getLegalMoves(
      player,
      opponent,
      this.gameState.horizontalWalls,
      this.gameState.verticalWalls
    );

    const isLegal = legalMoves.some(m => m.col === col && m.row === row);
    if (!isLegal) return;

    if (this.isOnlineMode()) {
      this.sendOnlineAction({ type: 'move', col, row });
      return;
    }

    const notation = cellToNotation(col, row);

    if (this.isPuzzleMode()) {
      this.handlePuzzleMove(notation);
      return;
    }

    player.moveTo(col, row);
    const winner = this.turnManager.commitAction(this.gameState, notation);

    this.updateUI();
    this.saveStateToStorage();

    if (winner !== null) {
      this._scheduleWinner(winner);
    }
  }

  /**
   * Place barricade on the board
   *
   * @param {number} col
   * @param {number} row
   * @param {string} orientation
   */
  placeWall(col, row, orientation, isBot = false) {
    if (this.gameState.winner !== null) return;
    if (!isBot && !this.isLocalPlayerTurn()) {
      this.toast.show(TOAST_MESSAGES.NOT_YOUR_TURN);
      return;
    }

    const activeIdx = this.gameState.currentPlayer;
    const player = this.gameState.players[activeIdx];

    if (player.walls <= 0) {
      this.toast.show(TOAST_MESSAGES.NO_WALLS_LEFT);
      return;
    }

    const validation = validateWall(
      col,
      row,
      orientation,
      this.gameState.players,
      this.gameState.horizontalWalls,
      this.gameState.verticalWalls
    );

    if (!validation.isValid) {
      this.toast.show(validation.message || TOAST_MESSAGES.INVALID_PLACEMENT);
      return;
    }

    if (this.isOnlineMode()) {
      this.sendOnlineAction({ type: 'wall', col, row, orientation });
      return;
    }

    const notation = wallToNotation(col, row, orientation);

    if (this.isPuzzleMode()) {
      this.handlePuzzleMove(notation);
      return;
    }

    const wallSpec = { col, row, orientation, placedBy: activeIdx };
    if (orientation === WALL_ORIENTATIONS.HORIZONTAL) {
      this.gameState.horizontalWalls.push(wallSpec);
    } else {
      this.gameState.verticalWalls.push(wallSpec);
    }

    player.useWall();
    const winner = this.turnManager.commitAction(this.gameState, notation);

    this.updateUI();
    this.saveStateToStorage();

    if (winner !== null) {
      this._scheduleWinner(winner);
    }
  }

  async sendOnlineAction(action) {
    if (this._onlineActionPending) return;
    this._onlineActionPending = true;
    this.renderer.setDisabled(true);
    try {
      await this.roomClient.sendAction(action);
    } catch (err) {
      this.toast.show(err.message || 'Action failed');
    } finally {
      this._onlineActionPending = false;
      if (this.isLocalPlayerTurn() && this.gameState.winner === null) {
        this.renderer.setDisabled(false);
      }
    }
  }

  /**
   * Perform validation check (dry run) for previews
   *
   * @param {number} col
   * @param {number} row
   * @param {string} orientation
   * @returns {boolean} True if placement is valid, false otherwise
   */
  verifyWallPlacement(col, row, orientation) {
    const activeIdx = this.gameState.currentPlayer;
    const player = this.gameState.players[activeIdx];

    // Check inventory
    if (player.walls <= 0) {
      return false;
    }

    // Run validator
    const validation = validateWall(
      col,
      row,
      orientation,
      this.gameState.players,
      this.gameState.horizontalWalls,
      this.gameState.verticalWalls
    );

    return validation.isValid;
  }

  /**
   * Resigns current active player
   */
  resignActivePlayer() {
    if (this.gameState.winner !== null) return;
    this.clearBotTimeout();

    if (this.isOnlineMode()) {
      if (this.roomClient.isConnected()) {
        this.sendOnlineAction({ type: 'resign' });
      } else {
        this.showLobby();
      }
      return;
    }

    const resigningIdx = this.gameState.gameMode === 'ai' ? this.gameState.humanPlayerIndex : this.gameState.currentPlayer;
    const winnerIdx = resigningIdx === 0 ? 1 : 0;
    this.gameState.winner = winnerIdx;

    this.updateUI();
    this.showWinner(winnerIdx, 'resign', resigningIdx);
  }

  /**
   * Completely restarts matches and resets all states
   */
  restartGame() {
    this.clearBotTimeout();
    this._clearWinnerTimer();
    this.gameState.reset();
    this.board.init();
    this.renderer.init();
    this.updateBoardOrientation();

    // Re-append the preview element to the newly cleared board container
    if (this.dragPreview) {
      this.dragPreview.reappend(this.renderer.container);
    }

    // Rebind drag and hover controllers caches (due to board DOM rebuilding)
    this.dragController.wallSnap.intersections = [];
    this.mouseController.wallSnap.intersections = [];
    if (this.mouseController) {
      this.mouseController.cellRects = [];
    }

    // Pre-cache stable board layout coordinates after the lobby modal fade transition finishes (450ms)
    setTimeout(() => {
      if (this.dragController) {
        this.dragController.cacheIntersections();
      }
      if (this.mouseController) {
        this.mouseController.cacheGrid();
      }
    }, 450);

    this.hideWinModal();
    this.updateUI();
    this.saveStateToStorage();
  }

  /**
   * Clear active bot play scheduling timers
   */
  clearBotTimeout() {
    if (this.botTimeoutId) {
      clearTimeout(this.botTimeoutId);
      this.botTimeoutId = null;
    }
    document.getElementById('p1-card')?.classList.remove('bot-thinking');
    document.getElementById('p2-card')?.classList.remove('bot-thinking');
  }

  /**
   * Refresh and update DOM visual layers
   */
  updateUI() {
    // 1. Position players
    this.renderer.renderPlayers(this.gameState.players);

    // 2. Draw placed walls
    this.renderer.renderPlacedWalls(
      this.gameState.horizontalWalls,
      this.gameState.verticalWalls
    );

    this._updateLastMoveIndicator();
    this.updatePlayerCardNames();

    const isBotTurn = this.gameState.gameMode === 'ai' && this.gameState.currentPlayer !== this.gameState.humanPlayerIndex;
    const isOnlineWaiting = this.isOnlineMode() && !this.isLocalPlayerTurn();
    const isPuzzleLocked = this.isPuzzleMode() && this.puzzleSession?.locked;

    // 3. Update move highlights
    if (this.gameState.winner === null) {
      const activeIdx = this.gameState.currentPlayer;
      const player = this.gameState.players[activeIdx];
      const opponent = this.gameState.players[activeIdx === 0 ? 1 : 0];

      const legalMoves = getLegalMoves(
        player,
        opponent,
        this.gameState.horizontalWalls,
        this.gameState.verticalWalls
      );

      if (!isBotTurn && !isOnlineWaiting && !isPuzzleLocked) {
        this.renderer.renderHighlights(legalMoves);
        this.renderer.setDisabled(false);
      } else {
        this.renderer.renderHighlights([]);
        this.renderer.setDisabled(true);
      }
    } else {
      // Clear highlights and disable interaction
      this.renderer.renderHighlights([]);
      this.renderer.setDisabled(true);
    }

    // 4. Update sidebar labels
    const clockTexts = this.isOnlineMode() && !this.gameState.isUnlimited && this.gameState.clocks
      ? getDisplayClocks(this.gameState).map(ms => formatClock(ms))
      : null;
    this.sidebar.update(
      this.gameState.currentPlayer,
      this.gameState.players[0].walls,
      this.gameState.players[1].walls,
      clockTexts
    );

    // 5. Update history table
    this.moveHistoryUI.render(this.gameState.history);

    // 6. Sync Undo button visibility
    this.updateUndoButtonVisibility();

    // Trigger AI move execution if it's the Bot's turn
    if (this.gameState.winner === null && isBotTurn) {
      this.triggerBotMove();
    }
  }

  /**
   * Syncs the Undo button visibility dynamically based on match mode and winner state.
   */
  updateUndoButtonVisibility() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
      if (this.gameState.gameMode === 'ai' && this.gameState.winner === null && this.gameState.history.length > 0) {
        undoBtn.classList.remove('hidden');
      } else {
        undoBtn.classList.add('hidden');
      }
    }
  }

  /**
   * Highlight the last action on the board (destination cell or newest wall)
   * so it's always clear what just happened.
   */
  _updateLastMoveIndicator() {
    const last = this.gameState.history[this.gameState.history.length - 1];
    if (!last) {
      this.renderer.setLastMoveCell(null, null);
      this.renderer.setLatestWall(null, null, null);
      return;
    }

    if (last.length === 2) {
      const cell = notationToCell(last);
      if (cell) {
        this.renderer.setLastMoveCell(cell.col, cell.row);
        this.renderer.setLatestWall(null, null, null);
      }
    } else {
      const wall = notationToWall(last);
      if (wall) {
        this.renderer.setLastMoveCell(null, null);
        this.renderer.setLatestWall(wall.orientation, wall.col, wall.row);
      }
    }
  }

  /**
   * Label player cards according to the current game mode
   */
  updatePlayerCardNames() {
    const p1Name = document.querySelector('#p1-card h3');
    const p2Name = document.querySelector('#p2-card h3');
    if (!p1Name || !p2Name) return;

    const mode = this.gameState.gameMode;
    let n1 = 'Player 1';
    let n2 = 'Player 2';

    if (mode === 'ai') {
      const labels = { easy: 'Easy', medium: 'Medium', hard: 'Hard', professional: 'Expert', expert: 'Expert' };
      const diffLabel = labels[this.gameState.botDifficulty] || 'Bot';
      if (this.gameState.humanPlayerIndex === 0) {
        n1 = 'You';
        n2 = `Bot \u00b7 ${diffLabel}`;
      } else {
        n1 = `Bot \u00b7 ${diffLabel}`;
        n2 = 'You';
      }
    } else if (mode === 'online' || mode === 'puzzle') {
      if (this.gameState.humanPlayerIndex === 0) {
        n1 = 'You';
        n2 = 'Opponent';
      } else {
        n1 = 'Opponent';
        n2 = 'You';
      }
    }

    if (p1Name.textContent !== n1) p1Name.textContent = n1;
    if (p2Name.textContent !== n2) p2Name.textContent = n2;
  }

  /**
   * Undo the last move only (human or bot), in Play vs Bot mode.
   */
  undoMoves() {
    if (this.gameState.gameMode !== 'ai') return;
    if (this.gameState.history.length === 0) {
      this.toast.show('No moves to undo.');
      return;
    }

    this.clearBotTimeout();
    this._clearWinnerTimer();

    const targetHistory = this.gameState.history.slice(0, -1);

    // Save configuration settings
    const savedMode = this.gameState.gameMode;
    const savedDifficulty = this.gameState.botDifficulty;
    const savedHumanIdx = this.gameState.humanPlayerIndex;

    // Reset game state and clear boards
    this.gameState.reset();
    this.board.init();
    this.renderer.init();

    // Replay history
    targetHistory.forEach((moveNotation) => {
      const activeIdx = this.gameState.currentPlayer;
      if (moveNotation.length === 2) {
        // Pawn move
        const cell = notationToCell(moveNotation);
        if (cell) {
          this.gameState.players[activeIdx].moveTo(cell.col, cell.row);
          this.gameState.addMove(moveNotation);
        }
      } else if (moveNotation.length === 3) {
        // Wall placement
        const wall = notationToWall(moveNotation);
        if (wall) {
          const wallObj = { col: wall.col, row: wall.row, placedBy: activeIdx };
          if (wall.orientation === 'h') {
            this.gameState.horizontalWalls.push(wallObj);
          } else {
            this.gameState.verticalWalls.push(wallObj);
          }
          this.gameState.players[activeIdx].useWall();
          this.gameState.addMove(moveNotation);
        }
      }
      this.gameState.checkWinner();
      this.gameState.switchPlayer();
    });

    // Restore configuration settings
    this.gameState.gameMode = savedMode;
    this.gameState.botDifficulty = savedDifficulty;
    this.gameState.humanPlayerIndex = savedHumanIdx;

    this.updateBoardOrientation();

    // Re-bind previews and cache grids
    this.dragController.wallSnap.intersections = [];
    this.mouseController.wallSnap.intersections = [];
    if (this.mouseController) {
      this.mouseController.cellRects = [];
    }

    if (this.dragController) {
      this.dragController.cacheIntersections();
    }
    if (this.mouseController) {
      this.mouseController.cacheGrid();
    }

    if (this.dragPreview) {
      this.dragPreview.reappend(this.renderer.container);
    }
    if (this.moveHistoryUI) {
      this.moveHistoryUI.render(this.gameState.history);
    }

    this.hideWinModal();
    this.updateUI();
    this.saveStateToStorage();
    this.toast.show('Move undone.');
  }

  /**
   * Schedules AI turn calculation
   */
  triggerBotMove() {
    this.clearBotTimeout();
    this.renderer.setDisabled(true);
    this._setBotThinking(true);

    // Small randomized pause so the bot feels like it is considering its move
    const thinkDelay = 650 + Math.random() * 450;

    this.botTimeoutId = setTimeout(() => {
      this.botTimeoutId = null;
      if (this.gameState.winner !== null) {
        this._setBotThinking(false);
        return;
      }

      const move = getBestMove(this.gameState);
      this._setBotThinking(false);
      if (move) {
        if (move.type === 'move') {
          this.moveActivePlayer(move.col, move.row, true);
        } else if (move.type === 'wall') {
          this.placeWall(move.col, move.row, move.orientation, true);
        }
      }

      // Restore inputs if turn reverts to human player
      const nextIsBot = this.gameState.gameMode === 'ai' && this.gameState.currentPlayer !== this.gameState.humanPlayerIndex;
      if (!nextIsBot) {
        this.renderer.setDisabled(false);
      }
    }, thinkDelay);
  }

  /**
   * Toggle the "thinking" indicator on the bot's player card
   */
  _setBotThinking(on) {
    const botIdx = this.gameState.humanPlayerIndex === 0 ? 1 : 0;
    const card = document.getElementById(botIdx === 0 ? 'p1-card' : 'p2-card');
    if (card) card.classList.toggle('bot-thinking', on && this.gameState.gameMode === 'ai');
  }

  /**
   * Show the win modal after a short beat, so the final move animation
   * finishes before the overlay covers the board.
   */
  _scheduleWinner(winner) {
    if (this._winnerTimer) clearTimeout(this._winnerTimer);
    this._winnerTimer = setTimeout(() => {
      this._winnerTimer = null;
      if (this.gameState.winner !== null) {
        this.showWinner(winner, this.gameState.endReason, this.gameState.resignedBy);
      }
    }, 700);
  }

  _clearWinnerTimer() {
    if (this._winnerTimer) {
      clearTimeout(this._winnerTimer);
      this._winnerTimer = null;
    }
  }

  /**
   * Show winner modal dialog
   *
   * @param {number} winnerIdx
   * @param {string|null} endReason - 'resign', 'timeout', or null
   * @param {number|null} resignedBy - player index who resigned
   */
  showWinner(winnerIdx, endReason = null, resignedBy = null) {
    this.clearBotTimeout();
    this.stopClockTick();
    this.clearStateFromStorage();

    // Track stats for AI and online modes
    if (this.gameState.gameMode === 'ai' || this.isOnlineMode()) {
      const humanWon = winnerIdx === this.gameState.humanPlayerIndex;
      if (humanWon) {
        this._recordWin();
      } else {
        this._recordLoss();
      }
    }

    if (this.winMessage) {
      let winnerName;
      if (this.isOnlineMode()) {
        const youWon = winnerIdx === this.gameState.humanPlayerIndex;
        winnerName = youWon ? 'You Win!' : 'You Lose!';
      } else if (this.gameState.gameMode === 'ai') {
        const youWon = winnerIdx === this.gameState.humanPlayerIndex;
        winnerName = youWon ? 'You Win!' : 'Bot Wins!';
      } else {
        winnerName = winnerIdx === 0 ? 'Player 1 (Red) Wins!' : 'Player 2 (Blue) Wins!';
      }
      let winReason = '';
      if (endReason === 'resign') {
        const youResigned = resignedBy === this.gameState.humanPlayerIndex;
        winReason = youResigned ? ' (You resigned)' : ' (Opponent resigned)';
      } else if (endReason === 'timeout') {
        winReason = ' (Time out)';
      }
      this.winMessage.textContent = `${winnerName}${winReason}`;
    }

    const winRestartBtn = document.getElementById('win-restart-btn');
    if (winRestartBtn) {
      winRestartBtn.classList.remove('hidden');
      winRestartBtn.textContent = this.isOnlineMode() ? 'Rematch' : 'Play Again';
      winRestartBtn.disabled = false;
    }

    const rematchStatusText = document.getElementById('rematch-status-text');
    if (rematchStatusText) {
      rematchStatusText.classList.add('hidden');
      rematchStatusText.textContent = '';
    }

    if (this.winModal) {
      this.winModal.classList.remove('hidden');
    }
  }

  updateOnlineRematchUI(data) {
    if (!this.isOnlineMode() || !this.winModal || this.winModal.classList.contains('hidden')) {
      return;
    }

    const winRestartBtn = document.getElementById('win-restart-btn');
    const rematchStatusText = document.getElementById('rematch-status-text');
    if (!winRestartBtn || !rematchStatusText) return;

    const opponent = data.players?.find(p => p && p.index !== this.roomClient.playerIndex);
    const opponentConnected = opponent ? opponent.connected : false;

    if (!opponentConnected) {
      winRestartBtn.classList.add('hidden'); // Hide rematch button entirely
      rematchStatusText.textContent = 'Opponent has left. Rematch is no longer available.';
      rematchStatusText.classList.remove('hidden');
      return;
    }

    const rematchRequests = data.rematchRequests || [];
    const youRequested = rematchRequests.includes(this.roomClient.playerIndex);
    const opponentRequested = opponent ? rematchRequests.includes(opponent.index) : false;

    if (youRequested && opponentRequested) {
      rematchStatusText.textContent = 'Starting new match...';
      rematchStatusText.classList.remove('hidden');
      winRestartBtn.disabled = true;
      winRestartBtn.textContent = 'Starting...';
    } else if (youRequested) {
      winRestartBtn.classList.remove('hidden');
      rematchStatusText.textContent = 'Waiting for opponent to accept...';
      rematchStatusText.classList.remove('hidden');
      winRestartBtn.disabled = true;
      winRestartBtn.textContent = 'Waiting...';
    } else if (opponentRequested) {
      winRestartBtn.classList.remove('hidden');
      rematchStatusText.textContent = 'Opponent wants a rematch!';
      rematchStatusText.classList.remove('hidden');
      winRestartBtn.disabled = false;
      winRestartBtn.textContent = 'Accept Rematch';
    } else {
      winRestartBtn.classList.remove('hidden');
      rematchStatusText.classList.add('hidden');
      winRestartBtn.disabled = false;
      winRestartBtn.textContent = 'Rematch';
    }
  }

  /**
   * Hide winner modal
   */
  hideWinModal() {
    if (this.winModal) {
      this.winModal.classList.add('hidden');
    }
    // Restore Play Again button visibility
    document.getElementById('win-restart-btn')?.classList.remove('hidden');
  }

  /**
   * Save active game state and theme settings to localStorage
   */
  saveStateToStorage() {
    if (this.isOnlineMode()) return;
    try {
      const payload = this.gameState.serialize();
      if (this.isPuzzleMode() && this.puzzleSession) {
        payload.puzzleSession = {
          puzzleDate: this.puzzleSession.puzzleDate,
          currentIndex: this.puzzleSession.currentIndex,
          solved: this.puzzleSession.solved,
          gaveUp: this.puzzleSession.gaveUp,
          locked: this.puzzleSession.locked,
          showingSolution: this.puzzleSession.showingSolution
        };
      }
      localStorage.setItem('barricade_game_state_v1', JSON.stringify(payload));
      localStorage.setItem('barricade_theme_v1', document.body.classList.contains('light-theme') ? 'light' : 'dark');
    } catch (e) {
      console.error('Failed to save game state to localStorage:', e);
    }
  }

  /**
   * Clear active game state from localStorage (used at match end or manual exit)
   */
  clearStateFromStorage() {
    try {
      localStorage.removeItem('barricade_game_state_v1');
    } catch (e) {
      console.error('Failed to clear game state:', e);
    }
  }

  /**
   * Restore theme preferences and active match state from localStorage on startup
   */
  loadStateFromStorage() {
    try {
      // 1. Restore light/dark theme preference
      const savedTheme = localStorage.getItem('barricade_theme_v1');
      const themeToggleBtn = document.getElementById('theme-toggle-btn');
      if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
      } else {
        document.body.classList.remove('light-theme');
        if (themeToggleBtn) themeToggleBtn.textContent = '🌙';
      }

      // 2. Restore active match state
      const savedState = localStorage.getItem('barricade_game_state_v1');
      if (savedState) {
        const data = JSON.parse(savedState);

        // Online games reconnect via session only — never restore from localStorage
        if (data.gameMode === 'online') {
          this.clearStateFromStorage();
        } else {
          this.gameState.deserialize(data);

          const puzzleRestored = data.gameMode === 'puzzle' && this._restorePuzzleFromSaved(data);

          // Hide lobby overlay
          this.hideLobby();

          // Re-initialize board logic and visual layers
          this.board.init();
          this.renderer.init();
          this.updateBoardOrientation();

          // Re-append preview elements (needed because DOM is rebuilt)
          if (this.dragPreview) {
            this.dragPreview.reappend(this.renderer.container);
          }

          // Re-render move history in UI
          if (this.moveHistoryUI) {
            this.moveHistoryUI.render(this.gameState.history);
          }

          // Sync lobby controller selections to match restored data
          this.selectedMode = this.gameState.gameMode;
          this.selectedDifficulty = this.gameState.botDifficulty;
          this.selectedSide = this.gameState.humanPlayerIndex;
          this.updateLobbySelectionUI();

          // If there was already a winner, display the dialog
          if (this.gameState.winner !== null) {
            this.showWinner(this.gameState.winner);
          }

          this.updateUI();

          if (puzzleRestored) {
            this.dragController.wallSnap.intersections = [];
            this.mouseController.wallSnap.intersections = [];
            if (this.mouseController) this.mouseController.cellRects = [];
            setTimeout(() => {
              this.dragController.cacheIntersections();
              this.mouseController.cacheGrid();
            }, 450);
          }

          // If it's vs Bot and it's the Bot's turn, trigger its play loop
          const isBotTurn = this.gameState.gameMode === 'ai' &&
            this.gameState.currentPlayer !== this.gameState.humanPlayerIndex;
          if (!puzzleRestored && this.gameState.winner === null && isBotTurn) {
            this.triggerBotMove();
          }
        }
      }
    } catch (e) {
      console.error('Failed to load game state from localStorage:', e);
      this.clearStateFromStorage();
    }
  }

  /**
   * Flip the board 180 degrees if the human player is Player 2 in VS Bot mode,
   * so they are always on the lower side of the screen.
   */
  updateBoardOrientation() {
    const boardGrid = this.renderer.container;
    if (!boardGrid) return;
    const isFlipped = (this.gameState.gameMode === 'ai' || this.gameState.gameMode === 'online' || this.isPuzzleMode())
      && this.gameState.humanPlayerIndex === 1;
    if (isFlipped) {
      boardGrid.classList.add('flipped');
    } else {
      boardGrid.classList.remove('flipped');
    }
  }

  /**
   * Sync Lobby UI to match current active selections (used on state restore)
   */
  updateLobbySelectionUI() {
    // Sync quick-play difficulty dropdown
    const quickDiff = document.getElementById('quick-bot-difficulty');
    if (quickDiff) quickDiff.value = this.selectedDifficulty;

    // Sync create room mode toggle
    const casualBtn = document.getElementById('lobby-mode-casual');
    const rankedBtn = document.getElementById('lobby-mode-ranked');
    casualBtn?.classList.toggle('active', this._lobbyMode !== 'Ranked');
    rankedBtn?.classList.toggle('active', this._lobbyMode === 'Ranked');
  }
}
