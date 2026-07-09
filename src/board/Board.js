/**
 * Board Model Class
 */

import { Cell } from './Cell.js';
import { BOARD_SIZE } from '../utils/Constants.js';

export class Board {
  constructor() {
    this.cells = [];
    this.init();
  }

  /**
   * Initialize 9x9 cells grid
   */
  init() {
    this.cells = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      const rowCells = [];
      for (let col = 0; col < BOARD_SIZE; col++) {
        rowCells.push(new Cell(col, row));
      }
      this.cells.push(rowCells);
    }
  }

  /**
   * Fetch cell by column and row coordinates
   * @param {number} col
   * @param {number} row
   * @returns {Cell|null}
   */
  getCell(col, row) {
    if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) {
      return null;
    }
    return this.cells[row][col];
  }

  /**
   * Check if a coordinate is within board boundaries
   * @param {number} col
   * @param {number} row
   * @returns {boolean}
   */
  isValidCoordinate(col, row) {
    return col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE;
  }
}
