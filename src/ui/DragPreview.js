/**
 * Drag and Drop Wall Preview Component
 */

export class DragPreview {
  /**
   * @param {HTMLElement} boardContainer - The parent board container
   */
  constructor(boardContainer) {
    this.boardContainer = boardContainer;
    this.element = document.createElement('div');
    this.element.className = 'wall-preview hidden';
    this.boardContainer.appendChild(this.element);
  }

  /**
   * Update and show the preview wall at the calculated grid intersection
   *
   * @param {number} col - 0-indexed column anchor (0 to 7)
   * @param {number} row - 0-indexed row anchor (0 to 7)
   * @param {string} orientation - 'h' or 'v'
   * @param {boolean} isValid - Whether this placement is valid under current rules
   */
  show(col, row, orientation, isValid) {
    // Clear dynamic classes, keep core preview identifier
    this.element.className = 'wall-preview';
    
    // Add orientation and validation styling
    const orientationClass = orientation === 'h' ? 'wall-horizontal' : 'wall-vertical';
    const validityClass = isValid ? 'preview-valid' : 'preview-invalid';
    
    this.element.classList.add(orientationClass, validityClass);

    // Apply layout mapping in CSS grid
    if (orientation === 'h') {
      this.element.style.gridRow = `${16 - 2 * row}`;
      this.element.style.gridColumn = `${2 * col + 1} / span 3`;
    } else {
      this.element.style.gridColumn = `${2 * col + 2}`;
      this.element.style.gridRow = `${15 - 2 * row} / span 3`;
    }
  }

  /**
   * Hide the preview element
   */
  hide() {
    this.element.className = 'wall-preview hidden';
    this.element.style.gridRow = '';
    this.element.style.gridColumn = '';
  }

  /**
   * Re-append the preview element to the board container (needed after board clears)
   * @param {HTMLElement} boardContainer
   */
  reappend(boardContainer) {
    this.boardContainer = boardContainer;
    if (this.element.parentElement !== this.boardContainer) {
      this.boardContainer.appendChild(this.element);
    }
  }
}
