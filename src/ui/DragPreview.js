/**
 * Drag and Drop Wall Preview Component
 */

export class DragPreview {
  constructor(boardContainer) {
    this.boardContainer = boardContainer;
    this.element = document.createElement('div');
    this.element.className = 'wall-preview hidden';
    this.boardContainer.appendChild(this.element);

    this._col = null;
    this._row = null;
    this._orientation = null;
    this._isValid = null;
    this._visible = false;
  }

  show(col, row, orientation, isValid) {
    const sameSlot = this._visible
      && this._col === col
      && this._row === row
      && this._orientation === orientation;

    if (sameSlot && this._isValid === isValid) {
      return;
    }

    this._col = col;
    this._row = row;
    this._orientation = orientation;
    this._isValid = isValid;
    this._visible = true;

    const orientationClass = orientation === 'h' ? 'wall-horizontal' : 'wall-vertical';
    const validityClass = isValid ? 'preview-valid' : 'preview-invalid';

    if (!sameSlot) {
      this.element.className = 'wall-preview preview-enter';
      this.element.classList.add(orientationClass, validityClass);

      if (orientation === 'h') {
        this.element.style.gridRow = `${16 - 2 * row}`;
        this.element.style.gridColumn = `${2 * col + 1} / span 3`;
      } else {
        this.element.style.gridColumn = `${2 * col + 2}`;
        this.element.style.gridRow = `${15 - 2 * row} / span 3`;
      }

      requestAnimationFrame(() => {
        this.element.classList.remove('preview-enter');
        this.element.classList.add('preview-visible');
      });
    } else {
      this.element.classList.remove('preview-valid', 'preview-invalid');
      this.element.classList.add(validityClass);
    }
  }

  hide() {
    if (!this._visible) return;

    this._visible = false;
    this._col = null;
    this._row = null;
    this._orientation = null;
    this._isValid = null;

    this.element.classList.remove('preview-visible', 'preview-enter');
    this.element.classList.add('preview-exit');

    window.setTimeout(() => {
      if (this._visible) return;
      this.element.classList.remove('preview-exit', 'preview-valid', 'preview-invalid');
      this.element.className = 'wall-preview hidden';
      this.element.style.gridRow = '';
      this.element.style.gridColumn = '';
    }, 220);
  }

  reappend(boardContainer) {
    this.boardContainer = boardContainer;
    if (this.element.parentElement !== this.boardContainer) {
      this.boardContainer.appendChild(this.element);
    }
  }
}
