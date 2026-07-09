/**
 * Wall Validator Utility
 */

import { WALL_ORIENTATIONS, TOAST_MESSAGES } from '../utils/Constants.js';
import { hasPath } from '../pathfinding/BFS.js';

/**
 * Validate a proposed wall placement.
 *
 * @param {number} col - 0-indexed column anchor (0 to 7)
 * @param {number} row - 0-indexed row anchor (0 to 7)
 * @param {string} orientation - 'h' or 'v'
 * @param {Array<Player>} players - Active players with coordinates
 * @param {Array<Wall>} horizontalWalls - Placed horizontal walls
 * @param {Array<Wall>} verticalWalls - Placed vertical walls
 * @returns {{isValid: boolean, message?: string}} Validation result
 */
export function validateWall(col, row, orientation, players, horizontalWalls, verticalWalls) {
  // Rule 1: Fits entirely inside board (bounds check for grid lines 0-7)
  if (col < 0 || col > 7 || row < 0 || row > 7) {
    return { isValid: false, message: TOAST_MESSAGES.INVALID_PLACEMENT };
  }

  // Rules 2 & 3: Check overlapping and crossing
  if (orientation === WALL_ORIENTATIONS.HORIZONTAL) {
    // Check overlap with existing horizontal walls
    const overlaps = horizontalWalls.some(
      w => w.row === row && Math.abs(w.col - col) < 2
    );
    if (overlaps) {
      return { isValid: false, message: TOAST_MESSAGES.WALL_EXISTS };
    }

    // Check crossing with existing vertical walls
    const crosses = verticalWalls.some(
      w => w.col === col && w.row === row
    );
    if (crosses) {
      return { isValid: false, message: TOAST_MESSAGES.WALLS_CANNOT_CROSS };
    }
  } else if (orientation === WALL_ORIENTATIONS.VERTICAL) {
    // Check overlap with existing vertical walls
    const overlaps = verticalWalls.some(
      w => w.col === col && Math.abs(w.row - row) < 2
    );
    if (overlaps) {
      return { isValid: false, message: TOAST_MESSAGES.WALL_EXISTS };
    }

    // Check crossing with existing horizontal walls
    const crosses = horizontalWalls.some(
      w => w.col === col && w.row === row
    );
    if (crosses) {
      return { isValid: false, message: TOAST_MESSAGES.WALLS_CANNOT_CROSS };
    }
  } else {
    return { isValid: false, message: TOAST_MESSAGES.INVALID_PLACEMENT };
  }

  // Rule 6: Pathfinding check
  // Create copies of the wall lists with the proposed wall temporarily added
  const tempH = [...horizontalWalls];
  const tempV = [...verticalWalls];
  if (orientation === WALL_ORIENTATIONS.HORIZONTAL) {
    tempH.push({ col, row });
  } else {
    tempV.push({ col, row });
  }

  // Run BFS path verification from current player locations
  const p1Path = hasPath(players[0], 8, tempH, tempV);
  const p2Path = hasPath(players[1], 0, tempH, tempV);

  if (!p1Path || !p2Path) {
    return { isValid: false, message: TOAST_MESSAGES.PATH_BLOCKED };
  }

  return { isValid: true };
}
