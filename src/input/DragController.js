/**
 * Drag and Drop Controller for Barricade Placement
 */

export class DragController {
  /**
   * @param {Game} game - The main Game instance
   * @param {Renderer} renderer - The board Renderer instance
   * @param {DragPreview} dragPreview - The DragPreview helper instance
   */
  constructor(game, renderer, dragPreview) {
    this.game = game;
    this.renderer = renderer;
    this.dragPreview = dragPreview;
    
    this.activeDragOrientation = null;
    this.cachedIntersections = [];
    
    this.initEvents();
  }

  /**
   * Bind event listeners for dragging from sidebar to board
   */
  initEvents() {
    const horizontalTemplate = document.getElementById('drag-wall-h');
    const verticalTemplate = document.getElementById('drag-wall-v');
    const boardContainer = this.renderer.container;

    if (horizontalTemplate) {
      horizontalTemplate.addEventListener('dragstart', (e) => this.onDragStart(e, 'h'));
      horizontalTemplate.addEventListener('dragend', (e) => this.onDragEnd(e));
    }

    if (verticalTemplate) {
      verticalTemplate.addEventListener('dragstart', (e) => this.onDragStart(e, 'v'));
      verticalTemplate.addEventListener('dragend', (e) => this.onDragEnd(e));
    }

    if (boardContainer) {
      boardContainer.addEventListener('dragover', (e) => this.onDragOver(e));
      boardContainer.addEventListener('dragleave', (e) => this.onDragLeave(e));
      boardContainer.addEventListener('drop', (e) => this.onDrop(e));
    }
  }

  /**
   * Handle drag start: cache grid intersection center points to prevent layout thrashing
   * @param {DragEvent} e
   * @param {string} orientation - 'h' or 'v'
   */
  onDragStart(e, orientation) {
    if (this.game.gameState.winner !== null) {
      e.preventDefault();
      return;
    }
    
    this.activeDragOrientation = orientation;
    this.cacheIntersections();
    
    const target = e.target;
    if (target) {
      const originalWidth = target.style.width;
      const originalHeight = target.style.height;
      
      // Temporarily resize to board scale so browser captures full-size drag image
      if (orientation === 'h') {
        target.style.width = '130px';
        target.style.height = '14px';
      } else {
        target.style.width = '14px';
        target.style.height = '130px';
      }
      
      // Center the cursor on the dragged image
      const offsetX = orientation === 'h' ? 65 : 7;
      const offsetY = orientation === 'h' ? 7 : 65;
      if (e.dataTransfer.setDragImage) {
        e.dataTransfer.setDragImage(target, offsetX, offsetY);
      }
      
      // Restore original dimensions in the next tick
      setTimeout(() => {
        target.style.width = originalWidth;
        target.style.height = originalHeight;
      }, 0);
    }
    
    // Set transfer data for cross-browser standard support
    e.dataTransfer.setData('text/plain', orientation);
    e.dataTransfer.effectAllowed = 'copy';
  }

  /**
   * Clear active drag parameters when drag finishes
   */
  onDragEnd() {
    this.activeDragOrientation = null;
    this.dragPreview.hide();
  }

  /**
   * Handle dragover: locate closest intersection, validate, and show preview
   * @param {DragEvent} e
   */
  onDragOver(e) {
    if (!this.activeDragOrientation) return;
    e.preventDefault(); // Required to allow dropping

    const closest = this.getClosestIntersection(e.clientX, e.clientY);
    if (!closest) return;

    // Check validity in game engine
    const isValid = this.game.verifyWallPlacement(closest.col, closest.row, this.activeDragOrientation);
    this.dragPreview.show(closest.col, closest.row, this.activeDragOrientation, isValid);
  }

  /**
   * Hide preview when dragging out of the board
   */
  onDragLeave() {
    this.dragPreview.hide();
  }

  /**
   * Handle drop: place wall if valid
   * @param {DragEvent} e
   */
  onDrop(e) {
    if (!this.activeDragOrientation) return;
    e.preventDefault();

    const closest = this.getClosestIntersection(e.clientX, e.clientY);
    this.dragPreview.hide();

    if (closest) {
      this.game.placeWall(closest.col, closest.row, this.activeDragOrientation);
    }
  }

  /**
   * Compute screen coordinates for all 8x8 wall intersections based on cell DOM elements
   */
  cacheIntersections() {
    this.cachedIntersections = [];
    const cellElements = this.renderer.cellElements;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const elBL = cellElements[r][c];       // Bottom-left cell
        const elTR = cellElements[r + 1][c + 1]; // Top-right cell

        if (!elBL || !elTR) continue;

        const rectBL = elBL.getBoundingClientRect();
        const rectTR = elTR.getBoundingClientRect();

        // Cell centers
        const cxBL = rectBL.left + rectBL.width / 2;
        const cyBL = rectBL.top + rectBL.height / 2;

        const cxTR = rectTR.left + rectTR.width / 2;
        const cyTR = rectTR.top + rectTR.height / 2;

        // Intersection center (average coordinates)
        const ix = (cxBL + cxTR) / 2;
        const iy = (cyBL + cyTR) / 2;

        this.cachedIntersections.push({
          col: c,
          row: r,
          x: ix,
          y: iy
        });
      }
    }
  }

  /**
   * Find cached intersection closest to drag coordinates
   * @param {number} mx - clientX
   * @param {number} my - clientY
   * @returns {{col: number, row: number, x: number, y: number}|null}
   */
  getClosestIntersection(mx, my) {
    if (this.cachedIntersections.length === 0) return null;

    let closest = null;
    let minDist = Infinity;

    for (const inter of this.cachedIntersections) {
      // Euclidean distance squared
      const dist = (mx - inter.x) ** 2 + (my - inter.y) ** 2;
      if (dist < minDist) {
        minDist = dist;
        closest = inter;
      }
    }

    return closest;
  }
}
