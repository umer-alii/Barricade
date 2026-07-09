/**
 * Cell Class
 */

import { cellToNotation } from '../utils/Coordinates.js';

export class Cell {
  /**
   * @param {number} col - 0-indexed column (0-8)
   * @param {number} row - 0-indexed row (0-8)
   */
  constructor(col, row) {
    this.col = col;
    this.row = row;
    this.notation = cellToNotation(col, row);
  }
}
