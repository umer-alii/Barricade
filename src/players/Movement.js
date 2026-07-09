/**
 * Player Movement Utilities
 */

import { getJumpMoves } from './JumpRules.js';

/**
 * Checks if a move between two adjacent cells is blocked by any placed wall.
 *
 * @param {number} fromCol - Starting column index
 * @param {number} fromRow - Starting row index
 * @param {number} toCol - Destination column index
 * @param {number} toRow - Destination row index
 * @param {Array} horizontalWalls - Array of horizontal walls
 * @param {Array} verticalWalls - Array of vertical walls
 * @returns {boolean} True if the path is blocked by a wall, false otherwise
 */
export function isMoveBlockedByWall(fromCol, fromRow, toCol, toRow, horizontalWalls, verticalWalls) {
  // Up: (col, row) -> (col, row + 1)
  if (toRow === fromRow + 1 && toCol === fromCol) {
    return horizontalWalls.some(
      w => w.row === fromRow && (w.col === fromCol || w.col === fromCol - 1)
    );
  }
  // Down: (col, row) -> (col, row - 1)
  if (toRow === fromRow - 1 && toCol === fromCol) {
    return horizontalWalls.some(
      w => w.row === fromRow - 1 && (w.col === fromCol || w.col === fromCol - 1)
    );
  }
  // Left: (col, row) -> (col - 1, row)
  if (toCol === fromCol - 1 && toRow === fromRow) {
    return verticalWalls.some(
      w => w.col === fromCol - 1 && (w.row === fromRow || w.row === fromRow - 1)
    );
  }
  // Right: (col, row) -> (col + 1, row)
  if (toCol === fromCol + 1 && toRow === fromRow) {
    return verticalWalls.some(
      w => w.col === fromCol && (w.row === fromRow || w.row === fromRow - 1)
    );
  }
  
  return true; // Non-adjacent moves are treated as blocked
}

/**
 * Calculates all legal moves (standard and jumps) for the player.
 *
 * @param {{col: number, row: number}} playerPos - Active player position
 * @param {{col: number, row: number}} opponentPos - Opponent position
 * @param {Array} horizontalWalls - Array of placed horizontal walls
 * @param {Array} verticalWalls - Array of placed vertical walls
 * @returns {Array<{col: number, row: number}>} List of reachable cells
 */
export function getLegalMoves(playerPos, opponentPos, horizontalWalls, verticalWalls) {
  const moves = [];

  const directions = [
    { col: 0, row: 1 },  // Up
    { col: 0, row: -1 }, // Down
    { col: -1, row: 0 }, // Left
    { col: 1, row: 0 }   // Right
  ];

  for (const dir of directions) {
    const nextCol = playerPos.col + dir.col;
    const nextRow = playerPos.row + dir.row;

    // Bounds check
    if (nextCol < 0 || nextCol >= 9 || nextRow < 0 || nextRow >= 9) {
      continue;
    }

    // Wall check
    const blocked = isMoveBlockedByWall(
      playerPos.col,
      playerPos.row,
      nextCol,
      nextRow,
      horizontalWalls,
      verticalWalls
    );

    if (blocked) {
      continue;
    }

    // Check if the cell is occupied by the opponent
    const isOccupiedByOpponent = nextCol === opponentPos.col && nextRow === opponentPos.row;

    if (isOccupiedByOpponent) {
      // Opponent is adjacent and path is not blocked -> Fetch jumps
      const jumpMoves = getJumpMoves(playerPos, opponentPos, horizontalWalls, verticalWalls);
      moves.push(...jumpMoves);
    } else {
      // Empty cell -> Normal move
      moves.push({ col: nextCol, row: nextRow });
    }
  }

  return moves;
}
