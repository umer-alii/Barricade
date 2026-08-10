/**
 * Daily seeded tactical puzzle generator.
 *
 * Every puzzle is a constructed SCENARIO with a programmatically VERIFIED
 * unique solution — never random moves:
 *
 *   1. "Win in 1"      — exactly one move reaches the goal this turn
 *   2. "Only Defense"  — opponent wins next move; exactly one move/wall stops it
 *   3. "Win the Race"  — exactly one move wins the pure pawn race
 *
 * Generation is seeded by the date, so everyone gets the same puzzles each day.
 */

import { getLegalMoves } from '../players/Movement.js';
import { validateWall } from '../walls/WallValidator.js';
import { getShortestDistanceFast } from '../pathfinding/BFS.js';
import { cellToNotation, wallToNotation } from '../utils/Coordinates.js';

const PUZZLES_PER_DAY = 3;

const TYPE_META = {
  win: {
    title: 'Win in 1',
    prompt: 'Red to move. One single move reaches the goal row — find it.'
  },
  block: {
    title: 'Only Defense',
    prompt: 'Blue wins next move. There is exactly one way to stop it — find it.'
  },
  race: {
    title: 'Win the Race',
    prompt: 'No barricades left — it\u2019s a pure race. Find the only move that gets Red home first.'
  }
};

/* ── Seeded RNG ──────────────────────────────────────────────────────── */

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function bfsDist(pos, goalRow, hWalls, vWalls) {
  const hSet = new Set(hWalls.map(w => `${w.col},${w.row}`));
  const vSet = new Set(vWalls.map(w => `${w.col},${w.row}`));
  return getShortestDistanceFast(pos, goalRow, hSet, vSet);
}

/**
 * Sprinkle plausible-looking walls onto the board. Every wall is validated
 * (paths always remain open). The tactical verification runs AFTER dressing,
 * so dressing can never silently break a puzzle.
 */
function addDressingWalls(rng, players, hWalls, vWalls, count, rowMin, rowMax, avoidCols = []) {
  let attempts = 0;
  let added = 0;
  while (added < count && attempts < 60) {
    attempts++;
    const col = Math.floor(rng() * 8);
    const row = rowMin + Math.floor(rng() * (rowMax - rowMin + 1));
    if (avoidCols.some(c => Math.abs(col - c) <= 1)) continue;
    const orientation = rng() < 0.5 ? 'h' : 'v';

    const validation = validateWall(col, row, orientation, players, hWalls, vWalls);
    if (!validation.isValid) continue;

    const w = { col, row, placedBy: added % 2 };
    if (orientation === 'h') hWalls.push(w);
    else vWalls.push(w);
    added++;
  }
  return added;
}

/* ── Verifiers — the puzzle only ships if the solution is UNIQUE ─────── */

/** Exactly one legal Red move reaches row 8. */
function verifyUniqueWin(players, hWalls, vWalls) {
  const moves = getLegalMoves(players[0], players[1], hWalls, vWalls);
  if (moves.length < 3) return null; // too obvious with no options
  const winners = moves.filter(m => m.row === 8);
  if (winners.length !== 1) return null;
  return { type: 'move', col: winners[0].col, row: winners[0].row };
}

/**
 * Blue threatens to win next move; among ALL Red replies (every pawn move and
 * every legal wall), exactly one prevents the immediate win.
 */
function verifyUniqueBlock(players, hWalls, vWalls, redWallCount) {
  const red = players[0];
  const blue = players[1];

  const blueThreats = getLegalMoves(blue, red, hWalls, vWalls).filter(m => m.row === 0);
  if (blueThreats.length === 0) return null;

  const redMoves = getLegalMoves(red, blue, hWalls, vWalls);
  if (redMoves.some(m => m.row === 8)) return null; // Red shouldn't have its own win

  const safe = [];

  for (const m of redMoves) {
    const movedRed = { col: m.col, row: m.row };
    const blueAfter = getLegalMoves(blue, movedRed, hWalls, vWalls);
    if (!blueAfter.some(bm => bm.row === 0)) {
      safe.push({ type: 'move', col: m.col, row: m.row });
      if (safe.length > 1) return null;
    }
  }

  if (redWallCount > 0) {
    for (let col = 0; col <= 7; col++) {
      for (let row = 0; row <= 7; row++) {
        for (const orientation of ['h', 'v']) {
          const validation = validateWall(col, row, orientation, players, hWalls, vWalls);
          if (!validation.isValid) continue;

          const h2 = orientation === 'h' ? [...hWalls, { col, row }] : hWalls;
          const v2 = orientation === 'v' ? [...vWalls, { col, row }] : vWalls;
          const blueAfter = getLegalMoves(blue, red, h2, v2);
          if (!blueAfter.some(bm => bm.row === 0)) {
            safe.push({ type: 'wall', col, row, orientation });
            if (safe.length > 1) return null;
          }
        }
      }
    }
  }

  return safe.length === 1 ? safe[0] : null;
}

