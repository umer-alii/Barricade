/**
 * Game Configuration Constants
 */

export const BOARD_SIZE = 9; // 9x9 grid
export const INITIAL_WALL_COUNT = 10;

// Player indices
export const PLAYER_1 = 0;
export const PLAYER_2 = 1;

// Starting coordinates (0-indexed)
// e1 -> column e (4), row 1 (0)
// e9 -> column e (4), row 9 (8)
export const STARTING_POSITIONS = {
  [PLAYER_1]: { col: 4, row: 0 },
  [PLAYER_2]: { col: 4, row: 8 }
};

// Target rows (0-indexed)
export const GOAL_ROWS = {
  [PLAYER_1]: 8, // Row 9
  [PLAYER_2]: 0  // Row 1
};

// Player Colors / CSS Classes
export const PLAYER_COLORS = {
  [PLAYER_1]: '#ef4444', // Red / Coral
  [PLAYER_2]: '#3b82f6'  // Blue
};

// Wall Orientations
export const WALL_ORIENTATIONS = {
  HORIZONTAL: 'h',
  VERTICAL: 'v'
};

// Error / Success Toast Messages
export const TOAST_MESSAGES = {
  WALLS_CANNOT_CROSS: 'Walls cannot cross.',
  PATH_BLOCKED: 'Must leave at least one path for both players.',
  WALL_EXISTS: 'Wall already exists.',
  INVALID_PLACEMENT: 'Invalid wall placement.',
  NO_WALLS_LEFT: 'No walls remaining.',
  NOT_YOUR_TURN: "It's not your turn."
};
