/**
 * Local storage for daily puzzle progress.
 */

const STORAGE_KEY = 'barricade_puzzle_progress_v1';

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) { /* ignore */ }
}

export function getProgressForDate(puzzleDate) {
  const store = readStore();
  if (!store || store.date !== puzzleDate) return {};
  return store.puzzles || {};
}

export function recordAttempt(puzzleDate, puzzleId, correct) {
  const store = readStore();
  const puzzles = store?.date === puzzleDate ? { ...store.puzzles } : {};
  const prev = puzzles[puzzleId] || { attempts: 0, solved: false, gaveUp: false };

  puzzles[puzzleId] = {
    solved: correct || prev.solved,
    gaveUp: prev.gaveUp,
    attempts: prev.attempts + 1
  };

  writeStore({ date: puzzleDate, puzzles });
  return puzzles[puzzleId];
}

export function recordGiveUp(puzzleDate, puzzleId) {
  const store = readStore();
  const puzzles = store?.date === puzzleDate ? { ...store.puzzles } : {};
  const prev = puzzles[puzzleId] || { attempts: 0, solved: false };

  puzzles[puzzleId] = {
    solved: false,
    gaveUp: true,
    attempts: prev.attempts
  };

  writeStore({ date: puzzleDate, puzzles });
}

export function countCompleted(puzzleDate) {
  const puzzles = getProgressForDate(puzzleDate);
  return Object.values(puzzles).filter(p => p.solved || p.gaveUp).length;
}
