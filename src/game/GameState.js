/**
 * Game State Model Class
 */

import { Player } from '../players/Player.js';
import { STARTING_POSITIONS, GOAL_ROWS } from '../utils/Constants.js';

export class GameState {
  constructor() {
    this.currentPlayer = 0; // 0 or 1
    this.players = [
      new Player(0, STARTING_POSITIONS[0].col, STARTING_POSITIONS[0].row),
      new Player(1, STARTING_POSITIONS[1].col, STARTING_POSITIONS[1].row)
    ];
    this.horizontalWalls = []; // Array of Wall objects
    this.verticalWalls = [];   // Array of Wall objects
    this.history = [];         // Array of strings (e.g. 'e2', 'hh8')
    this.winner = null;        // null, 0, or 1
    
    // Match Mode Settings
    this.gameMode = 'local';       // 'local' or 'ai'
    this.botDifficulty = 'medium';  // 'easy', 'medium', 'hard', 'professional'
    this.humanPlayerIndex = 0;     // 0 (Red) or 1 (Blue)
  }

  /**
   * Reset game state to initial values
   */
  reset() {
    this.currentPlayer = 0;
    this.players = [
      new Player(0, STARTING_POSITIONS[0].col, STARTING_POSITIONS[0].row),
      new Player(1, STARTING_POSITIONS[1].col, STARTING_POSITIONS[1].row)
    ];
    this.horizontalWalls = [];
    this.verticalWalls = [];
    this.history = [];
    this.winner = null;
    // gameMode, botDifficulty, and humanPlayerIndex are preserved across resets
  }

  /**
   * Switches turn to the other player
   */
  switchPlayer() {
    this.currentPlayer = this.currentPlayer === 0 ? 1 : 0;
  }

  /**
   * Adds a move to the history list
   * @param {string} notation
   */
  addMove(notation) {
    this.history.push(notation);
  }

  /**
   * Check if a player has met the goal row criteria
   * @returns {number|null} Player index of the winner, or null if no winner
   */
  checkWinner() {
    if (this.players[0].row === GOAL_ROWS[0]) {
      this.winner = 0;
      return 0;
    }
    if (this.players[1].row === GOAL_ROWS[1]) {
      this.winner = 1;
      return 1;
    }
    return null;
  }

  /**
   * Serialize game state to a simple JSON object
   * @returns {Object}
   */
  serialize() {
    return {
      currentPlayer: this.currentPlayer,
      players: this.players.map(p => ({
        playerIndex: p.playerIndex,
        col: p.col,
        row: p.row,
        walls: p.walls
      })),
      horizontalWalls: this.horizontalWalls.map(w => ({ col: w.col, row: w.row, placedBy: w.placedBy ?? null })),
      verticalWalls: this.verticalWalls.map(w => ({ col: w.col, row: w.row, placedBy: w.placedBy ?? null })),
      history: this.history,
      winner: this.winner,
      gameMode: this.gameMode,
      botDifficulty: this.botDifficulty,
      humanPlayerIndex: this.humanPlayerIndex
    };
  }

  /**
   * Deserialize game state from a JSON object
   * @param {Object} data
   */
  deserialize(data) {
    if (!data) return;
    this.currentPlayer = data.currentPlayer;
    
    // Reconstruct player coordinates and wall inventories
    if (Array.isArray(data.players)) {
      data.players.forEach((pData, idx) => {
        if (this.players[idx]) {
          this.players[idx].col = pData.col;
          this.players[idx].row = pData.row;
          this.players[idx].walls = pData.walls;
        }
      });
    }
    
    this.horizontalWalls = data.horizontalWalls || [];
    this.verticalWalls = data.verticalWalls || [];
    this.history = data.history || [];
    this.winner = data.winner !== undefined ? data.winner : null;
    this.gameMode = data.gameMode || 'local';
    this.botDifficulty = data.botDifficulty || 'medium';
    this.humanPlayerIndex = data.humanPlayerIndex !== undefined ? data.humanPlayerIndex : 0;
  }
}
