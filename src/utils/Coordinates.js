/**
 * Coordinate Translation Utilities
 *
 * Coordinates are represented internally as 0-indexed integers:
 * col: 0 to 8 (corresponding to columns a to i)
 * row: 0 to 8 (corresponding to rows 1 to 9, from bottom to top)
 */

import { WALL_ORIENTATIONS } from './Constants.js';

const COLUMNS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

/**
 * Convert internal 0-indexed coordinates to cell notation (e.g., col 4, row 3 -> 'e4')
 * @param {number} col
 * @param {number} row
 * @returns {string}
 */
export function cellToNotation(col, row) {
  if (col < 0 || col >= COLUMNS.length) return '';
  const colLetter = COLUMNS[col];
  const rowNumber = row + 1; // 0-indexed to 1-9
  return `${colLetter}${rowNumber}`;
}

/**
 * Convert cell notation to internal coordinates (e.g., 'e4' -> { col: 4, row: 3 })
 * @param {string} notation
 * @returns {{col: number, row: number}|null}
 */
export function notationToCell(notation) {
  if (!notation || notation.length !== 2) return null;
  const colLetter = notation[0].toLowerCase();
  const rowChar = notation[1];
  
  const col = COLUMNS.indexOf(colLetter);
  const row = parseInt(rowChar, 10) - 1;
  
  if (col === -1 || isNaN(row) || row < 0 || row >= 9) {
    return null;
  }
  
  return { col, row };
}

/**
 * Convert wall internal coordinates to wall notation (e.g., horizontal at col 7, row 7 -> 'hh8')
 * @param {number} col - 0-indexed column (0 to 7)
 * @param {number} row - 0-indexed row (0 to 7)
 * @param {string} orientation - 'h' or 'v'
 * @returns {string}
 */
export function wallToNotation(col, row, orientation) {
  if (col < 0 || col > 7 || row < 0 || row > 7) return '';
  const colLetter = COLUMNS[col];
  const rowNumber = row + 1; // 0-indexed to 1-8
  return `${orientation}${colLetter}${rowNumber}`;
}

/**
 * Convert wall notation to internal coordinates and orientation (e.g., 'hh8' -> { col: 7, row: 7, orientation: 'h' })
 * @param {string} notation
 * @returns {{col: number, row: number, orientation: string}|null}
 */
export function notationToWall(notation) {
  if (!notation || notation.length !== 3) return null;
  const orientation = notation[0].toLowerCase();
  const colLetter = notation[1].toLowerCase();
  const rowChar = notation[2];
  
  if (orientation !== WALL_ORIENTATIONS.HORIZONTAL && orientation !== WALL_ORIENTATIONS.VERTICAL) {
    return null;
  }
  
  const col = COLUMNS.indexOf(colLetter);
  const row = parseInt(rowChar, 10) - 1;
  
  if (col === -1 || col > 7 || isNaN(row) || row < 0 || row > 7) {
    return null;
  }
  
  return { col, row, orientation };
}
