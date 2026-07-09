/**
 * General Helper Utilities
 */

/**
 * Deep clone a simple object or array
 * @param {any} obj
 * @returns {any}
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Check if two coordinate objects are equal
 * @param {{col: number, row: number}|null} coord1
 * @param {{col: number, row: number}|null} coord2
 * @returns {boolean}
 */
export function areCoordinatesEqual(coord1, coord2) {
  if (!coord1 || !coord2) return false;
  return coord1.col === coord2.col && coord1.row === coord2.row;
}
