/**
 * Sidebar UI Component
 */

export class Sidebar {
  /**
   * @param {Object} handlers - Button click callback handlers
   * @param {Function} handlers.onRestart - Restart match callback
   * @param {Function} handlers.onResign - Resign match callback
   * @param {Function} handlers.onLobby - Return to lobby callback
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    
    // Cards
    this.p1Card = document.getElementById('p1-card');
    this.p2Card = document.getElementById('p2-card');
    
    // Remaining wall texts
    this.p1WallsText = document.getElementById('p1-walls-text');
    this.p2WallsText = document.getElementById('p2-walls-text');
    
    // Buttons
    this.restartBtn = document.getElementById('restart-btn');
    this.resignBtn = document.getElementById('resign-btn');
    this.lobbyBtn = document.getElementById('lobby-btn');
    this.undoBtn = document.getElementById('undo-btn');
    
    this.initEvents();
  }

  /**
   * Bind event listeners to UI buttons
   */
  initEvents() {
    if (this.restartBtn) {
      this.restartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof this.handlers.onRestart === 'function') {
          this.handlers.onRestart();
        }
      });
    }
    
    if (this.resignBtn) {
      this.resignBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof this.handlers.onResign === 'function') {
          this.handlers.onResign();
        }
      });
    }

    if (this.lobbyBtn) {
      this.lobbyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof this.handlers.onLobby === 'function') {
          this.handlers.onLobby();
        }
      });
    }

    if (this.undoBtn) {
      this.undoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof this.handlers.onUndo === 'function') {
          this.handlers.onUndo();
        }
      });
    }
  }

  /**
   * Update active turn indicator and remaining barricades count in the UI
   *
   * @param {number} currentPlayer - Index of current player (0 or 1)
   * @param {number} p1Walls - Player 1 remaining walls
   * @param {number} p2Walls - Player 2 remaining walls
   */
  update(currentPlayer, p1Walls, p2Walls) {
    // Update wall count labels
    if (this.p1WallsText) this.p1WallsText.textContent = `${p1Walls}/10`;
    if (this.p2WallsText) this.p2WallsText.textContent = `${p2Walls}/10`;

    // Highlight current player turn
    if (currentPlayer === 0) {
      this.p1Card?.classList.add('active-turn');
      this.p2Card?.classList.remove('active-turn');
    } else {
      this.p2Card?.classList.add('active-turn');
      this.p1Card?.classList.remove('active-turn');
    }
  }
}
