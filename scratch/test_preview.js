import { JSDOM } from 'jsdom';

const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
  <div id="board" class="board-grid"></div>
  <div id="lobby-overlay"></div>
  <div id="win-modal" class="hidden"><div id="win-message"></div><button id="win-restart-btn"></button></div>
  <button id="restart-btn"></button>
  <button id="theme-toggle-btn"></button>
  <div id="p1-walls-text"></div>
  <div id="p2-walls-text"></div>
  <div id="p1-card"></div>
  <div id="p2-card"></div>
  <div id="lobby-btn"></div>
  <div id="lobby-diff-container"></div>
  <div id="lobby-side-container"></div>
  <div id="move-history"></div>
</body>
</html>
`);

global.window = dom.window;
global.document = dom.window.document;
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import { Game } from '../src/game/Game.js';

const game = new Game();

// Setup mock cells coordinates
const cells = game.renderer.cellElements;
const mockRects = [];
for (let r = 0; r < 9; r++) {
  const rowRects = [];
  for (let c = 0; c < 9; c++) {
    rowRects.push({
      left: c * 60,
      top: (8 - r) * 60,
      width: 58,
      height: 58
    });
  }
  mockRects.push(rowRects);
}
game.mouseController.cellRects = mockRects;

// Simulate mouse move near left edge of cell (col 3, row 4)
const e = {
  clientX: 183,
  clientY: 269,
  target: cells[4][3]
};

console.log('Simulating mousemove...');
game.mouseController.onMouseMove(e);

console.log('Preview element class list:', game.dragPreview.element.className);
console.log('Preview element gridRow:', game.dragPreview.element.style.gridRow);
console.log('Preview element gridColumn:', game.dragPreview.element.style.gridColumn);
console.log('Active wall hover details:', game.mouseController.activeWallHover);
