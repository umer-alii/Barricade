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

    this.initModalEvents();
    this.initLobbyEvents();
    this.initThemeEvents();

    // Auto-restore any active match on page refresh
    this.loadStateFromStorage();
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
      this.winRestartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.hideWinModal();
        this.restartGame();
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
   * Bind event listeners to lobby options and selections
   */
  initLobbyEvents() {
    this.lobbyModal = document.getElementById('lobby-modal');
    const modeLocalBtn = document.getElementById('mode-local-btn');
    const modeAiBtn = document.getElementById('mode-ai-btn');
    const difficultyGroup = document.getElementById('difficulty-group');
    const colorGroup = document.getElementById('color-group');
    const startMatchBtn = document.getElementById('start-match-btn');

    this.selectedMode = 'local';
    this.selectedDifficulty = 'medium';
    this.selectedSide = 0; // 0 = Red, 1 = Blue

    if (modeLocalBtn && modeAiBtn) {
      modeLocalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedMode = 'local';
        modeLocalBtn.classList.add('active');
        modeAiBtn.classList.remove('active');
        difficultyGroup?.classList.add('hidden');
        colorGroup?.classList.add('hidden');
      });

      modeAiBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedMode = 'ai';
        modeAiBtn.classList.add('active');
        modeLocalBtn.classList.remove('active');
        difficultyGroup?.classList.remove('hidden');
        colorGroup?.classList.remove('hidden');
      });
    }

    const diffBtns = document.querySelectorAll('.lobby-diff-btn');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        diffBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedDifficulty = btn.dataset.diff;
      });
    });

    const colorRedBtn = document.getElementById('color-red-btn');
    const colorBlueBtn = document.getElementById('color-blue-btn');
    if (colorRedBtn && colorBlueBtn) {
      colorRedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedSide = 0;
        colorRedBtn.classList.add('active');
        colorBlueBtn.classList.remove('active');
      });

      colorBlueBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedSide = 1;
        colorBlueBtn.classList.add('active');
        colorRedBtn.classList.remove('active');
      });
    }

    if (startMatchBtn) {
      startMatchBtn.addEventListener('click', (e) => {
        e.preventDefault();

        // Save selection choices to GameState
        this.gameState.gameMode = this.selectedMode;
        this.gameState.botDifficulty = this.selectedDifficulty;
        this.gameState.humanPlayerIndex = this.selectedSide;

        // Reset board layout and hide lobby
        this.restartGame();
        this.hideLobby();
      });
    }
  }

  /**
   * Show Lobby overlay modal
   */
  showLobby() {
    this.clearBotTimeout();
    this.clearStateFromStorage();
    if (this.lobbyModal) {
      this.lobbyModal.classList.remove('hidden');
    }
    this.renderer.setDisabled(true);
  }

  /**
   * Hide Lobby overlay modal
   */
  hideLobby() {
    if (this.lobbyModal) {
      this.lobbyModal.classList.add('hidden');
    }
    this.renderer.setDisabled(false);
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
  moveActivePlayer(col, row) {
    if (this.gameState.winner !== null) return;

    const activeIdx = this.gameState.currentPlayer;
    const player = this.gameState.players[activeIdx];
    const opponent = this.gameState.players[activeIdx === 0 ? 1 : 0];

    // Compute legal moves
    const legalMoves = getLegalMoves(
      player,
      opponent,
      this.gameState.horizontalWalls,
      this.gameState.verticalWalls
    );

    const isLegal = legalMoves.some(m => m.col === col && m.row === row);
    if (!isLegal) return;

    // Relocate pawn
    player.moveTo(col, row);

    // Generate algebraic notation
    const notation = cellToNotation(col, row);

    // Finalize action
    const winner = this.turnManager.commitAction(this.gameState, notation);

    this.updateUI();
    this.saveStateToStorage();

    if (winner !== null) {
      this.showWinner(winner);
    }
  }

  /**
   * Place barricade on the board
   *
   * @param {number} col
   * @param {number} row
   * @param {string} orientation
   */
  placeWall(col, row, orientation) {
    if (this.gameState.winner !== null) return;

    const activeIdx = this.gameState.currentPlayer;
    const player = this.gameState.players[activeIdx];

    // Check inventory
    if (player.walls <= 0) {
      this.toast.show(TOAST_MESSAGES.NO_WALLS_LEFT);
      return;
    }

    // Run verification logic
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

    // Place and register wall — tagged with the placing player's index
    const wallSpec = { col, row, orientation, placedBy: activeIdx };
    if (orientation === WALL_ORIENTATIONS.HORIZONTAL) {
      this.gameState.horizontalWalls.push(wallSpec);
    } else {
      this.gameState.verticalWalls.push(wallSpec);
    }

    // Consume wall inventory
    player.useWall();

    // Generate history notation
    const notation = wallToNotation(col, row, orientation);

    // Finalize action
    const winner = this.turnManager.commitAction(this.gameState, notation);

    this.updateUI();
    this.saveStateToStorage();

    if (winner !== null) {
      this.showWinner(winner);
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

    // Resigning player forfeits, declaring opponent winner
    const resigningIdx = this.gameState.currentPlayer;
    const winnerIdx = resigningIdx === 0 ? 1 : 0;
    this.gameState.winner = winnerIdx;

    this.updateUI();
    this.showWinner(winnerIdx, true);
  }

  /**
   * Completely restarts matches and resets all states
   */
  restartGame() {
    this.clearBotTimeout();
    this.gameState.reset();
    this.board.init();
    this.renderer.init();
    this.updateBoardOrientation();

    // Re-append the preview element to the newly cleared board container
    if (this.dragPreview) {
      this.dragPreview.reappend(this.renderer.container);
    }

    // Rebind drag and hover controllers caches (due to board DOM rebuilding)
    this.dragController.cachedIntersections = [];
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

    const isBotTurn = this.gameState.gameMode === 'ai' && this.gameState.currentPlayer !== this.gameState.humanPlayerIndex;

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

      // Highlights only visible when it's the human's turn
      if (!isBotTurn) {
        this.renderer.renderHighlights(legalMoves);
        this.renderer.setDisabled(false);
      } else {
        this.renderer.renderHighlights([]);
        this.renderer.setDisabled(true); // Disable board input while bot plays
      }
    } else {
      // Clear highlights and disable interaction
      this.renderer.renderHighlights([]);
      this.renderer.setDisabled(true);
    }

    // 4. Update sidebar labels
    this.sidebar.update(
      this.gameState.currentPlayer,
      this.gameState.players[0].walls,
      this.gameState.players[1].walls
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
   * Undoes the last turn (player move + bot reply, or just player move if bot is mid-turn).
   * Only active in Play vs Bot mode.
   */
  undoMoves() {
    if (this.gameState.gameMode !== 'ai') return;
    if (this.gameState.history.length === 0) {
      this.toast.show('No moves to undo.');
      return;
    }

    // Cancel any scheduled bot move timeout
    this.clearBotTimeout();

    // Determine how many moves to undo:
    // If it's currently the bot's turn, we undo 1 move (the player's latest move).
    // If it's the player's turn, we undo 2 moves (the player's move + the bot's response).
    const isBotTurn = this.gameState.currentPlayer !== this.gameState.humanPlayerIndex;
    const count = isBotTurn ? 1 : 2;

    if (this.gameState.history.length < count) {
      this.toast.show('No moves to undo.');
      return;
    }

    const targetHistory = this.gameState.history.slice(0, -count);

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
    this.dragController.cachedIntersections = [];
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
    this.toast.show('Moves undone.');
  }

  /**
   * Schedules AI turn calculation
   */
  triggerBotMove() {
    this.clearBotTimeout();
    this.renderer.setDisabled(true);

    this.botTimeoutId = setTimeout(() => {
      this.botTimeoutId = null;
      if (this.gameState.winner !== null) return;

      const move = getBestMove(this.gameState);
      if (move) {
        if (move.type === 'move') {
          this.moveActivePlayer(move.col, move.row);
        } else if (move.type === 'wall') {
          this.placeWall(move.col, move.row, move.orientation);
        }
      }

      // Restore inputs if turn reverts to human player
      const nextIsBot = this.gameState.gameMode === 'ai' && this.gameState.currentPlayer !== this.gameState.humanPlayerIndex;
      if (!nextIsBot) {
        this.renderer.setDisabled(false);
      }
    }, 550);
  }

  /**
   * Show winner modal dialog
   *
   * @param {number} winnerIdx
   * @param {boolean} isResigned
   */
  showWinner(winnerIdx, isResigned = false) {
    this.clearBotTimeout();
    this.clearStateFromStorage();
    if (this.winMessage) {
      const winnerName = winnerIdx === 0 ? 'Player 1 (Red)' : 'Player 2 (Blue)';
      const winReason = isResigned ? ' (Opponent resigned)' : '';
      this.winMessage.textContent = `${winnerName} Wins!${winReason}`;
    }

    if (this.winModal) {
      this.winModal.classList.remove('hidden');
    }
  }

  /**
   * Hide winner modal
   */
  hideWinModal() {
    if (this.winModal) {
      this.winModal.classList.add('hidden');
    }
  }

  /**
   * Save active game state and theme settings to localStorage
   */
  saveStateToStorage() {
    try {
      localStorage.setItem('barricade_game_state_v1', JSON.stringify(this.gameState.serialize()));
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
        this.gameState.deserialize(data);

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

        // If it's vs Bot and it's the Bot's turn, trigger its play loop
        const isBotTurn = this.gameState.gameMode === 'ai' &&
          this.gameState.currentPlayer !== this.gameState.humanPlayerIndex;
        if (this.gameState.winner === null && isBotTurn) {
          this.triggerBotMove();
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
    const isFlipped = this.gameState.gameMode === 'ai' && this.gameState.humanPlayerIndex === 1;
    if (isFlipped) {
      boardGrid.classList.add('flipped');
    } else {
      boardGrid.classList.remove('flipped');
    }
  }

  /**
   * Sync Lobby Setup buttons to match current active selections
   */
  updateLobbySelectionUI() {
    // Game mode toggles — IDs from index.html
    const modeLocal = document.getElementById('mode-local-btn');
    const modeBot = document.getElementById('mode-ai-btn');
    const diffGroup = document.getElementById('difficulty-group');
    const colorGroup = document.getElementById('color-group');

    if (this.selectedMode === 'local') {
      modeLocal?.classList.add('active');
      modeBot?.classList.remove('active');
      diffGroup?.classList.add('hidden');
      colorGroup?.classList.add('hidden');
    } else {
      modeLocal?.classList.remove('active');
      modeBot?.classList.add('active');
      diffGroup?.classList.remove('hidden');
      colorGroup?.classList.remove('hidden');
    }

    // Difficulty selection grid buttons
    const diffButtons = document.querySelectorAll('.lobby-diff-btn');
    diffButtons.forEach(btn => {
      if (btn.dataset.diff === this.selectedDifficulty) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Play color choice buttons
    const sideButtons = document.querySelectorAll('.lobby-color-btn');
    sideButtons.forEach(btn => {
      if (parseInt(btn.dataset.side, 10) === this.selectedSide) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
}
