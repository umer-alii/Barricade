/**
 * Chess-style time control parsing and clock management.
 */

export function parseTimeControl(timeControlStr) {
  const str = (timeControlStr || '15+10 (Rapid)').trim();

  if (str.toLowerCase() === 'unlimited') {
    return {
      timeControl: str,
      label: 'Unlimited',
      isUnlimited: true,
      baseMs: null,
      incrementMs: 0
    };
  }

  const match = str.match(/^(\d+)(?:\+(\d+))?/);
  if (!match) {
    return {
      timeControl: str,
      label: str.split(' ')[0],
      isUnlimited: false,
      baseMs: 15 * 60 * 1000,
      incrementMs: 10 * 1000
    };
  }

  const baseMinutes = parseInt(match[1], 10);
  const incrementSeconds = match[2] ? parseInt(match[2], 10) : 0;

  return {
    timeControl: str,
    label: incrementSeconds > 0 ? `${baseMinutes}+${incrementSeconds}` : `${baseMinutes}`,
    isUnlimited: false,
    baseMs: baseMinutes * 60 * 1000,
    incrementMs: incrementSeconds * 1000
  };
}

export function createClockState(timeControlStr) {
  const parsed = parseTimeControl(timeControlStr);
  if (parsed.isUnlimited) {
    return {
      timeControl: parsed.timeControl,
      timeControlLabel: parsed.label,
      isUnlimited: true,
      incrementMs: 0,
      clocks: null,
      lastMoveAt: Date.now()
    };
  }

  return {
    timeControl: parsed.timeControl,
    timeControlLabel: parsed.label,
    isUnlimited: false,
    incrementMs: parsed.incrementMs,
    clocks: [parsed.baseMs, parsed.baseMs],
    lastMoveAt: Date.now()
  };
}

export function formatClock(ms) {
  if (ms === null || ms === undefined) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

export function checkTimeout(gameState) {
  if (!gameState || gameState.isUnlimited || !gameState.clocks || gameState.winner !== null) {
    return null;
  }

  const now = Date.now();
  const elapsed = now - (gameState.lastMoveAt || now);
  const current = gameState.currentPlayer;
  const remaining = gameState.clocks[current] - elapsed;

  if (remaining <= 0) {
    return current === 0 ? 1 : 0;
  }

  return null;
}

/**
 * Deduct elapsed time from the acting player and add increment after a move.
 * @returns {{ winner: number }|null}
 */
export function applyMoveClock(gameState, playerIndex) {
  if (!gameState || gameState.isUnlimited || !gameState.clocks) return null;

  const now = Date.now();
  const elapsed = now - (gameState.lastMoveAt || now);
  const clocks = [...gameState.clocks];
  clocks[playerIndex] = Math.max(0, clocks[playerIndex] - elapsed);

  if (clocks[playerIndex] <= 0) {
    return { winner: playerIndex === 0 ? 1 : 0 };
  }

  clocks[playerIndex] += gameState.incrementMs || 0;
  gameState.clocks = clocks;
  gameState.lastMoveAt = now;
  return null;
}