/**
 * Pure race (no walls in hand): exactly one Red move reaches the goal
 * strictly before Blue does (Blue replies next, so Red needs distAfter < blueDist).
 */
function verifyUniqueRace(players, hWalls, vWalls) {
  const red = players[0];
  const blue = players[1];

  const blueDist = bfsDist(blue, 0, hWalls, vWalls);
  if (blueDist < 2) return null;

  const moves = getLegalMoves(red, blue, hWalls, vWalls);
  if (moves.length < 3) return null;

  const winners = moves.filter(m => {
    const d = bfsDist({ col: m.col, row: m.row }, 8, hWalls, vWalls);
    return d !== -1 && d < blueDist;
  });

  if (winners.length !== 1) return null;
  return { type: 'move', col: winners[0].col, row: winners[0].row };
}

/* ── Scenario constructors ───────────────────────────────────────────── */

function wallsPlacedBy(hWalls, vWalls, idx) {
  return [...hWalls, ...vWalls].filter(w => w.placedBy === idx).length;
}

function buildSetup(red, blue, hWalls, vWalls, redWalls, blueWalls) {
  return {
    players: [
      { col: red.col, row: red.row, walls: redWalls },
      { col: blue.col, row: blue.row, walls: blueWalls }
    ],
    horizontalWalls: hWalls,
    verticalWalls: vWalls
  };
}

/** Type 1: Win in 1 — a jump finish the player has to spot. */
function tryGenerateWinIn1(rng) {
  const c = 1 + Math.floor(rng() * 7); // 1..7 so both diagonals exist
  const hWalls = [];
  const vWalls = [];
  let red;
  let blue;

  if (rng() < 0.45) {
    // Straight jump finish: Blue stands in front, Red vaults over to the goal
    red = { col: c, row: 6 };
    blue = { col: c, row: 7 };
  } else {
    // Diagonal jump finish: Blue guards the goal square, one diagonal is walled off
    red = { col: c, row: 7 };
    blue = { col: c, row: 8 };
    const blockRight = rng() < 0.5;
    // v-wall at (col, 7) spans rows 7-8 and blocks the sideways diagonal
    vWalls.push({ col: blockRight ? c : c - 1, row: 7, placedBy: 1 });
  }

  const players = [red, blue];
  addDressingWalls(rng, players, hWalls, vWalls, 2 + Math.floor(rng() * 3), 1, 5, [c]);

  const solution = verifyUniqueWin(players, hWalls, vWalls);
  if (!solution) return null;

  const redWalls = Math.max(0, 4 - wallsPlacedBy(hWalls, vWalls, 0) + Math.floor(rng() * 3));
  const blueWalls = Math.max(0, 3 - wallsPlacedBy(hWalls, vWalls, 1) + Math.floor(rng() * 3));

  return {
    type: 'win',
    setup: buildSetup(red, blue, hWalls, vWalls, redWalls, blueWalls),
    bestMove: cellToNotation(solution.col, solution.row)
  };
}

/** Type 2: Only Defense — Blue is one step from winning; one wall saves Red. */
function tryGenerateBlock(rng) {
  const bc = 2 + Math.floor(rng() * 5); // 2..6 keeps both block spots on-board
  const blue = { col: bc, row: 1 };
  const red = {
    col: 1 + Math.floor(rng() * 7),
    row: 3 + Math.floor(rng() * 3) // rows 3..5 — advanced but a tempo behind
  };
  if (Math.abs(red.col - blue.col) + Math.abs(red.row - blue.row) <= 2) return null;

  const hWalls = [];
  const vWalls = [];

  // Pre-existing wall eliminates one of the two possible blocking spots,
  // making the remaining one the ONLY defense
  const killLeft = rng() < 0.5;
  if (killLeft) {
    hWalls.push({ col: bc - 2, row: 0, placedBy: 1 }); // overlaps h(bc-1,0)
  } else if (bc + 1 <= 7) {
    hWalls.push({ col: bc + 1, row: 0, placedBy: 1 }); // overlaps h(bc,0)
  } else {
    return null;
  }

  const players = [red, blue];
  addDressingWalls(rng, players, hWalls, vWalls, 2 + Math.floor(rng() * 3), 2, 5, [bc]);

  const redWalls = 1 + Math.floor(rng() * 3);
  const solution = verifyUniqueBlock(players, hWalls, vWalls, redWalls);
  if (!solution || solution.type !== 'wall') return null;

  const blueWalls = Math.max(0, 2 - wallsPlacedBy(hWalls, vWalls, 1) + Math.floor(rng() * 3));

  return {
    type: 'block',
    setup: buildSetup(red, blue, hWalls, vWalls, redWalls, blueWalls),
    bestMove: wallToNotation(solution.col, solution.row, solution.orientation)
  };
}

