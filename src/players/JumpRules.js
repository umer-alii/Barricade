/**
 * Quoridor Jump Rules Implementation
 */

import { isMoveBlockedByWall } from './Movement.js';

/**
 * Get all legal jump moves when the opponent is adjacent.
 *
 * @param {{col: number, row: number}} playerPos - Active player position
 * @param {{col: number, row: number}} opponentPos - Opponent position
 * @param {Array} horizontalWalls - Placed horizontal walls
 * @param {Array} verticalWalls - Placed vertical walls
 * @returns {Array<{col: number, row: number}>} List of valid jump targets
 */
export function getJumpMoves(playerPos, opponentPos, horizontalWalls, verticalWalls) {
  const jumps = [];

  // 1. Verify if they are adjacent
  const colDiff = opponentPos.col - playerPos.col;
  const rowDiff = opponentPos.row - playerPos.row;
  const isAdjacent = Math.abs(colDiff) + Math.abs(rowDiff) === 1;

  if (!isAdjacent) {
    return jumps;
  }

  // 2. Verify if the path from player to opponent is blocked by a wall
  const pathBlockedToOpponent = isMoveBlockedByWall(
    playerPos.col,
    playerPos.row,
    opponentPos.col,
    opponentPos.row,
    horizontalWalls,
    verticalWalls
  );

  if (pathBlockedToOpponent) {
    return jumps; // Cannot jump if you can't reach the opponent's cell
  }

  // Determine direction
  // colDiff = 1 (Right), -1 (Left)
  // rowDiff = 1 (Up), -1 (Down)
  const behindCol = opponentPos.col + colDiff;
  const behindRow = opponentPos.row + rowDiff;

  // Check if cell behind opponent is on the board
  const isBehindOnBoard = behindCol >= 0 && behindCol < 9 && behindRow >= 0 && behindRow < 9;

  // Check if path from opponent to behind opponent is blocked by a wall
  let pathBlockedBehind = true;
  if (isBehindOnBoard) {
    pathBlockedBehind = isMoveBlockedByWall(
      opponentPos.col,
      opponentPos.row,
      behindCol,
      behindRow,
      horizontalWalls,
      verticalWalls
    );
  }

  if (isBehindOnBoard && !pathBlockedBehind) {
    // Straight jump is possible
    jumps.push({ col: behindCol, row: behindRow });
  } else {
    // Straight jump is impossible (blocked by wall or off board) -> Diagonal jumps are legal
    if (rowDiff !== 0) {
      // Jump was vertical (Up or Down). Perpendicular options are Left and Right from opponent.
      const leftCol = opponentPos.col - 1;
      const rightCol = opponentPos.col + 1;
      const rowVal = opponentPos.row;

      // Check Left diagonal
      if (leftCol >= 0) {
        const leftBlocked = isMoveBlockedByWall(
          opponentPos.col,
          opponentPos.row,
          leftCol,
          rowVal,
          horizontalWalls,
          verticalWalls
        );
        if (!leftBlocked) {
          jumps.push({ col: leftCol, row: rowVal });
        }
      }

      // Check Right diagonal
      if (rightCol < 9) {
        const rightBlocked = isMoveBlockedByWall(
          opponentPos.col,
          opponentPos.row,
          rightCol,
          rowVal,
          horizontalWalls,
          verticalWalls
        );
        if (!rightBlocked) {
          jumps.push({ col: rightCol, row: rowVal });
        }
      }
    } else {
      // Jump was horizontal (Left or Right). Perpendicular options are Up and Down from opponent.
      const downRow = opponentPos.row - 1;
      const upRow = opponentPos.row + 1;
      const colVal = opponentPos.col;

      // Check Down diagonal
      if (downRow >= 0) {
        const downBlocked = isMoveBlockedByWall(
          opponentPos.col,
          opponentPos.row,
          colVal,
          downRow,
          horizontalWalls,
          verticalWalls
        );
        if (!downBlocked) {
          jumps.push({ col: colVal, row: downRow });
        }
      }

      // Check Up diagonal
      if (upRow < 9) {
        const upBlocked = isMoveBlockedByWall(
          opponentPos.col,
          opponentPos.row,
          colVal,
          upRow,
          horizontalWalls,
          verticalWalls
        );
        if (!upBlocked) {
          jumps.push({ col: colVal, row: upRow });
        }
      }
    }
  }

  return jumps;
}
