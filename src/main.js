/**
 * Application Entry Point
 */

import { Game } from './game/Game.js';

document.addEventListener('DOMContentLoaded', () => {
  // Instantiate the game controller and bind it to window for easy access/debugging
  window.game = new Game();
});
