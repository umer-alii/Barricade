/**
 * Bot self-play matchup harness: verifies the difficulty ladder.
 * Usage: node scratch/bot_matchup.js [diffA] [diffB] [games]
 */

import { GameState } from '../src/game/GameState.js';
import { TurnManager } from '../src/game/TurnManager.js';
import { getBestMove } from '../src/players/Bot.js';
import { cellToNotation, wallToNotation } from '../src/utils/Coordinates.js';
import { WALL_ORIENTATIONS } from '../src/utils/Constants.js';

const turnManager = new TurnManager();

function playGame(diffP0, diffP1, maxPlies = 220) {
  const gs = new GameState();
  gs.gameMode = 'ai';

  for (let ply = 0; ply < maxPlies; ply++) {
    gs.botDifficulty = gs.currentPlayer === 0 ? diffP0 : diffP1;
    const move = getBestMove(gs);
    if (!move) return { winner: gs.currentPlayer === 0 ? 1 : 0, plies: ply, reason: 'no-move' };

    let notation;
    if (move.type === 'move') {
      gs.players[gs.currentPlayer].moveTo(move.col, move.row);
      notation = cellToNotation(move.col, move.row);
    } else {
      const spec = { col: move.col, row: move.row, orientation: move.orientation, placedBy: gs.currentPlayer };
      if (move.orientation === WALL_ORIENTATIONS.HORIZONTAL) gs.horizontalWalls.push(spec);
      else gs.verticalWalls.push(spec);
      gs.players[gs.currentPlayer].useWall();
      notation = wallToNotation(move.col, move.row, move.orientation);
    }

    const winner = turnManager.commitAction(gs, notation);
    if (winner !== null) return { winner, plies: ply + 1, reason: 'goal' };
  }
  return { winner: null, plies: maxPlies, reason: 'ply-cap' };
}

const diffA = process.argv[2] || 'hard';
const diffB = process.argv[3] || 'medium';
const games = parseInt(process.argv[4] || '2', 10);

let winsA = 0, winsB = 0, draws = 0;
for (let g = 0; g < games; g++) {
  // Alternate which difficulty plays first
  const aPlaysP0 = g % 2 === 0;
  const start = Date.now();
  const result = aPlaysP0 ? playGame(diffA, diffB) : playGame(diffB, diffA);
  const secs = ((Date.now() - start) / 1000).toFixed(1);

  let outcome;
  if (result.winner === null) { draws++; outcome = 'draw (ply cap)'; }
  else {
    const aWon = aPlaysP0 ? result.winner === 0 : result.winner === 1;
    if (aWon) { winsA++; outcome = `${diffA} wins`; }
    else { winsB++; outcome = `${diffB} wins`; }
  }
  console.log(`Game ${g + 1}: ${outcome} in ${result.plies} plies (${result.reason}, ${secs}s, ${diffA} as ${aPlaysP0 ? 'P0' : 'P1'})`);
}

console.log(`\nResult: ${diffA} ${winsA} — ${winsB} ${diffB}${draws ? ` (${draws} draws)` : ''}`);
