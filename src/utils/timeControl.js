/**
 * Client-side time control display helpers.
 */

export function formatClock(ms) {
  if (ms === null || ms === undefined) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTimeControlLabel(timeControl) {
  if (!timeControl) return '15+10';
  if (timeControl.toLowerCase() === 'unlimited') return 'Unlimited';
  return timeControl.split(' ')[0];
}

export function getDisplayClocks(gameState) {
  if (!gameState || gameState.isUnlimited || !gameState.clocks) {
    return [null, null];
  }

  const now = Date.now();
  const elapsed = now - (gameState.lastMoveAt || now);
  const clocks = [...gameState.clocks];
  const current = gameState.currentPlayer;
  clocks[current] = Math.max(0, clocks[current] - elapsed);
  return clocks;
}
