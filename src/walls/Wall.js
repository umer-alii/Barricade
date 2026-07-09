/**
 * Wall Class
 */

export class Wall {
  /**
   * @param {number} col - 0-indexed column anchor (0 to 7)
   * @param {number} row - 0-indexed row anchor (0 to 7)
   * @param {string} orientation - 'h' (horizontal) or 'v' (vertical)
   */
  constructor(col, row, orientation) {
    this.col = col;
    this.row = row;
    this.orientation = orientation;
  }
}
