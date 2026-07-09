/**
 * Player Class
 */

import { PLAYER_COLORS, INITIAL_WALL_COUNT } from '../utils/Constants.js';

export class Player {
  /**
   * @param {number} index - Player index (0 or 1)
   * @param {number} col - Initial column (0-8)
   * @param {number} row - Initial row (0-8)
   */
  constructor(index, col, row) {
    this.index = index;
    this.col = col;
    this.row = row;
    this.walls = INITIAL_WALL_COUNT;
    this.color = PLAYER_COLORS[index];
  }

  /**
   * Move player to new coordinates
   * @param {number} col
   * @param {number} row
   */
  moveTo(col, row) {
    this.col = col;
    this.row = row;
  }

  /**
   * Decrease player's wall count by 1
   */
  useWall() {
    if (this.walls > 0) {
      this.walls--;
    }
  }

  /**
   * Increase player's wall count (e.g. on reset or undo)
   */
  addWall() {
    this.walls++;
  }
}
