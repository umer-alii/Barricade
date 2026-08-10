/**
 * Drag and Drop Controller for Barricade Placement
 */

import { WallSnap } from './WallSnap.js';

export class DragController {
  constructor(game, renderer, dragPreview) {
    this.game = game;
    this.renderer = renderer;
    this.dragPreview = dragPreview;
    this.wallSnap = new WallSnap(renderer);

    this.activeDragOrientation = null;
    this._dragRaf = null;
    this._pendingDrag = null;

    this.initEvents();
  }

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

  onDragStart(e, orientation) {
    if (this.game.gameState.winner !== null || !this.game.isLocalPlayerTurn()) {
      e.preventDefault();
      return;
    }

    this.activeDragOrientation = orientation;
    this.wallSnap.cacheIntersections();
    this.wallSnap.clear();

    const target = e.target;
    if (target) {
      const originalWidth = target.style.width;
      const originalHeight = target.style.height;

      if (orientation === 'h') {
        target.style.width = '130px';
        target.style.height = '14px';
      } else {
        target.style.width = '14px';
        target.style.height = '130px';
      }

      const offsetX = orientation === 'h' ? 65 : 7;
      const offsetY = orientation === 'h' ? 7 : 65;
      if (e.dataTransfer.setDragImage) {
        e.dataTransfer.setDragImage(target, offsetX, offsetY);
      }

      setTimeout(() => {
        target.style.width = originalWidth;
        target.style.height = originalHeight;
      }, 0);
    }

    e.dataTransfer.setData('text/plain', orientation);
    e.dataTransfer.effectAllowed = 'copy';
  }

  onDragEnd() {
    this.activeDragOrientation = null;
    this.wallSnap.clear();
    this.dragPreview.hide();
  }

  onDragOver(e) {
    if (!this.activeDragOrientation || !this.game.isLocalPlayerTurn()) return;
    e.preventDefault();

    this._pendingDrag = e;
    if (this._dragRaf) return;

    this._dragRaf = requestAnimationFrame(() => {
      this._dragRaf = null;
      if (!this._pendingDrag || !this.activeDragOrientation) return;

      const evt = this._pendingDrag;
      this._pendingDrag = null;

      const snap = this.wallSnap.resolve(evt.clientX, evt.clientY, this.activeDragOrientation);
      if (!snap) {
        this.dragPreview.hide();
        return;
      }

      const isValid = this.game.verifyWallPlacement(snap.col, snap.row, this.activeDragOrientation);
      this.dragPreview.show(snap.col, snap.row, this.activeDragOrientation, isValid);
    });
  }

  onDragLeave() {
    this.wallSnap.clear();
    this.dragPreview.hide();
  }

  onDrop(e) {
    if (!this.activeDragOrientation || !this.game.isLocalPlayerTurn()) return;
    e.preventDefault();

    const snap = this.wallSnap.resolve(e.clientX, e.clientY, this.activeDragOrientation);
    this.dragPreview.hide();
    this.wallSnap.clear();

    if (snap) {
      const isValid = this.game.verifyWallPlacement(snap.col, snap.row, this.activeDragOrientation);
      if (isValid) {
        this.game.placeWall(snap.col, snap.row, this.activeDragOrientation);
      }
    }
  }

  cacheIntersections() {
    this.wallSnap.cacheIntersections();
  }
}