/** Type 3: Win the Race — a jump shortcut flips a losing race. */
function tryGenerateRace(rng) {
  const c = 1 + Math.floor(rng() * 7);
  const red = { col: c, row: 3 };
  const blue = { col: c, row: 4 }; // directly ahead — jump gains a full tempo

  const hWalls = [];
  const vWalls = [];
  const players = [red, blue];

  addDressingWalls(rng, players, hWalls, vWalls, 2 + Math.floor(rng() * 4), 1, 6, [c]);

  const solution = verifyUniqueRace(players, hWalls, vWalls);
  if (!solution) return null;

  return {
    type: 'race',
    setup: buildSetup(red, blue, hWalls, vWalls, 0, 0),
    bestMove: cellToNotation(solution.col, solution.row)
  };
}

/* ── Public API ──────────────────────────────────────────────────────── */

export function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function formatPuzzleDate(dateKey) {
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const GENERATORS = [tryGenerateWinIn1, tryGenerateBlock, tryGenerateRace];

export function getDailyPuzzles(date = new Date()) {
  const puzzleDate = getDateKey(date);
  const baseSeed = hashString(puzzleDate);
  const puzzles = [];

  for (let i = 0; i < PUZZLES_PER_DAY; i++) {
    const generate = GENERATORS[i % GENERATORS.length];
    let puzzle = null;

    for (let attempt = 0; attempt < 80; attempt++) {
      const rng = mulberry32(baseSeed + i * 9973 + attempt * 131);
      puzzle = generate(rng);
      if (puzzle) break;
    }

    if (!puzzle) {
      puzzle = getFallbackPuzzle(i);
    }

    const meta = TYPE_META[puzzle.type];
    puzzles.push({
      id: `${puzzleDate}-${i}`,
      puzzleDate,
      puzzleIndex: i,
      sideToMove: 0,
      title: meta.title,
      prompt: meta.prompt,
      ...puzzle
    });
  }

  return { puzzleDate, puzzles };
}

/** Hand-authored fallbacks (also verified shapes), used only if generation fails. */
function getFallbackPuzzle(index) {
  const fallbacks = [
    {
      // Straight jump finish over Blue into the goal row
      type: 'win',
      bestMove: 'e9',
      setup: {
        players: [
          { col: 4, row: 6, walls: 3 },
          { col: 4, row: 7, walls: 2 }
        ],
        horizontalWalls: [{ col: 2, row: 3, placedBy: 0 }],
        verticalWalls: [{ col: 5, row: 2, placedBy: 1 }]
      }
    },
    {
      // Blue steps to a1 next turn unless Red walls it off; hb1 overlaps ha1
      type: 'block',
      bestMove: 'hc1',
      setup: {
        players: [
          { col: 6, row: 4, walls: 2 },
          { col: 2, row: 1, walls: 1 }
        ],
        horizontalWalls: [{ col: 0, row: 0, placedBy: 1 }],
        verticalWalls: [{ col: 4, row: 4, placedBy: 0 }]
      }
    },
    {
      // Jump over Blue wins the race by one tempo
      type: 'race',
      bestMove: 'e6',
      setup: {
        players: [
          { col: 4, row: 3, walls: 0 },
          { col: 4, row: 4, walls: 0 }
        ],
        horizontalWalls: [{ col: 1, row: 2, placedBy: 0 }],
        verticalWalls: [{ col: 6, row: 5, placedBy: 1 }]
      }
    }
  ];

  return fallbacks[index % fallbacks.length];
}

export { PUZZLES_PER_DAY };
