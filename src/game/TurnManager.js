/**
 * Turn Manager Class
 */

export class TurnManager {
  /**
   * Verify if the given player is allowed to execute an action
   * @param {GameState} gameState
   * @param {number} playerIndex
   * @returns {boolean}
   */
  isValidTurn(gameState, playerIndex) {
    // If the game has ended, no moves can be made
    if (gameState.winner !== null) {
      return false;
    }
    // Only the currentPlayer is allowed to act
    return gameState.currentPlayer === playerIndex;
  }

  /**
   * Advance the game state after a player acts:
   * - Saves move to history
   * - Checks victory conditions
   * - Switches currentPlayer if game continues
   *
   * @param {GameState} gameState
   * @param {string} moveNotation
   * @returns {number|null} Winner index if the move ended the game, null otherwise
   */
  commitAction(gameState, moveNotation) {
    gameState.addMove(moveNotation);
    
    // Check if the current action triggered a win
    const winner = gameState.checkWinner();
    if (winner !== null) {
      return winner;
    }

    // Switch turn
    gameState.switchPlayer();
    return null;
  }
}
