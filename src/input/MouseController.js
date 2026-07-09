/**
 * Mouse Click and Hover Controller for Pawn Movement & Direct Barricade Placements
 */

export class MouseController {
  /**
   * @param {Game} game - The main Game instance
   * @param {Renderer} renderer - The board Renderer instance
   */
  constructor(game, renderer) {
    this.game = game;
    this.renderer = renderer;
    
    // Cached hover details for direct wall placements
    this.activeWallHover = null; // { col, row, orientation, isValid }
    
    // Grid bounding boxes cache
    this.cellRects = [];
    
    this.initEvents();
  }

  /**
   * Set up board event delegation for clicks and hover movement
   */
  initEvents() {
    const boardContainer = this.renderer.container;
    if (!boardContainer) return;

    // Cache cell boundaries when mouse enters the board to avoid layout thrashing
    boardContainer.addEventListener('mouseenter', () => this.cacheGrid());

    // Track cursor moves to render wall guides on borders
    boardContainer.addEventListener('mousemove', (e) => this.onMouseMove(e));
    
    // Hide previews when cursor exits the grid
    boardContainer.addEventListener('mouseleave', () => this.onMouseLeave());

    // Delegate clicks for pawn movements or wall placements
    boardContainer.addEventListener('click', (e) => this.onClick(e));

    // Clear rect cache on window resize
    window.addEventListener('resize', () => {
      this.cellRects = [];
    });
  }

  /**
   * Cache client bounding boxes for all cells
   */
  cacheGrid() {
    this.cellRects = [];
    const cells = this.renderer.cellElements;
    for (let r = 0; r < 9; r++) {
      const rowRects = [];
      for (let c = 0; c < 9; c++) {
        const el = cells[r][c];
        if (el) {
          rowRects.push(el.getBoundingClientRect());
        } else {
          rowRects.push(null);
        }
      }
      this.cellRects.push(rowRects);
    }
  }

  /**
   * Evaluate proximity of cursor to cell edges to suggest wall placements
   * @param {MouseEvent} e
   */
  onMouseMove(e) {
    if (this.game.gameState.winner !== null) {
      this.clearHover();
      return;
    }

    const activeIdx = this.game.gameState.currentPlayer;
    const isHumanTurn = this.game.gameState.gameMode === 'local' || 
                        activeIdx === this.game.gameState.humanPlayerIndex;
    
    const player = this.game.gameState.players[activeIdx];

    // If it's not the human's turn or they have no walls left, skip wall previews
    if (!isHumanTurn || player.walls <= 0) {
      this.clearHover();
      return;
    }

    // Lazy load grid rect cache if not already populated
    if (this.cellRects.length === 0) {
      this.cacheGrid();
    }
    if (this.cellRects.length === 0) return;

    const mx = e.clientX;
    const my = e.clientY;

    let closestCell = null;
    let minDist = Infinity;
    let closestRow = 0;
    let closestCol = 0;

    // Find cell closest to mouse center
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const rect = this.cellRects[r][c];
        if (!rect) continue;

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = (mx - cx) ** 2 + (my - cy) ** 2;

        if (dist < minDist) {
          minDist = dist;
          closestCell = rect;
          closestRow = r;
          closestCol = c;
        }
      }
    }

    if (!closestCell) {
      this.clearHover();
      return;
    }

    // Relative offset inside the resolved closest cell
    const isFlipped = this.renderer.container.classList.contains('flipped');
    const x = isFlipped ? (closestCell.right - mx) : (mx - closestCell.left);
    const y = isFlipped ? (closestCell.bottom - my) : (my - closestCell.top);
    const w = closestCell.width;
    const h = closestCell.height;

    // Verify if the cursor is inside the cell box bounds
    const isInsideBox = (x >= 0 && x <= w && y >= 0 && y <= h);
    if (isInsideBox) {
      // Do not suggest wall placements when hover is on the box itself
      this.clearHover();
      return;
    }

    // Since the mouse is outside the cell boundaries, it is strictly in the grid gaps (lines)
    const distX = Math.min(Math.abs(x), Math.abs(w - x));
    const distY = Math.min(Math.abs(y), Math.abs(h - y));

    let isWallHover = false;
    let wallCol = 0;
    let wallRow = 0;
    let wallOrientation = '';

    if (distX < distY) {
      // Near vertical cell edge -> Suggest VERTICAL barricade
      wallOrientation = 'v';
      
      if (x < 0) {
        // Left gap (vertical line is between closestCol - 1 and closestCol)
        if (closestCol > 0) {
          isWallHover = true;
          wallCol = closestCol - 1;
        }
      } else {
        // Right gap (vertical line is between closestCol and closestCol + 1)
        if (closestCol < 8) {
          isWallHover = true;
          wallCol = closestCol;
        }
      }
      
      // Snapping row coordinate: vertical wall covers 2 rows
      if (y < h / 2) {
        wallRow = Math.min(7, closestRow);                  // top half (y < h/2 is upper screen position)
      } else {
        wallRow = Math.max(0, Math.min(7, closestRow - 1)); // bottom half (y >= h/2 is lower screen position)
      }
    } else {
      // Near horizontal cell edge -> Suggest HORIZONTAL barricade
      wallOrientation = 'h';
      
      if (y < 0) {
        // Top gap (horizontal line is between closestRow and closestRow + 1)
        if (closestRow < 8) {
          isWallHover = true;
          wallRow = closestRow;
        }
      } else {
        // Bottom gap (horizontal line is between closestRow - 1 and closestRow)
        if (closestRow > 0) {
          isWallHover = true;
          wallRow = closestRow - 1;
        }
      }
      
      // Snapping column coordinate: horizontal wall covers 2 columns
      if (x < w / 2) {
        wallCol = Math.max(0, Math.min(7, closestCol - 1)); // left half
      } else {
        wallCol = Math.min(7, closestCol);                  // right half
      }
    }

    if (isWallHover) {
      // Verify validity
      const isValid = this.game.verifyWallPlacement(wallCol, wallRow, wallOrientation);
      this.activeWallHover = { col: wallCol, row: wallRow, orientation: wallOrientation, isValid };
      this.game.dragPreview.show(wallCol, wallRow, wallOrientation, isValid);
    } else {
      this.clearHover();
    }
  }

  /**
   * Process mouse clicks on the board
   * @param {MouseEvent} e
   */
  onClick(e) {
    if (this.game.gameState.winner !== null) return;

    // 1. If clicking near cell edge while hover preview is active, trigger placement
    if (this.activeWallHover && this.activeWallHover.isValid) {
      e.stopPropagation();
      e.preventDefault();
      
      const { col, row, orientation } = this.activeWallHover;
      this.clearHover();
      this.game.placeWall(col, row, orientation);
      return;
    }

    // 2. Otherwise, check for highlighted cell clicks (Pawn movement)
    const highlightedCell = e.target.closest('.board-cell.cell-highlight');
    if (highlightedCell) {
      const col = parseInt(highlightedCell.dataset.col, 10);
      const row = parseInt(highlightedCell.dataset.row, 10);
      this.game.moveActivePlayer(col, row);
    }
  }

  /**
   * Reset preview on mouse leave
   */
  onMouseLeave() {
    this.clearHover();
  }

  /**
   * Clear active hover guides
   */
  clearHover() {
    this.activeWallHover = null;
    this.game.dragPreview.hide();
  }
}
