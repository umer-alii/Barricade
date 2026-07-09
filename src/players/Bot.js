/**
 * AI Bot Player Decision Engine
 *
 * Implements the Barricade Bot specification:
 *   - Easy: Deliberately weak (15% random, 30% random wall, 55% wandering pawn moves)
 *   - Medium: Greedy 1-Ply (evaluates all legal pawn moves and all 128 wall placements)
 *   - Hard: Iterative Deepening Minimax (Alpha-Beta, depth 5-6 plies, move ordering, transposition table, diversion)
 *   - Expert: Deep Iterative Deepening Minimax (depth 8-10 plies, Transposition Table, Killer Moves with frequency weight, PVS, exact endgame solver)
 */

import { getShortestPath, getShortestDistanceFast, getValidNeighborsFast } from '../pathfinding/BFS.js';
import { getLegalMoves } from './Movement.js';
import { validateWall } from '../walls/WallValidator.js';
import { GOAL_ROWS } from '../utils/Constants.js';

/* ═══════════════════════════════════════════════════════════════════════════
   §1  STATE REPRESENTATION & TRANSITIONS
   ═══════════════════════════════════════════════════════════════════════════ */

function createSimState(gameState) {
  const p0 = gameState.players[0];
  const p1 = gameState.players[1];
  return {
    p0Col: p0.col,
    p0Row: p0.row,
    p0Walls: p0.walls,
    p1Col: p1.col,
    p1Row: p1.row,
    p1Walls: p1.walls,
    currentPlayer: gameState.currentPlayer,
    hWalls: gameState.horizontalWalls.map(w => ({ col: w.col, row: w.row })),
    vWalls: gameState.verticalWalls.map(w => ({ col: w.col, row: w.row })),
    lastMoveDiversion: 0
  };
}

function computeDiversion(oldPath, newPath) {
  if (!oldPath || oldPath.length === 0) return 0;
  if (!newPath || newPath.length === 0) return 1;

  const oldSet = new Set(oldPath.map(step => `${step.col},${step.row}`));
  let overlap = 0;
  for (const step of newPath) {
    if (oldSet.has(`${step.col},${step.row}`)) {
      overlap++;
    }
  }
  return 1 - overlap / oldPath.length;
}

function wallIntersectsPath(w, path) {
  if (!path) return true;
  for (const step of path) {
    if ((step.col === w.col || step.col === w.col + 1) &&
        (step.row === w.row || step.row === w.row + 1)) {
      return true;
    }
  }
  return false;
}

