/**
 * Mouse Click and Hover Controller for Pawn Movement & Direct Barricade Placements
 */

import { WallSnap } from './WallSnap.js';

export class MouseController {
  /**
   * @param {Game} game - The main Game instance
   * @param {Renderer} renderer - The board Renderer instance
   */
  constructor(game, renderer) {
    this.game = game;
    this.renderer = renderer;
    this.wallSnap = new WallSnap(renderer);

    this.activeWallHover = null;
    this.cellRects = [];
    this._moveRaf = null;
    this._pendingMove = null;

    this.initEvents();
  }

  initEvents() {
    const boardContainer = this.renderer.container;
    if (!boardContainer) return;

    boardContainer.addEventListener('mouseenter', () => {
      this.cacheGrid();
      this.wallSnap.cacheIntersections();
    });

    boardContainer.addEventListener('mousemove', (e) => this.onMouseMove(e));
    boardContainer.addEventListener('mouseleave', () => this.onMouseLeave());
    boardContainer.addEventListener('click', (e) => this.onClick(e));

    window.addEventListener('resize', () => {
      this.cellRects = [];
      this.wallSnap.intersections = [];
    });
  }

  cacheGrid() {
    this.cellRects = [];
    const cells = this.renderer.cellElements;
    for (let r = 0; r < 9; r++) {
      const rowRects = [];
      for (let c = 0; c < 9; c++) {
        const el = cells[r][c];
        rowRects.push(el ? el.getBoundingClientRect() : null);
      }
      this.cellRects.push(rowRects);
    }
    this.wallSnap.cacheIntersections();
  }

  onMouseMove(e) {
    this._pendingMove = e;
    if (this._moveRaf) return;

    this._moveRaf = requestAnimationFrame(() => {
      this._moveRaf = null;
      if (this._pendingMove) {
        this._handleMouseMove(this._pendingMove);
        this._pendingMove = null;
      }
    });
  }

  _handleMouseMove(e) {
    if (this.game.gameState.winner !== null) {
      this.clearHover();
      return;
    }

    const activeIdx = this.game.gameState.currentPlayer;
    const isHumanTurn = this.game.isLocalPlayerTurn();
    const player = this.game.gameState.players[activeIdx];

    if (!isHumanTurn || player.walls <= 0) {
      this.clearHover();
      return;
    }

    if (this.wallSnap.intersections.length === 0) {
      this.cacheGrid();
    }
    if (this.wallSnap.intersections.length === 0) return;

    const snap = this.wallSnap.resolve(e.clientX, e.clientY);
    if (!snap) {
      this.clearHover();
      return;
    }

    const isValid = this.game.verifyWallPlacement(snap.col, snap.row, snap.orientation);
    this.activeWallHover = { col: snap.col, row: snap.row, orientation: snap.orientation, isValid };
    this.game.dragPreview.show(snap.col, snap.row, snap.orientation, isValid);
  }

  onClick(e) {
    if (this.game.gameState.winner !== null) return;

    const highlightedCell = e.target.closest('.board-cell.cell-highlight');
    if (highlightedCell) {
      const col = parseInt(highlightedCell.dataset.col, 10);
      const row = parseInt(highlightedCell.dataset.row, 10);
      this.clearHover();
      this.game.moveActivePlayer(col, row);
      return;
    }

    if (this.activeWallHover && this.activeWallHover.isValid) {
      e.stopPropagation();
      e.preventDefault();

      const { col, row, orientation } = this.activeWallHover;
      this.clearHover();
      this.game.placeWall(col, row, orientation);
    }
  }

  onMouseLeave() {
    this.clearHover();
  }

  clearHover() {
    this.activeWallHover = null;
    this.wallSnap.clear();
    this.game.dragPreview.hide();
  }
}
