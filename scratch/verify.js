import { cellToNotation, notationToCell, wallToNotation, notationToWall } from '../src/utils/Coordinates.js';
import { hasPath, getShortestPath } from '../src/pathfinding/BFS.js';
import { getJumpMoves } from '../src/players/JumpRules.js';
import { getLegalMoves } from '../src/players/Movement.js';
import { validateWall } from '../src/walls/WallValidator.js';
import { getBestMove } from '../src/players/Bot.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('--- 1. Testing Coordinates Translation ---');
assert(cellToNotation(4, 0) === 'e1', 'col 4, row 0 -> e1');
assert(cellToNotation(4, 8) === 'e9', 'col 4, row 8 -> e9');
assert(cellToNotation(0, 3) === 'a4', 'col 0, row 3 -> a4');

const cell1 = notationToCell('e1');
assert(cell1 && cell1.col === 4 && cell1.row === 0, 'e1 -> col 4, row 0');

assert(wallToNotation(7, 7, 'h') === 'hh8', 'Horizontal wall at (7, 7) -> hh8');
assert(wallToNotation(6, 4, 'v') === 'vg5', 'Vertical wall at (6, 4) -> vg5');

const wall1 = notationToWall('hh8');
assert(wall1 && wall1.col === 7 && wall1.row === 7 && wall1.orientation === 'h', 'hh8 -> H col 7, row 7');


console.log('\n--- 2. Testing BFS Pathfinding ---');
const p1Start = { col: 4, row: 0 };
const p2Start = { col: 4, row: 8 };

assert(hasPath(p1Start, 8, [], []) === true, 'P1 path exists to row 9');
assert(hasPath(p2Start, 0, [], []) === true, 'P2 path exists to row 1');

const blockingWalls = [];
for (let c = 0; c < 8; c++) {
  blockingWalls.push({ col: c, row: 0 }); // horizontal walls across row index 0
}
assert(hasPath(p1Start, 8, blockingWalls, []) === false, 'P1 path blocked');
assert(hasPath(p2Start, 0, blockingWalls, []) === false, 'P2 path is also blocked');

const path = getShortestPath(p1Start, 8, [], []);
assert(path && path.length === 9, 'Shortest path is 9 cells long on empty board');


console.log('\n--- 3. Testing Jump Rules ---');
const playerPos = { col: 4, row: 4 };
const opponentPos = { col: 4, row: 5 };

let jumps = getJumpMoves(playerPos, opponentPos, [], []);
assert(jumps.length === 1 && jumps[0].col === 4 && jumps[0].row === 6, 'Straight jump to (4, 6)');

jumps = getJumpMoves(playerPos, opponentPos, [{ col: 4, row: 5 }], []);
assert(jumps.length === 2 && jumps.some(j => j.col === 3) && jumps.some(j => j.col === 5), 'Diagonals when straight blocked');


console.log('\n--- 4. Testing Wall Placement Validation ---');
const players = [p1Start, p2Start];
const horizontalWalls = [{ col: 2, row: 2 }];
const verticalWalls = [{ col: 5, row: 5 }];

let res = validateWall(2, 2, 'h', players, horizontalWalls, verticalWalls);
assert(res.isValid === false && res.message === 'Wall already exists.', 'Duplicate wall blocked');

res = validateWall(2, 2, 'v', players, horizontalWalls, verticalWalls);
assert(res.isValid === false && res.message === 'Walls cannot cross.', 'Crossing wall blocked');


console.log('\n--- 5. Testing Bot AI Decision Logic ---');
// Mock GameState for testing Bot decisions
const mockGameState = {
  currentPlayer: 0,
  players: [
    { col: 4, row: 0, walls: 10, moveTo(c,r){this.col=c; this.row=r;}, useWall(){this.walls--;} },
    { col: 4, row: 8, walls: 10, moveTo(c,r){this.col=c; this.row=r;}, useWall(){this.walls--;} }
  ],
  horizontalWalls: [],
  verticalWalls: [],
  botDifficulty: 'professional',
  gameMode: 'ai',
  humanPlayerIndex: 1,
  history: []
};

// Easy Bot Choice
mockGameState.botDifficulty = 'easy';
let move = getBestMove(mockGameState);
assert(move && (move.type === 'move' || move.type === 'wall'), 'Easy Bot returns a valid move object');

// Medium Bot Choice
mockGameState.botDifficulty = 'medium';
move = getBestMove(mockGameState);
assert(move && (move.type === 'move' || move.type === 'wall'), 'Medium Bot returns a valid move object');

// Hard Bot Choice
mockGameState.botDifficulty = 'hard';
move = getBestMove(mockGameState);
assert(move && (move.type === 'move' || move.type === 'wall'), 'Hard Bot returns a valid move object');

// Pro Bot Choice
mockGameState.botDifficulty = 'professional';
move = getBestMove(mockGameState);
assert(move && (move.type === 'move' || move.type === 'wall'), 'Professional Bot returns a valid move object');

console.log('\n--- 6. Testing Tactical Safety Net ---');
// A. Immediate Win Priority: Bot can win on this turn
const winState = {
  currentPlayer: 0,
  players: [
    { col: 4, row: 7, walls: 10, moveTo(c,r){this.col=c; this.row=r;}, useWall(){this.walls--;} },
    { col: 1, row: 3, walls: 10, moveTo(c,r){this.col=c; this.row=r;}, useWall(){this.walls--;} }
  ],
  horizontalWalls: [],
  verticalWalls: [],
  botDifficulty: 'professional',
  gameMode: 'ai',
  humanPlayerIndex: 1,
  history: []
};
const winMove = getBestMove(winState);
assert(winMove && winMove.type === 'move' && winMove.col === 4 && winMove.row === 8, 'Bot immediately takes the winning move to row 8');

// B. Defensive Block: Opponent is 1 step from winning, Bot must block the win if possible
const threatState = {
  currentPlayer: 0,
  players: [
    { col: 4, row: 5, walls: 5, moveTo(c,r){this.col=c; this.row=r;}, useWall(){this.walls--;} },
    { col: 4, row: 1, walls: 5, moveTo(c,r){this.col=c; this.row=r;}, useWall(){this.walls--;} }
  ],
  horizontalWalls: [],
  verticalWalls: [],
  botDifficulty: 'professional',
  gameMode: 'ai',
  humanPlayerIndex: 1,
  history: []
};
const defensiveMove = getBestMove(threatState);
// Since opponent is at (4, 1) and goal is row 0, a horizontal wall at row 0 (e.g. col 3 or col 4) blocks (4,1)->(4,0)
assert(defensiveMove && defensiveMove.type === 'wall' && defensiveMove.orientation === 'h' && defensiveMove.row === 0 && (defensiveMove.col === 3 || defensiveMove.col === 4), 'Bot blocks the opponent from winning on the next turn');

console.log('\n🎉 ALL BOT AND GAME MECHANICS VERIFICATION TESTS PASSED! 🎉');
