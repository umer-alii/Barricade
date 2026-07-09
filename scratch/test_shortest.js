import { getShortestPath, getShortestDistanceFast } from '../src/pathfinding/BFS.js';
import { getLegalMoves } from '../src/players/Movement.js';
import { getBestMove } from '../src/players/Bot.js';

// Reconstruct the exact wall placements from the screenshot
// Blue walls:
// 1. Vertical blue wall between H and I (col index 7) spanning Rows 3 to 8
// This corresponds to 3 vertical walls: vg3, vg5, vg7
// which are anchored at row index 2, 4, 6
// 2. Horizontal blue wall at the top (between Row 8 and Row 9)
// It covers Column G and H. Anchored at col index 6, row index 7: hg8
// 3. Vertical blue wall between F and G (col index 5) spanning Row 5 and 6: vf5 (row 4)
// 4. Vertical blue wall between E and F (col index 4) spanning Row 5 and 6: ve5 (row 4)
// 5. Vertical blue wall between D and E (col index 3) spanning Row 6 and 7: vd6 (row 5)
// 6. Horizontal blue wall at the bottom left: hb2 (row 1, col 1)
const vWalls = [
  { col: 7, row: 2 },
  { col: 7, row: 4 },
  { col: 7, row: 6 },
  { col: 5, row: 4 },
  { col: 4, row: 4 },
  { col: 3, row: 5 }
];

const hWalls = [
  { col: 6, row: 7 }, // hg8
  { col: 1, row: 1 }  // hb2
];

// Red walls:
// 1. Vertical red wall at the bottom left: va2 (row 1, col 0)
// 2. Horizontal red wall at the bottom: hc2 (row 1, col 2)
// 3. Horizontal red wall at Row 5: he5 (row 4, col 4)
// 4. Horizontal red wall at Row 3: he3 (row 2, col 4)
// 5. Vertical red wall between G and H (col index 6) spanning Row 6 and 7: vg6 (row 5)
// 6. Horizontal red wall at Row 6: hd6 (row 5, col 3)
// 7. Horizontal red wall at Row 9: hd9 (row 8, col 3)
hWalls.push(
  { col: 2, row: 1 }, // hc2
  { col: 4, row: 4 }, // he5
  { col: 4, row: 2 }, // he3
  { col: 3, row: 5 }, // hd6
  { col: 3, row: 8 }  // hd9
);

vWalls.push(
  { col: 0, row: 1 }, // va2
  { col: 6, row: 5 }  // vg6
);

// Blue pawn is at h9 (col index 7, row index 8)
const bluePawn = { col: 7, row: 8 };

// Red pawn is at i3 (col index 8, row index 2)
const redPawn = { col: 8, row: 2 };

console.log('--- Inspecting Legal Moves at H9 ---');
const legal = getLegalMoves(bluePawn, redPawn, hWalls, vWalls);
console.log('Legal moves from H9:', legal);

console.log('\n--- Inspecting Shortest Path from H9 ---');


import { getShortestDistanceFast } from '../src/pathfinding/BFS.js';
import { GOAL_ROWS } from '../src/utils/Constants.js';

// Replicate evalState for debugging
function debugEvalState(state, selfPlayerIdx, diff) {
  const isP0 = selfPlayerIdx === 0;
  const selfP = isP0 ? { col: state.players[0].col, row: state.players[0].row } : { col: state.players[1].col, row: state.players[1].row };
  const oppP = isP0 ? { col: state.players[1].col, row: state.players[1].row } : { col: state.players[0].col, row: state.players[0].row };
  const selfGoal = GOAL_ROWS[selfPlayerIdx];
  const oppGoal = GOAL_ROWS[selfPlayerIdx === 0 ? 1 : 0];

  const selfDist = shortestPathLength(selfP, selfGoal, state.horizontalWalls, state.verticalWalls);
  const oppDist = shortestPathLength(oppP, oppGoal, state.horizontalWalls, state.verticalWalls);

  const selfWalls = isP0 ? state.players[0].walls : state.players[1].walls;
  const oppWalls = isP0 ? state.players[1].walls : state.players[0].walls;

  const w1 = 10;
  const w2 = 1;
  const w3 = 0.1;
  const w4 = diff === 'hard' ? 3 : 4;
  const w5 = (diff === 'professional' || diff === 'expert') ? 8 : 0;

  let disjointTerm = 0;
  let selfRoutes = 0;
  let oppRoutes = 0;
  if (w5 > 0) {
    oppRoutes = disjointRouteCount(oppP, oppGoal, state.horizontalWalls, state.verticalWalls);
    selfRoutes = disjointRouteCount(selfP, selfGoal, state.horizontalWalls, state.verticalWalls);
    disjointTerm = w5 * (1 / (1 + oppRoutes)) - w5 * (1 / (1 + selfRoutes));
  }

  const score = w1 * (oppDist - selfDist)
       + w2 * (selfWalls - oppWalls)
       + disjointTerm;

  console.log(`--- Debug Eval for Mover ${selfPlayerIdx} (${diff}) ---`);
  console.log(`selfDist: ${selfDist}, oppDist: ${oppDist}`);
  console.log(`selfRoutes: ${selfRoutes}, oppRoutes: ${oppRoutes}`);
  console.log(`disjointTerm: ${disjointTerm}`);
  console.log(`Total Score: ${score}`);
  return score;
}

// Helper to compute disjoint routes
function getValidNeighborsFast(col, row, hSet, vSet) {
  const neighbors = [];
  // Up
  if (row + 1 < 9 && !hSet.has(`${col},${row}`)) neighbors.push({ col, row: row + 1 });
  // Down
  if (row - 1 >= 0 && !hSet.has(`${col},${row - 1}`)) neighbors.push({ col, row: row - 1 });
  // Left
  if (col - 1 >= 0 && !vSet.has(`${col - 1},${row}`)) neighbors.push({ col: col - 1, row });
  // Right
  if (col + 1 < 9 && !vSet.has(`${col},${row}`)) neighbors.push({ col: col + 1, row });
  return neighbors;
}

function simulateMove(state, move) {
  const next = {
    horizontalWalls: [...state.horizontalWalls],
    verticalWalls: [...state.verticalWalls],
    players: state.players.map(p => ({ ...p })),
    currentPlayer: state.currentPlayer
  };
  const p = next.players[state.currentPlayer];
  p.col = move.col;
  p.row = move.row;
  return next;
}

console.log('\n--- Evaluating Candidates for Professional ---');
const g9Move = { col: 6, row: 8 };
const g9State = simulateMove(mockGameState, g9Move);
debugEvalState(g9State, 1, 'professional');

const i9Move = { col: 8, row: 8 };
const i9State = simulateMove(mockGameState, i9Move);
debugEvalState(i9State, 1, 'professional');


console.log('\n--- Simulation of getBestMove ---');
mockGameState.botDifficulty = 'professional';
console.log('Professional Bot Move:', getBestMove(mockGameState));

mockGameState.botDifficulty = 'hard';
console.log('Hard Bot Move:', getBestMove(mockGameState));

mockGameState.botDifficulty = 'medium';
console.log('Medium Bot Move:', getBestMove(mockGameState));
