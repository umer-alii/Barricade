/**
 * Validate daily puzzle generation across many dates.
 * Independently re-checks every puzzle's solution logic.
 */

import { getDailyPuzzles } from '../src/puzzle/PuzzleGenerator.js';
import { getLegalMoves } from '../src/players/Movement.js';
import { validateWall } from '../src/walls/WallValidator.js';
import { getShortestDistanceFast } from '../src/pathfinding/BFS.js';
import { notationToCell, notationToWall } from '../src/utils/Coordinates.js';

function dist(pos, goalRow, hW, vW) {
  const hSet = new Set(hW.map(w => `${w.col},${w.row}`));
  const vSet = new Set(vW.map(w => `${w.col},${w.row}`));
  return getShortestDistanceFast(pos, goalRow, hSet, vSet);
}

let checked = 0;
let failures = 0;
const typeCounts = {};

for (let offset = 0; offset < 60; offset++) {
  const date = new Date(Date.now() + offset * 86400000);
  const { puzzleDate, puzzles } = getDailyPuzzles(date);

  for (const p of puzzles) {
    checked++;
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
    const s = p.setup;
    const red = { col: s.players[0].col, row: s.players[0].row };
    const blue = { col: s.players[1].col, row: s.players[1].row };
    const hW = s.horizontalWalls;
    const vW = s.verticalWalls;

    const fail = (msg) => {
      failures++;
      console.error(`❌ ${puzzleDate} #${p.puzzleIndex} (${p.type}): ${msg}`);
    };

    if (!p.setup || !p.bestMove || !p.type || !p.prompt) {
      fail('missing fields');
      continue;
    }

    if (p.type === 'win') {
      const moves = getLegalMoves(red, blue, hW, vW);
      const winners = moves.filter(m => m.row === 8);
      const cell = notationToCell(p.bestMove);
      if (winners.length !== 1) { fail(`expected 1 winning move, got ${winners.length}`); continue; }
      if (winners[0].col !== cell.col || winners[0].row !== cell.row) { fail('bestMove mismatch'); continue; }
    } else if (p.type === 'block') {
      const threats = getLegalMoves(blue, red, hW, vW).filter(m => m.row === 0);
      if (threats.length === 0) { fail('no blue threat exists'); continue; }
      const wall = notationToWall(p.bestMove);
      const valid = validateWall(wall.col, wall.row, wall.orientation, [red, blue], hW, vW);
      if (!valid.isValid) { fail('solution wall is illegal'); continue; }
      const h2 = wall.orientation === 'h' ? [...hW, wall] : hW;
      const v2 = wall.orientation === 'v' ? [...vW, wall] : vW;
      const after = getLegalMoves(blue, red, h2, v2).filter(m => m.row === 0);
      if (after.length > 0) { fail('solution does not stop the win'); continue; }
      // uniqueness: no OTHER wall or pawn move may be safe
      let otherSafe = 0;
      for (const m of getLegalMoves(red, blue, hW, vW)) {
        const blueAfter = getLegalMoves(blue, { col: m.col, row: m.row }, hW, vW);
        if (!blueAfter.some(bm => bm.row === 0)) otherSafe++;
      }
      for (let col = 0; col <= 7; col++) {
        for (let row = 0; row <= 7; row++) {
          for (const o of ['h', 'v']) {
            if (col === wall.col && row === wall.row && o === wall.orientation) continue;
            const v = validateWall(col, row, o, [red, blue], hW, vW);
            if (!v.isValid) continue;
            const hh = o === 'h' ? [...hW, { col, row }] : hW;
            const vv = o === 'v' ? [...vW, { col, row }] : vW;
            if (!getLegalMoves(blue, red, hh, vv).some(bm => bm.row === 0)) otherSafe++;
          }
        }
      }
      if (otherSafe > 0) { fail(`${otherSafe} alternative defenses exist — not unique`); continue; }
    } else if (p.type === 'race') {
      const blueDist = dist(blue, 0, hW, vW);
      const moves = getLegalMoves(red, blue, hW, vW);
      const winners = moves.filter(m => {
        const d = dist({ col: m.col, row: m.row }, 8, hW, vW);
        return d !== -1 && d < blueDist;
      });
      const cell = notationToCell(p.bestMove);
      if (winners.length !== 1) { fail(`expected 1 race-winning move, got ${winners.length}`); continue; }
      if (winners[0].col !== cell.col || winners[0].row !== cell.row) { fail('bestMove mismatch'); continue; }
    } else {
      fail(`unknown type ${p.type}`);
    }
  }
}

console.log(`\nChecked ${checked} puzzles across 60 days — types: ${JSON.stringify(typeCounts)}`);
if (failures === 0) console.log('✅ ALL PUZZLES VALID with verified unique solutions');
else { console.error(`❌ ${failures} failures`); process.exit(1); }