function applyMove(state, move) {
  const isP0 = state.currentPlayer === 0;
  
  // Calculate path diversion score if this is a wall move
  let div = 0;
  if (move.type === 'wall') {
    const oppPLoc = state.currentPlayer === 0 ? { col: state.p1Col, row: state.p1Row } : { col: state.p0Col, row: state.p0Row };
    const oppGoalLoc = GOAL_ROWS[state.currentPlayer === 0 ? 1 : 0];
    const oldPath = getShortestPath(oppPLoc, oppGoalLoc, state.hWalls, state.vWalls);
    
    const tempHW = move.orientation === 'h' ? [...state.hWalls, { col: move.col, row: move.row }] : state.hWalls;
    const tempVW = move.orientation === 'v' ? [...state.vWalls, { col: move.col, row: move.row }] : state.vWalls;
    const newPath = getShortestPath(oppPLoc, oppGoalLoc, tempHW, tempVW);
    
    div = computeDiversion(oldPath, newPath);
  }

  return {
    p0Col: (move.type === 'move' && isP0) ? move.col : state.p0Col,
    p0Row: (move.type === 'move' && isP0) ? move.row : state.p0Row,
    p0Walls: (move.type === 'wall' && isP0) ? state.p0Walls - 1 : state.p0Walls,
    p1Col: (move.type === 'move' && !isP0) ? move.col : state.p1Col,
    p1Row: (move.type === 'move' && !isP0) ? move.row : state.p1Row,
    p1Walls: (move.type === 'wall' && !isP0) ? state.p1Walls - 1 : state.p1Walls,
    currentPlayer: state.currentPlayer === 0 ? 1 : 0,
    hWalls: (move.type === 'wall' && move.orientation === 'h') ? [...state.hWalls, { col: move.col, row: move.row }] : state.hWalls,
    vWalls: (move.type === 'wall' && move.orientation === 'v') ? [...state.vWalls, { col: move.col, row: move.row }] : state.vWalls,
    lastMoveDiversion: div
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   §2  HIGH-PERFORMANCE WALL VALIDATOR (INLINE & ALLOCATION-FREE)
   ═══════════════════════════════════════════════════════════════════════════ */

function validateWallFast(col, row, orientation, players, hWalls, vWalls) {
  if (col < 0 || col > 7 || row < 0 || row > 7) return false;

  if (orientation === 'h') {
    const overlaps = hWalls.some(w => w.row === row && Math.abs(w.col - col) < 2);
    if (overlaps) return false;
    const crosses = vWalls.some(w => w.col === col && w.row === row);
    if (crosses) return false;
  } else {
    const overlaps = vWalls.some(w => w.col === col && Math.abs(w.row - row) < 2);
    if (overlaps) return false;
    const crosses = hWalls.some(w => w.col === col && w.row === row);
    if (crosses) return false;
  }

  const hSet = new Set(hWalls.map(w => `${w.col},${w.row}`));
  const vSet = new Set(vWalls.map(w => `${w.col},${w.row}`));
  const key = `${col},${row}`;
  if (orientation === 'h') hSet.add(key); else vSet.add(key);

  const p0Goal = GOAL_ROWS[0];
  const p1Goal = GOAL_ROWS[1];

  const p0Dist = getShortestDistanceFast(players[0], p0Goal, hSet, vSet);
  if (p0Dist === -1) return false;

  const p1Dist = getShortestDistanceFast(players[1], p1Goal, hSet, vSet);
  if (p1Dist === -1) return false;

  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §3  WALL GENERATORS
   ═══════════════════════════════════════════════════════════════════════════ */

function getAllWallCoordinates() {
  const out = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      out.push({ col: c, row: r, orientation: 'h' });
      out.push({ col: c, row: r, orientation: 'v' });
    }
  }
  return out;
}

function getLegalWallPlacements(state) {
  const isP0 = state.currentPlayer === 0;
  const wallsLeft = isP0 ? state.p0Walls : state.p1Walls;
  if (wallsLeft <= 0) return [];

  const players = [
    { col: state.p0Col, row: state.p0Row },
    { col: state.p1Col, row: state.p1Row }
  ];

  const candidates = getAllWallCoordinates();
  const legal = [];

  for (const w of candidates) {
    const isValid = validateWallFast(w.col, w.row, w.orientation, players, state.hWalls, state.vWalls);
    if (isValid) {
      legal.push({ type: 'wall', col: w.col, row: w.row, orientation: w.orientation });
    }
  }
  return legal;
}

function getAllLegalMoves(state) {
  const isP0 = state.currentPlayer === 0;
  const botP = { col: state.p0Col, row: state.p0Row };
  const humP = { col: state.p1Col, row: state.p1Row };

  const pawnMoves = getLegalMoves(
    isP0 ? botP : humP,
    isP0 ? humP : botP,
    state.hWalls,
    state.vWalls
  ).map(m => ({ type: 'move', col: m.col, row: m.row }));

  const wallPlacements = getLegalWallPlacements(state);
  return [...pawnMoves, ...wallPlacements];
}

/* ═══════════════════════════════════════════════════════════════════════════
   §4  ROOT-LEVEL CANDIDATE WALL PRE-FILTERING
   ═══════════════════════════════════════════════════════════════════════════ */

function getRankedRootWalls(state, selfPlayerIdx, maxCands = 15) {
  const isP0 = selfPlayerIdx === 0;
  const selfP = isP0 ? { col: state.p0Col, row: state.p0Row } : { col: state.p1Col, row: state.p1Row };
  const oppP = isP0 ? { col: state.p1Col, row: state.p1Row } : { col: state.p0Col, row: state.p0Row };
  const selfGoal = GOAL_ROWS[selfPlayerIdx];
  const oppGoal = GOAL_ROWS[selfPlayerIdx === 0 ? 1 : 0];

  const selfDist = shortestPathLength(selfP, selfGoal, state.hWalls, state.vWalls);
  const oppDist = shortestPathLength(oppP, oppGoal, state.hWalls, state.vWalls);

  const players = [
    { col: state.p0Col, row: state.p0Row },
    { col: state.p1Col, row: state.p1Row }
  ];

  const candidates = getAllWallCoordinates();
  const scored = [];

  const hSet = new Set(state.hWalls.map(w => `${w.col},${w.row}`));
  const vSet = new Set(state.vWalls.map(w => `${w.col},${w.row}`));

  for (const w of candidates) {
    const isValid = validateWallFast(w.col, w.row, w.orientation, players, state.hWalls, state.vWalls);
    if (!isValid) continue;

    const key = `${w.col},${w.row}`;
    if (w.orientation === 'h') hSet.add(key); else vSet.add(key);

    const oppNewDist = getShortestDistanceFast(oppP, oppGoal, hSet, vSet);
    const selfNewDist = getShortestDistanceFast(selfP, selfGoal, hSet, vSet);

    if (w.orientation === 'h') hSet.delete(key); else vSet.delete(key);

    if (oppNewDist === -1 || selfNewDist === -1) continue;

    const gain = oppNewDist - oppDist;
    const cost = Math.max(0, selfNewDist - selfDist);

    const score = gain - 1.2 * cost;

    if (gain >= 2 || (gain >= 1 && oppDist <= 4)) {
      scored.push({ type: 'wall', col: w.col, row: w.row, orientation: w.orientation, score, gain });
    }
  }

  scored.sort((a, b) => b.score - a.score || b.gain - a.gain);
  return scored.slice(0, maxCands);
}

/* ═══════════════════════════════════════════════════════════════════════════
   §5  EVALUATION FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

function shortestPathLength(pos, goalRow, hWalls, vWalls) {
  const hSet = new Set(hWalls.map(w => `${w.col},${w.row}`));
  const vSet = new Set(vWalls.map(w => `${w.col},${w.row}`));
  const dist = getShortestDistanceFast(pos, goalRow, hSet, vSet);
  return dist === -1 ? Infinity : dist;
}

/**
 * Computes maximum number of edge-disjoint paths from pos to goalRow
 * using Menger's theorem (BFS-based augmenting paths).
 */
function disjointRouteCount(pos, goalRow, hWalls, vWalls) {
  const hSet = new Set(hWalls.map(w => `${w.col},${w.row}`));
  const vSet = new Set(vWalls.map(w => `${w.col},${w.row}`));
  const usedEdges = new Set();
  let pathCount = 0;

  for (let iter = 0; iter < 5; iter++) {
    const queue = [{ col: pos.col, row: pos.row, parent: null }];
    const visited = new Set();
    visited.add(`${pos.col},${pos.row}`);
    let head = 0;
    let goalNode = null;

    while (head < queue.length) {
      const current = queue[head++];
      if (current.row === goalRow) {
        goalNode = current;
        break;
      }

      const neighbors = getValidNeighborsFast(current.col, current.row, hSet, vSet);
      for (const neighbor of neighbors) {
        const key = `${neighbor.col},${neighbor.row}`;
        if (!visited.has(key)) {
          const edgeKey1 = `${current.col},${current.row}->${neighbor.col},${neighbor.row}`;
          const edgeKey2 = `${neighbor.col},${neighbor.row}->${current.col},${current.row}`;
          if (usedEdges.has(edgeKey1) || usedEdges.has(edgeKey2)) {
            continue;
          }

          visited.add(key);
          queue.push({
            col: neighbor.col,
            row: neighbor.row,
            parent: current
          });
        }
      }
    }

    if (!goalNode) break;

    pathCount++;
    let curr = goalNode;
    while (curr && curr.parent) {
      const edgeKey1 = `${curr.parent.col},${curr.parent.row}->${curr.col},${curr.row}`;
      const edgeKey2 = `${curr.col},${curr.row}->${curr.parent.col},${curr.parent.row}`;
      usedEdges.add(edgeKey1);
      usedEdges.add(edgeKey2);
      curr = curr.parent;
    }
  }

  return pathCount;
}

/**
 * Spec-defined evaluation:
 * eval = w1 * (oppDist - selfDist) + w2 * (selfWalls - oppWalls) + w3 * selfMobility + w4 * diversion + w5 * disjointRouteCount
 */
function evalState(state, selfPlayerIdx, diff) {
  const isP0 = selfPlayerIdx === 0;
  const selfP = isP0 ? { col: state.p0Col, row: state.p0Row } : { col: state.p1Col, row: state.p1Row };
  const oppP = isP0 ? { col: state.p1Col, row: state.p1Row } : { col: state.p0Col, row: state.p0Row };
  const selfGoal = GOAL_ROWS[selfPlayerIdx];
  const oppGoal = GOAL_ROWS[selfPlayerIdx === 0 ? 1 : 0];

  const selfDist = shortestPathLength(selfP, selfGoal, state.hWalls, state.vWalls);
  const oppDist = shortestPathLength(oppP, oppGoal, state.hWalls, state.vWalls);

  if (selfDist === 0) return 200000;
  if (oppDist === 0) return -200000;
  if (selfDist === Infinity) return -150000;
  if (oppDist === Infinity) return 150000;

  const mob = getLegalMoves(selfP, oppP, state.hWalls, state.vWalls).length;

  const selfWalls = isP0 ? state.p0Walls : state.p1Walls;
  const oppWalls = isP0 ? state.p1Walls : state.p0Walls;

  // w1 = 10, w2 = 1, w3 = 0.1, w4 = 3 (Hard) or 4 (Expert), w5 = 8 (Expert only)
  const w1 = 10;
  const w2 = 1;
  const w3 = 0.1;
  const w4 = diff === 'hard' ? 3 : 4;
  const w5 = (diff === 'professional' || diff === 'expert') ? 8 : 0;

  let disjointTerm = 0;
  if (w5 > 0) {
    const oppRoutes = disjointRouteCount(oppP, oppGoal, state.hWalls, state.vWalls);
    const selfRoutes = disjointRouteCount(selfP, selfGoal, state.hWalls, state.vWalls);
    disjointTerm = w5 * (1 / (1 + oppRoutes)) - w5 * (1 / (1 + selfRoutes));
  }

  const selfCenterBonus = (selfP.col >= 3 && selfP.col <= 5) ? 0.2 : 0;
  const oppCenterPenalty = (oppP.col >= 3 && oppP.col <= 5) ? 0.2 : 0;

  const divTerm = w4 * (state.lastMoveDiversion || 0);

  return w1 * (oppDist - selfDist)
       + w2 * (selfWalls - oppWalls)
       + w3 * mob
       + divTerm
       + disjointTerm
       + selfCenterBonus
       - oppCenterPenalty;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §6  ANTI-OSCILLATION
   ═══════════════════════════════════════════════════════════════════════════ */

function recentBotCells(history, botIdx) {
  const cells = [];
  for (let i = history.length - 1; i >= 0 && cells.length < 6; i--) {
    if (i % 2 !== botIdx) continue;
    const n = history[i];
    if (!n || n.length !== 2) continue;
    const cc = n.charCodeAt(0);
    if (cc < 97 || cc > 105) continue;
    const row = parseInt(n[1], 10) - 1;
    if (row >= 0 && row <= 8) cells.push({ col: cc - 97, row });
  }
  return cells;
}

function oscPenalty(move, recent) {
  if (move.type !== 'move') return 0;
  for (let i = 0; i < recent.length; i++) {
    if (recent[i].col === move.col && recent[i].row === move.row) {
      return i < 2 ? -250 : -80;
    }
  }
  return 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §7  TRANSPOSITION TABLE STATE KEY
   ═══════════════════════════════════════════════════════════════════════════ */

function makeStateKey(state) {
  const hKey = state.hWalls.map(w => `${w.col},${w.row}`).sort().join(';');
  const vKey = state.vWalls.map(w => `${w.col},${w.row}`).sort().join(';');
  return `${state.p0Col},${state.p0Row}|${state.p1Col},${state.p1Row}|${state.p0Walls},${state.p1Walls}|${state.currentPlayer}|${hKey}|${vKey}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §8  DIFFICULTY-SPECIFIC ROUTINES
   ═══════════════════════════════════════════════════════════════════════════ */

function chooseMoveEasy(state, selfPlayerIdx) {
  const isP0 = selfPlayerIdx === 0;
  const selfP = isP0 ? { col: state.p0Col, row: state.p0Row } : { col: state.p1Col, row: state.p1Row };
  const oppP = isP0 ? { col: state.p1Col, row: state.p1Row } : { col: state.p0Col, row: state.p0Row };
  const selfGoal = GOAL_ROWS[selfPlayerIdx];
  const wallsLeft = isP0 ? state.p0Walls : state.p1Walls;

  const r = Math.random();
  if (r < 0.15) {
    const all = getAllLegalMoves(state);
    if (all.length > 0) return all[Math.floor(Math.random() * all.length)];
  } else if (r < 0.45 && wallsLeft > 0) {
    const walls = getLegalWallPlacements(state);
    if (walls.length > 0) return walls[Math.floor(Math.random() * walls.length)];
  }

  const candidates = getLegalMoves(selfP, oppP, state.hWalls, state.vWalls)
    .map(m => ({ type: 'move', col: m.col, row: m.row }));
  if (candidates.length === 0) return null;

  const currentDist = shortestPathLength(selfP, selfGoal, state.hWalls, state.vWalls);
  const nearGoal = candidates.filter(m => {
    const d = shortestPathLength({ col: m.col, row: m.row }, selfGoal, state.hWalls, state.vWalls);
    return d - currentDist <= 1;
  });

  return nearGoal.length > 0
    ? nearGoal[Math.floor(Math.random() * nearGoal.length)]
    : candidates[Math.floor(Math.random() * candidates.length)];
}

function chooseMoveMedium(state, selfPlayerIdx) {
  const isP0 = selfPlayerIdx === 0;
  const oppPlayerIdx = selfPlayerIdx === 0 ? 1 : 0;
  const selfP = isP0 ? { col: state.p0Col, row: state.p0Row } : { col: state.p1Col, row: state.p1Row };
  const oppP = isP0 ? { col: state.p1Col, row: state.p1Row } : { col: state.p0Col, row: state.p0Row };
  const selfGoal = GOAL_ROWS[selfPlayerIdx];
  const oppGoal = GOAL_ROWS[oppPlayerIdx];

  const pawnMoves = getLegalMoves(selfP, oppP, state.hWalls, state.vWalls)
    .map(m => ({ type: 'move', col: m.col, row: m.row }));
  const wallMoves = getLegalWallPlacements(state);
  const moves = [...pawnMoves, ...wallMoves];

  let best = null;
  let bestScore = -Infinity;

  for (const m of moves) {
    const s2 = applyMove(state, m);
    const selfP2 = isP0 ? { col: s2.p0Col, row: s2.p0Row } : { col: s2.p1Col, row: s2.p1Row };
    const oppP2 = isP0 ? { col: s2.p1Col, row: s2.p1Row } : { col: s2.p0Col, row: s2.p0Row };

    const selfDist = shortestPathLength(selfP2, selfGoal, s2.hWalls, s2.vWalls);
    const oppDist = shortestPathLength(oppP2, oppGoal, s2.hWalls, s2.vWalls);

    let score = oppDist - selfDist;
    if (m.type === 'wall') {
      score -= 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return best || chooseMoveEasy(state, selfPlayerIdx);
}

/**
 * OPTION B: Exhaustive Endgame Solver (called when wallsLeft(both) == 0)
 * Solves pure pathfinding race using exact Negamax.
 */
function exactSolve(state, selfPlayerIdx) {
  const startTime = Date.now();
  const timeLimit = 4000;
  const transTable = new Map();

  function getRaceMoves(simState) {
    const isP0 = simState.currentPlayer === 0;
    const selfPLoc = isP0 ? { col: simState.p0Col, row: simState.p0Row } : { col: simState.p1Col, row: simState.p1Row };
    const oppPLoc = isP0 ? { col: simState.p1Col, row: simState.p1Row } : { col: simState.p0Col, row: simState.p0Row };

    return getLegalMoves(
      selfPLoc,
      oppPLoc,
      simState.hWalls,
      simState.vWalls
    ).map(m => ({ type: 'move', col: m.col, row: m.row }));
  }

  function search(simState, depth, alpha, beta) {
    const cacheKey = `${simState.p0Col},${simState.p0Row}|${simState.p1Col},${simState.p1Row}|${simState.currentPlayer}`;
    if (transTable.has(cacheKey)) {
      return transTable.get(cacheKey);
    }

    const p0Goal = GOAL_ROWS[0];
    const p1Goal = GOAL_ROWS[1];
    
    if (simState.p0Row === p0Goal) {
      const score = 200000 - depth;
      return simState.currentPlayer === 0 ? score : -score;
    }
    if (simState.p1Row === p1Goal) {
      const score = 200000 - depth;
      return simState.currentPlayer === 1 ? score : -score;
    }

    if (Date.now() - startTime > timeLimit) {
      return evalState(simState, simState.currentPlayer, 'professional');
    }

    const moves = getRaceMoves(simState);
    if (moves.length === 0) return 0;

    const selfGoalLoc = GOAL_ROWS[simState.currentPlayer];
    const scoredMoves = moves.map(m => {
      const dist = shortestPathLength({ col: m.col, row: m.row }, selfGoalLoc, simState.hWalls, simState.vWalls);
      return { move: m, dist };
    }).sort((a, b) => a.dist - b.dist);

    let value = -Infinity;
    for (const sm of scoredMoves) {
      const nextState = applyMove(simState, sm.move);
      const score = -search(nextState, depth + 1, -beta, -alpha);
      value = Math.max(value, score);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    transTable.set(cacheKey, value);
    return value;
  }

  let bestMove = null;
  let bestScore = -Infinity;
  const rootMoves = getRaceMoves(state);

  const selfGoalLoc = GOAL_ROWS[selfPlayerIdx];
  const scoredRoot = rootMoves.map(m => {
    const dist = shortestPathLength({ col: m.col, row: m.row }, selfGoalLoc, state.hWalls, state.vWalls);
    return { move: m, dist };
  }).sort((a, b) => a.dist - b.dist).map(s => s.move);

  for (const bm of scoredRoot) {
    const nextState = applyMove(state, bm);
    const score = -search(nextState, 1, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestMove = bm;
    }
  }

  return bestMove;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §9  MAIN ENTRY ROUTINE
   ═══════════════════════════════════════════════════════════════════════════ */

export function getBestMove(gameState) {
  const selfPlayerIdx = gameState.currentPlayer;
  const oppPlayerIdx = selfPlayerIdx === 0 ? 1 : 0;
  const state = createSimState(gameState);

  const diff = gameState.botDifficulty || 'medium';

  // 1. Easy Mode
  if (diff === 'easy') {
    return chooseMoveEasy(state, selfPlayerIdx);
  }
  // 2. Medium Mode
  if (diff === 'medium') {
    return chooseMoveMedium(state, selfPlayerIdx);
  }

  // 3. Exact Solver (Option B) for perfect endgames
  const p0Walls = state.p0Walls;
  const p1Walls = state.p1Walls;
  if (p0Walls === 0 && p1Walls === 0) {
    return exactSolve(state, selfPlayerIdx);
  }

  // 4. Tactical Safety Net: check O(N) immediate win/loss
  const selfP = selfPlayerIdx === 0 ? { col: state.p0Col, row: state.p0Row } : { col: state.p1Col, row: state.p1Row };
  const oppP = selfPlayerIdx === 0 ? { col: state.p1Col, row: state.p1Row } : { col: state.p0Col, row: state.p0Row };
  const selfGoalLoc = GOAL_ROWS[selfPlayerIdx];
  const oppGoalLoc = GOAL_ROWS[oppPlayerIdx];

  // A. Win detection: if we can win right now, always take it
  const pawnMoves = getLegalMoves(selfP, oppP, state.hWalls, state.vWalls)
    .map(m => ({ type: 'move', col: m.col, row: m.row }));
  const winningMove = pawnMoves.find(m => m.row === selfGoalLoc);
  if (winningMove) {
    return winningMove;
  }

  // B. Defense check: if opponent can win on their next turn, restrict search to safe moves
  const oppMoves = getLegalMoves(oppP, selfP, state.hWalls, state.vWalls)
    .map(m => ({ type: 'move', col: m.col, row: m.row }));
  
  const oppWinningMoves = oppMoves.filter(om => om.row === oppGoalLoc);
  
  let rootWallCandidates = getRankedRootWalls(state, selfPlayerIdx, 15);
  let initialRootMoves = [...pawnMoves];
  if (selfPlayerIdx === 0 ? state.p0Walls > 0 : state.p1Walls > 0) {
    initialRootMoves.push(...rootWallCandidates);
  }

  let finalRootMoves = initialRootMoves;

  if (oppWinningMoves.length > 0) {
    const safeMoves = [];
    for (const rm of initialRootMoves) {
      const nextState = applyMove(state, rm);
      
      const nextOppP = oppPlayerIdx === 0 ? { col: nextState.p0Col, row: nextState.p0Row } : { col: nextState.p1Col, row: nextState.p1Row };
      const nextSelfP = selfPlayerIdx === 0 ? { col: nextState.p0Col, row: nextState.p0Row } : { col: nextState.p1Col, row: nextState.p1Row };

      const nextOppMoves = getLegalMoves(nextOppP, nextSelfP, nextState.hWalls, nextState.vWalls)
        .map(om => ({ type: 'move', col: om.col, row: om.row }));
      
      const nextOppWins = nextOppMoves.some(nom => nom.row === oppGoalLoc);
      if (!nextOppWins) {
        safeMoves.push(rm);
      }
    }
    if (safeMoves.length > 0) {
      finalRootMoves = safeMoves;
    }
  }

  // Minimax configurations
  const maxDepth = diff === 'hard' ? 6 : 14;
  const timeLimitMs = diff === 'hard' ? 1200 : 1500;
  const startTime = Date.now();

  const transpositionTable = new Map();
  const killerMoves = Array.from({ length: maxDepth + 1 }, () => []);
  const historyScore = new Map();
  const recent = recentBotCells(gameState.history, selfPlayerIdx);

  const botPath = getShortestPath(selfP, selfGoalLoc, state.hWalls, state.vWalls);
  const defMove = () => {
    const mvs = getLegalMoves(selfP, oppP, state.hWalls, state.vWalls);
    if (botPath && botPath.length > 1) {
      const s = botPath[1];
      if (mvs.some(m => m.col === s.col && m.row === s.row)) {
        return { type: 'move', col: s.col, row: s.row };
      }
    }
    return mvs.length > 0 ? { type: 'move', col: mvs[0].col, row: mvs[0].row } : null;
  };

  /**
   * Sorts candidate moves using transposition table, killer count, and global history.
   */
  function orderMoves(moves, simState, depth) {
    const oppGoal = GOAL_ROWS[simState.currentPlayer === 0 ? 1 : 0];
    const selfGoal = GOAL_ROWS[simState.currentPlayer];

    const selfPLoc = simState.currentPlayer === 0 ? { col: simState.p0Col, row: simState.p0Row } : { col: simState.p1Col, row: simState.p1Row };
    const oppPLoc = simState.currentPlayer === 0 ? { col: simState.p1Col, row: simState.p1Row } : { col: state.p0Col, row: state.p0Row };
    const oldOppPath = getShortestPath(oppPLoc, oppGoal, simState.hWalls, simState.vWalls);

    const scored = moves.map(m => {
      let score = 0;

      // 1. Killer Move priority (frequency weighted)
      const killers = killerMoves[depth] || [];
      const kIdx = killers.findIndex(k => k.type === m.type && k.col === m.col && k.row === m.row && k.orientation === m.orientation);
      if (kIdx !== -1) {
        score += 10000 + killers[kIdx].cutoffs * 15;
      }

      // 2. Global History Heuristic
      const mKey = `${m.type},${m.col},${m.row},${m.orientation || ''}`;
      score += (historyScore.get(mKey) || 0) * 0.5;

      if (m.type === 'move') {
        const nextDist = shortestPathLength({ col: m.col, row: m.row }, selfGoal, simState.hWalls, simState.vWalls);
        score += (100 - nextDist) * 8;
        if (m.col >= 3 && m.col <= 5) score += 5;
      } else {
        const tempState = applyMove(simState, m);

        let newOppPath = oldOppPath;
        if (wallIntersectsPath(m, oldOppPath)) {
          const nextOppP = simState.currentPlayer === 0 ? { col: tempState.p1Col, row: tempState.p1Row } : { col: tempState.p0Col, row: tempState.p0Row };
          newOppPath = getShortestPath(nextOppP, oppGoal, tempState.hWalls, tempState.vWalls);
        }

        const nextOppDist = newOppPath ? newOppPath.length - 1 : 99;
        const nextSelfDist = shortestPathLength(selfPLoc, selfGoal, tempState.hWalls, tempState.vWalls);

        const div = computeDiversion(oldOppPath, newOppPath);
        const w4 = diff === 'hard' ? 3 : 4;

        score += nextOppDist * 10 - nextSelfDist * 1.5 + div * w4 * 10;
      }

      return { move: m, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.move);
  }

  function getTreeMoves(simState, playerIdx) {
    const isP0 = playerIdx === 0;
    const selfPLoc = isP0 ? { col: simState.p0Col, row: simState.p0Row } : { col: simState.p1Col, row: simState.p1Row };
    const oppPLoc = isP0 ? { col: simState.p1Col, row: simState.p1Row } : { col: simState.p0Col, row: simState.p0Row };

    const pawnMoves = getLegalMoves(
      selfPLoc,
      oppPLoc,
      simState.hWalls,
      simState.vWalls
    ).map(m => ({ type: 'move', col: m.col, row: m.row }));

    const wLeft = isP0 ? simState.p0Walls : simState.p1Walls;
    if (wLeft <= 0) return pawnMoves;

    const players = [
      { col: simState.p0Col, row: simState.p0Row },
      { col: simState.p1Col, row: simState.p1Row }
    ];

    const wallMoves = [];
    for (const w of rootWallCandidates) {
      if (validateWallFast(w.col, w.row, w.orientation, players, simState.hWalls, simState.vWalls)) {
        wallMoves.push(w);
      }
    }

    return [...pawnMoves, ...wallMoves];
  }

  function negamax(simState, depth, alpha, beta, isSelfTurn, extended = false) {
    const alphaOriginal = alpha;

    const cacheKey = makeStateKey(simState);
    if (transpositionTable.has(cacheKey)) {
      const cached = transpositionTable.get(cacheKey);
      if (cached.depth >= depth) {
        if (cached.flag === 'exact') {
          return cached.score;
        } else if (cached.flag === 'lower' && cached.score >= beta) {
          return cached.score;
        } else if (cached.flag === 'upper' && cached.score <= alpha) {
          return cached.score;
        }
      }
    }

    const p0Goal = GOAL_ROWS[0];
    const p1Goal = GOAL_ROWS[1];
    
    if (simState.p0Row === p0Goal) {
      const score = 200000 + depth;
      return simState.currentPlayer === 0 ? score : -score;
    }
    if (simState.p1Row === p1Goal) {
      const score = 200000 + depth;
      return simState.currentPlayer === 1 ? score : -score;
    }

    if (depth === 0 || (Date.now() - startTime) > timeLimitMs) {
      if (!extended && simState.lastMoveDiversion >= 0.3 && (Date.now() - startTime) <= timeLimitMs) {
        return negamax(simState, 1, alpha, beta, isSelfTurn, true);
      }
      const val = evalState(simState, simState.currentPlayer, diff);
      transpositionTable.set(cacheKey, { depth, score: val, flag: 'exact' });
      return val;
    }

    let moves = getTreeMoves(simState, simState.currentPlayer);
    if (depth <= 2 && moves.length > 15) {
      const pawnMvs = moves.filter(m => m.type === 'move');
      const wallMvs = moves.filter(m => m.type === 'wall');
      moves = [...pawnMvs, ...wallMvs.slice(0, 2)];
    }

    moves = orderMoves(moves, simState, depth);

    let value = -Infinity;
    let first = true;
    for (const m of moves) {
      const nextState = applyMove(simState, m);
      let score;

      if (first) {
        score = -negamax(nextState, depth - 1, -beta, -alpha, !isSelfTurn, extended);
        first = false;
      } else {
        score = -negamax(nextState, depth - 1, -alpha - 1, -alpha, !isSelfTurn, extended);
        if (score > alpha && score < beta) {
          score = -negamax(nextState, depth - 1, -beta, -score, !isSelfTurn, extended);
        }
      }

      if (score > value) {
        value = score;
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) {
        const depthKillers = killerMoves[depth];
        if (depthKillers) {
          const kIdx = depthKillers.findIndex(k => k.type === m.type && k.col === m.col && k.row === m.row && k.orientation === m.orientation);
          if (kIdx !== -1) {
            depthKillers[kIdx].cutoffs++;
          } else {
            depthKillers.push({ ...m, cutoffs: 1 });
            if (depthKillers.length > 2) depthKillers.shift();
          }
        }
        const mKey = `${m.type},${m.col},${m.row},${m.orientation || ''}`;
        historyScore.set(mKey, (historyScore.get(mKey) || 0) + depth * depth);
        break;
      }
    }

    let flag = 'exact';
    if (value <= alphaOriginal) {
      flag = 'upper';
    } else if (value >= beta) {
      flag = 'lower';
    }
    transpositionTable.set(cacheKey, { depth, score: value, flag });
    return value;
  }

  // Iterative Deepening
  let bestMove = null;
  let bestScore = -Infinity;
  let rootMoves = finalRootMoves;
  let prevDepthTime = 0;

  for (let d = 1; d <= maxDepth; d++) {
    const depthStart = Date.now();
    const elapsed = Date.now() - startTime;
    if (d > 1 && elapsed + prevDepthTime * 2.2 > timeLimitMs) {
      break;
    }

    let currentBestMove = null;
    let currentBestScore = -Infinity;

    rootMoves = orderMoves(rootMoves, state, d);

    for (const bm of rootMoves) {
      if (Date.now() - startTime > timeLimitMs) break;

      const nextState = applyMove(state, bm);
      const score = -negamax(nextState, d - 1, -Infinity, Infinity, false, false) + oscPenalty(bm, recent);

      if (score > currentBestScore) {
        currentBestScore = score;
        currentBestMove = bm;
      }
    }

    if (currentBestMove) {
      bestMove = currentBestMove;
      bestScore = currentBestScore;
    }

    prevDepthTime = Date.now() - depthStart;
  }

  return bestMove || defMove();
}
