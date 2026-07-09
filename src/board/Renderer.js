/**
 * Board Renderer
 */

import { PLAYER_COLORS } from '../utils/Constants.js';

export class Renderer {
  /**
   * @param {string} boardContainerId - The DOM container element ID for the board
   */
  constructor(boardContainerId = 'board') {
    this.container = document.getElementById(boardContainerId);
    this.cellElements = []; // 2D array [row][col] mapping to cell divs
    this.tokens = [];       // Array containing player 1 and 2 pawn elements
    
    this.init();
  }

  /**
   * Setup grid layout, cell elements, labels, and player tokens
   */
  init() {
    if (!this.container) return;
    this.container.innerHTML = '';
    
    // Assign CSS class for grid definitions
    this.container.className = 'board-grid';

    // Initialize 9x9 cells caching array
    this.cellElements = [];
    for (let r = 0; r < 9; r++) {
      this.cellElements.push(new Array(9).fill(null));
    }

    // Track which walls have already been rendered to avoid re-flashing them
    this.renderedWallKeys = new Set();

    // Generate board cells: row index 8 (top) down to index 0 (bottom)
    for (let r = 8; r >= 0; r--) {
      for (let c = 0; c < 9; c++) {
        const cellDiv = document.createElement('div');
        cellDiv.className = 'board-cell';
        cellDiv.dataset.col = c;
        cellDiv.dataset.row = r;

        // Apply visual tints for each player's goal row
        if (r === 8) {
          cellDiv.classList.add('p1-goal-cell'); // Red goal row
        } else if (r === 0) {
          cellDiv.classList.add('p2-goal-cell'); // Blue goal row
        }

        // Place cell in the 18x18 CSS Grid
        cellDiv.style.gridRow = `${17 - 2 * r}`;
        cellDiv.style.gridColumn = `${2 * c + 1}`;

        this.container.appendChild(cellDiv);
        this.cellElements[r][c] = cellDiv;
      }
    }

    // Add algebraic coordinates labels
    const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    
    // Column indicators (a-i) on the bottom row (track 18)
    for (let c = 0; c < 9; c++) {
      const label = document.createElement('div');
      label.className = 'board-label board-label-col';
      label.textContent = columns[c];
      label.style.gridRow = '18';
      label.style.gridColumn = `${2 * c + 1}`;
      this.container.appendChild(label);
    }

    // Row indicators (1-9) on the rightmost column (track 18)
    for (let r = 0; r < 9; r++) {
      const label = document.createElement('div');
      label.className = 'board-label board-label-row';
      label.textContent = `${r + 1}`;
      label.style.gridRow = `${17 - 2 * r}`;
      label.style.gridColumn = '18';
      this.container.appendChild(label);
    }

    // Create persistent player pawns
    this.tokens = [
      this.createPlayerToken(0),
      this.createPlayerToken(1)
    ];
  }

  /**
   * Create HTML token for a player
   * @param {number} playerIndex
   * @returns {HTMLElement}
   */
  createPlayerToken(playerIndex) {
    const token = document.createElement('div');
    token.className = `player-token player-${playerIndex}`;
    token.style.backgroundColor = PLAYER_COLORS[playerIndex];
    
    // Inner dot/glow container
    const dot = document.createElement('div');
    dot.className = 'player-token-inner';
    token.appendChild(dot);
    
    return token;
  }

  /**
   * Render players in their current cells with a micro-animation
   * @param {Array<Player>} players
   */
  renderPlayers(players) {
    players.forEach((player, idx) => {
      const cellElement = this.cellElements[player.row][player.col];
      if (cellElement && this.tokens[idx].parentElement !== cellElement) {
        // Trigger subtle movement animation
        this.tokens[idx].classList.remove('move-pulse');
        void this.tokens[idx].offsetWidth; // trigger reflow
        this.tokens[idx].classList.add('move-pulse');
        cellElement.appendChild(this.tokens[idx]);
      }
    });
  }

  /**
   * Highlight valid move options on the board
   * @param {Array<{col: number, row: number}>} legalMoves
   */
  renderHighlights(legalMoves) {
    // Remove all old highlights
    const highlighted = this.container.querySelectorAll('.cell-highlight');
    highlighted.forEach(el => el.classList.remove('cell-highlight'));

    // Apply new highlights
    legalMoves.forEach(move => {
      const cellElement = this.cellElements[move.row][move.col];
      if (cellElement) {
        cellElement.classList.add('cell-highlight');
      }
    });
  }

  /**
   * Render placed walls incrementally — only appends NEW walls since the last call.
   * Existing wall elements are never removed or recreated, preventing reflow flashes.
   *
   * @param {Array<Wall>} horizontalWalls
   * @param {Array<Wall>} verticalWalls
   */
  renderPlacedWalls(horizontalWalls, verticalWalls) {
    const makeKey = (orientation, col, row) => `${orientation},${col},${row}`;

    // Horizontal walls
    horizontalWalls.forEach(wall => {
      const key = makeKey('h', wall.col, wall.row);
      if (this.renderedWallKeys.has(key)) return; // already in DOM
      this.renderedWallKeys.add(key);

      const wallDiv = document.createElement('div');
      const playerClass = wall.placedBy !== null && wall.placedBy !== undefined ? `wall-p${wall.placedBy}` : 'wall-p0';
      wallDiv.className = `wall-placed wall-horizontal placement-bounce ${playerClass}`;
      wallDiv.style.gridRow = `${16 - 2 * wall.row}`;
      wallDiv.style.gridColumn = `${2 * wall.col + 1} / span 3`;
      this.container.appendChild(wallDiv);
    });

    // Vertical walls
    verticalWalls.forEach(wall => {
      const key = makeKey('v', wall.col, wall.row);
      if (this.renderedWallKeys.has(key)) return; // already in DOM
      this.renderedWallKeys.add(key);

      const wallDiv = document.createElement('div');
      const playerClass = wall.placedBy !== null && wall.placedBy !== undefined ? `wall-p${wall.placedBy}` : 'wall-p0';
      wallDiv.className = `wall-placed wall-vertical placement-bounce ${playerClass}`;
      wallDiv.style.gridColumn = `${2 * wall.col + 2}`;
      wallDiv.style.gridRow = `${15 - 2 * wall.row} / span 3`;
      this.container.appendChild(wallDiv);
    });
  }

  /**
   * Remove all rendered wall elements from the DOM and reset the tracking set.
   * Call this on board resets/restarts, not on regular turns.
   */
  clearWalls() {
    const existing = this.container.querySelectorAll('.wall-placed');
    existing.forEach(el => el.remove());
    this.renderedWallKeys = new Set();
  }

  /**
   * Set board interactions disabled (e.g. at game end)
   * @param {boolean} disabled
   */
  setDisabled(disabled) {
    if (disabled) {
      this.container.classList.add('board-disabled');
    } else {
      this.container.classList.remove('board-disabled');
    }
  }
}
