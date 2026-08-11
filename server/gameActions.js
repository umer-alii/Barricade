/**
 * Server-side game action validation and application.
 * Reuses the same game logic modules as the client.
 */

import { GameState } from '../src/game/GameState.js';
import { TurnManager } from '../src/game/TurnManager.js';
import { validateWall } from '../src/walls/WallValidator.js';
import { getLegalMoves } from '../src/players/Movement.js';
import { cellToNotation, wallToNotation } from '../src/utils/Coordinates.js';
import { WALL_ORIENTATIONS } from '../src/utils/Constants.js';
import { applyMoveClock } from './timeControl.js';

const turnManager = new TurnManager();

/**
 * Apply a validated action to the game state.
 * @param {Object} gameStateData - Serialized game state
 * @param {number} playerIndex - Acting player's index (0 or 1)
 * @param {Object} action - { type: 'move'|'wall'|'resign', ... }
 * @returns {{ gameState?: Object, error?: string }}
 */
export function applyAction(gameStateData, playerIndex, action) {
  const gameState = new GameState();
  gameState.deserialize(gameStateData);

  if (gameState.winner !== null) {
    return { error: 'Game is already over' };
  }

  if (action.type === 'resign') {
    gameState.winner = playerIndex === 0 ? 1 : 0;
    gameState.endReason = 'resign';
    gameState.resignedBy = playerIndex;
    return { gameState: gameState.serialize() };
  }

  if (!turnManager.isValidTurn(gameState, playerIndex)) {
    return { error: "It's not your turn" };
  }

  if (action.type === 'move') {
    const { col, row } = action;
    if (col === undefined || row === undefined) {
      return { error: 'Invalid move coordinates' };
    }

    const player = gameState.players[playerIndex];
    const opponent = gameState.players[playerIndex === 0 ? 1 : 0];

    const legalMoves = getLegalMoves(
      player,
      opponent,
      gameState.horizontalWalls,
      gameState.verticalWalls
    );

    const isLegal = legalMoves.some(m => m.col === col && m.row === row);
    if (!isLegal) {
      return { error: 'Illegal move' };
    }

    const clockResult = applyMoveClock(gameState, playerIndex);
    if (clockResult?.winner !== undefined) {
      gameState.winner = clockResult.winner;
      gameState.endReason = 'timeout';
      return { gameState: gameState.serialize() };
    }

    player.moveTo(col, row);
    const notation = cellToNotation(col, row);
    turnManager.commitAction(gameState, notation);
    return { gameState: gameState.serialize() };
  }

  if (action.type === 'wall') {
    const { col, row, orientation } = action;
    if (col === undefined || row === undefined || !orientation) {
      return { error: 'Invalid wall placement' };
    }

    const player = gameState.players[playerIndex];

    if (player.walls <= 0) {
      return { error: 'No walls remaining' };
    }

    const validation = validateWall(
      col,
      row,
      orientation,
      gameState.players,
      gameState.horizontalWalls,
      gameState.verticalWalls
    );

    if (!validation.isValid) {
      return { error: validation.message || 'Invalid wall placement' };
    }

    const wallSpec = { col, row, orientation, placedBy: playerIndex };
    if (orientation === WALL_ORIENTATIONS.HORIZONTAL) {
      gameState.horizontalWalls.push(wallSpec);
    } else {
      gameState.verticalWalls.push(wallSpec);
    }

    const clockResult = applyMoveClock(gameState, playerIndex);
    if (clockResult?.winner !== undefined) {
      gameState.winner = clockResult.winner;
      gameState.endReason = 'timeout';
      return { gameState: gameState.serialize() };
    }

    player.useWall();
    const notation = wallToNotation(col, row, orientation);
    turnManager.commitAction(gameState, notation);
    return { gameState: gameState.serialize() };
  }

  return { error: 'Unknown action type' };
}
