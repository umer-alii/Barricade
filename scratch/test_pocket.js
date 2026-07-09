import { getShortestDistanceFast } from '../src/pathfinding/BFS.js';
import { getBestMove } from '../src/players/Bot.js';

// Setup the walls as seen in the screenshot
// 1. Vertical blue walls on Column I/H (col index 7)
// Vertical wall at row index 2 (Row 3-4): vg3
// Vertical wall at row index 4 (Row 5-6): vg5
// Vertical wall at row index 7 (Row 8-9): vg8
const vWalls = [
  { col: 7, row: 2 },
  { col: 7, row: 4 },
  { col: 7, row: 7 }
];

// 2. Horizontal blue wall at Row 6 (row index 5), spanning Column H/I (col index 7/8): hh6
const hWalls = [
  { col: 7, row: 5 }
];

// Bot (Player 1, Red) is at i5 (col index 8, row index 4)
const p0 = { col: 8, row: 4 };

// Human (Player 2, Blue) is at c8 (col index 2, row index 7)
const p1 = { col: 2, row: 7 };

const hSet = new Set(hWalls.map(w => `${w.col},${w.row}`));
const vSet = new Set(vWalls.map(w => `${w.col},${w.row}`));

console.log('--- Testing Pathfinding in Pocket ---');
console.log('P0 position (i5):', p0);
const d_i5 = getShortestDistanceFast(p0, 8, hSet, vSet);
console.log('Distance from i5 to goal row 8:', d_i5);

const p0_i6 = { col: 8, row: 5 }; // i6 (row index 5)
const d_i6 = getShortestDistanceFast(p0_i6, 8, hSet, vSet);
console.log('Distance from i6 to goal row 8:', d_i6);

const p0_i4 = { col: 8, row: 3 }; // i4 (row index 3)
const d_i4 = getShortestDistanceFast(p0_i4, 8, hSet, vSet);
console.log('Distance from i4 to goal row 8:', d_i4);

const mockGameState = {
  currentPlayer: 0,
  players: [
    { col: 8, row: 4, walls: 7, moveTo(c,r){this.col=c; this.row=r;}, useWall(){this.walls--;} },
    { col: 2, row: 7, walls: 3, moveTo(c,r){this.col=c; this.row=r;}, useWall(){this.walls--;} }
  ],
  horizontalWalls: hWalls,
  verticalWalls: vWalls,
  botDifficulty: 'professional',
  gameMode: 'ai',
  humanPlayerIndex: 1,
  history: ['i5', 'd8'] // simulate history
};

console.log('\n--- Performance Profile of Bot ---');
const start = Date.now();
const move = getBestMove(mockGameState);
const duration = Date.now() - start;
console.log(`Professional Bot Move:`, move);
console.log(`Search completed in ${duration}ms`);
