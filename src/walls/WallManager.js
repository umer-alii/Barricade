/**
 * Wall Manager Class
 */

import { WALL_ORIENTATIONS } from '../utils/Constants.js';

export class WallManager {
  constructor() {
    this.horizontalWalls = []; // Array of Wall objects
    this.verticalWalls = [];   // Array of Wall objects
  }

  /**
   * Add a wall to the board
   * @param {Wall} wall
   */
  addWall(wall) {
    if (wall.orientation === WALL_ORIENTATIONS.HORIZONTAL) {
      this.horizontalWalls.push(wall);
    } else if (wall.orientation === WALL_ORIENTATIONS.VERTICAL) {
      this.verticalWalls.push(wall);
    }
  }

  /**
   * Remove a wall from the board
   * @param {Wall} wall
   */
  removeWall(wall) {
    if (wall.orientation === WALL_ORIENTATIONS.HORIZONTAL) {
      this.horizontalWalls = this.horizontalWalls.filter(
        w => !(w.col === wall.col && w.row === wall.row)
      );
    } else if (wall.orientation === WALL_ORIENTATIONS.VERTICAL) {
      this.verticalWalls = this.verticalWalls.filter(
        w => !(w.col === wall.col && w.row === wall.row)
      );
    }
  }

  /**
   * Clear all walls
   */
  clear() {
    this.horizontalWalls = [];
    this.verticalWalls = [];
  }
}
