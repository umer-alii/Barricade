/**
 * Puzzle replay and notation helpers.
 */

import { GameState } from '../game/GameState.js';
import { getLegalMoves } from '../players/Movement.js';
import { validateWall } from '../walls/WallValidator.js';
import { cellToNotation, wallToNotation, notationToCell, notationToWall } from '../utils/Coordinates.js';
import { WALL_ORIENTATIONS } from '../utils/Constants.js';

export function moveToNotation(move) {
  if (!move) return '';
  if (move.type === 'move') return cellToNotation(move.col, move.row);
  if (move.type === 'wall') return wallToNotation(move.col, move.row, move.orientation);
  return '';
}

export function applyNotationMove(gameState, notation) {
  const activeIdx = gameState.currentPlayer;
  if (notation.length === 2) {
    const cell = notationToCell(notation);
    if (!cell) return false;
    gameState.players[activeIdx].moveTo(cell.col, cell.row);
    gameState.addMove(notation);
  } else if (notation.length === 3) {
    const wall = notationToWall(notation);
    if (!wall) return false;
    const wallObj = { col: wall.col, row: wall.row, placedBy: activeIdx };
    if (wall.orientation === WALL_ORIENTATIONS.HORIZONTAL) {
      gameState.horizontalWalls.push(wallObj);
    } else {
      gameState.verticalWalls.push(wallObj);
    }
    gameState.players[activeIdx].useWall();
    gameState.addMove(notation);
  } else {
    return false;
  }

  gameState.checkWinner();
  gameState.switchPlayer();
  return true;
}

export function replayHistory(history = []) {
  const gameState = new GameState();
  gameState.gameMode = 'puzzle';
  for (const notation of history) {
    if (gameState.winner !== null) break;
    applyNotationMove(gameState, notation);
  }
  return gameState;
}

export function getRandomLegalMove(gameState, rng) {
  const idx = gameState.currentPlayer;
  const player = gameState.players[idx];
  const opponent = gameState.players[idx === 0 ? 1 : 0];

  const pawnMoves = getLegalMoves(
    player,
    opponent,
    gameState.horizontalWalls,
    gameState.verticalWalls
  ).map(m => ({ type: 'move', col: m.col, row: m.row }));

  const wallMoves = [];
  if (player.walls > 0) {
    for (let col = 0; col <= 7; col++) {
      for (let row = 0; row <= 7; row++) {
        for (const orientation of [WALL_ORIENTATIONS.HORIZONTAL, WALL_ORIENTATIONS.VERTICAL]) {
          const validation = validateWall(
            col,
            row,
            orientation,
            gameState.players,
            gameState.horizontalWalls,
            gameState.verticalWalls
          );
          if (validation.isValid) {
            wallMoves.push({ type: 'wall', col, row, orientation });
          }
        }
      }
    }
  }

  const allMoves = [...pawnMoves, ...wallMoves];
  if (allMoves.length === 0) return null;
  return allMoves[Math.floor(rng() * allMoves.length)];
}
