/**
 * Move History UI Component
 */

export class MoveHistory {
  /**
   * @param {string} containerId - Element ID where history rows will be appended
   */
  constructor(containerId = 'move-history-list') {
    this.container = document.getElementById(containerId);
    this.renderedCount = 0; // How many history entries have been rendered already
  }

  /**
   * Render only the new history entries since the last call.
   * Clears and rebuilds everything only when the list has shrunk (restart).
   *
   * @param {Array<string>} historyList - List of game moves in algebraic notation
   */
  render(historyList) {
    if (!this.container) return;

    // On restart or state load the list may be shorter than what we rendered — full rebuild
    if (historyList.length < this.renderedCount) {
      this.container.innerHTML = '';
      this.renderedCount = 0;
    }

    // Nothing new to append
    if (historyList.length === this.renderedCount) return;

    // Remove the last row if it was a partial row (only P1 move, no P2 yet),
    // so we can re-render it fully when P2's move comes in
    const lastRenderedTurn = Math.ceil(this.renderedCount / 2);
    const lastRenderedEntry = lastRenderedTurn * 2; // last fully paired entry
    if (this.renderedCount % 2 !== 0) {
      // The last rendered row only has P1's move — remove it to re-render
      const lastRow = this.container.lastElementChild;
      if (lastRow) lastRow.remove();
      this.renderedCount--;
    }

    // Build rows for any new turns
    const startTurn = Math.floor(this.renderedCount / 2);
    const totalTurns = Math.ceil(historyList.length / 2);

    for (let i = startTurn; i < totalTurns; i++) {
      const turnRow = document.createElement('div');
      turnRow.className = 'history-row';

      // Turn index label
      const turnNum = document.createElement('span');
      turnNum.className = 'history-turn-number';
      turnNum.textContent = `${i + 1}.`;
      turnRow.appendChild(turnNum);

      // Player 1 Move (Red)
      const p1Index = i * 2;
      const p1Move = historyList[p1Index];
      const p1Span = document.createElement('span');
      p1Span.className = 'history-move p1-move';
      if (p1Move) p1Span.textContent = p1Move;
      turnRow.appendChild(p1Span);

      // Player 2 Move (Blue)
      const p2Index = i * 2 + 1;
      const p2Move = historyList[p2Index];
      const p2Span = document.createElement('span');
      p2Span.className = 'history-move p2-move';
      if (p2Move) p2Span.textContent = p2Move;
      turnRow.appendChild(p2Span);

      // Highlight the very latest move
      const latestIdx = historyList.length - 1;
      if (p1Index === latestIdx) p1Span.classList.add('active-move');
      if (p2Index === latestIdx) p2Span.classList.add('active-move');

      this.container.appendChild(turnRow);
    }

    this.renderedCount = historyList.length;

    // Auto-scroll to show latest moves
    this.container.scrollTop = this.container.scrollHeight;
  }

  /**
   * Wipe the entire history list (call on board reset).
   */
  clear() {
    if (this.container) this.container.innerHTML = '';
    this.renderedCount = 0;
  }
}
