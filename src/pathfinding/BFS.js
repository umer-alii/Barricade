/**
 * Breadth First Search (BFS) Pathfinding for Quoridor/Barricade
 * Highly optimized for performance (minimizes array scans and allocations)
 */

/**
 * Find all valid immediately accessible cells from a given cell,
 * using pre-compiled wall Sets for O(1) lookups.
 *
 * @param {number} col
 * @param {number} row
 * @param {Set<string>} hSet - Set of placed horizontal walls "col,row"
 * @param {Set<string>} vSet - Set of placed vertical walls "col,row"
 * @returns {Array<{col: number, row: number}>} List of reachable neighbors
 */
export function getValidNeighborsFast(col, row, hSet, vSet) {
  const neighbors = [];
  
  // Up: (col, row + 1)
  if (row + 1 < 9) {
    const isBlocked = hSet.has(`${col},${row}`) || hSet.has(`${col - 1},${row}`);
    if (!isBlocked) neighbors.push({ col, row: row + 1 });
  }
  
  // Down: (col, row - 1)
  if (row - 1 >= 0) {
    const isBlocked = hSet.has(`${col},${row - 1}`) || hSet.has(`${col - 1},${row - 1}`);
    if (!isBlocked) neighbors.push({ col, row: row - 1 });
  }
  
  // Left: (col - 1, row)
  if (col - 1 >= 0) {
    const isBlocked = vSet.has(`${col - 1},${row}`) || vSet.has(`${col - 1},${row - 1}`);
    if (!isBlocked) neighbors.push({ col: col - 1, row });
  }
  
  // Right: (col + 1, row)
  if (col + 1 < 9) {
    const isBlocked = vSet.has(`${col},${row}`) || vSet.has(`${col},${row - 1}`);
    if (!isBlocked) neighbors.push({ col: col + 1, row });
  }
  
  return neighbors;
}

/**
 * Legacy compatibility neighbor calculator (slower, scans arrays directly)
 */
export function getValidNeighbors(col, row, horizontalWalls, verticalWalls) {
  const hSet = new Set(horizontalWalls.map(w => `${w.col},${w.row}`));
  const vSet = new Set(verticalWalls.map(w => `${w.col},${w.row}`));
  return getValidNeighborsFast(col, row, hSet, vSet);
}

/**
 * Run BFS to check if there is at least one path from the player's start position
 * to any cell on the goal row.
 *
 * @param {{col: number, row: number}} start - Player's current position
 * @param {number} goalRow - Target row index (0 or 8)
 * @param {Array} horizontalWalls - Placed horizontal walls
 * @param {Array} verticalWalls - Placed vertical walls
 * @returns {boolean} True if a path exists, false otherwise
 */
export function hasPath(start, goalRow, horizontalWalls, verticalWalls) {
  const hSet = new Set(horizontalWalls.map(w => `${w.col},${w.row}`));
  const vSet = new Set(verticalWalls.map(w => `${w.col},${w.row}`));

  const queue = [{ col: start.col, row: start.row }];
  const visited = new Set();
  visited.add(`${start.col},${start.row}`);
  
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    
    if (current.row === goalRow) {
      return true;
    }
    
    const neighbors = getValidNeighborsFast(current.col, current.row, hSet, vSet);
    for (const neighbor of neighbors) {
      const key = `${neighbor.col},${neighbor.row}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }
  
  return false;
}

/**
 * Run BFS to find the shortest path from start to the goal row.
 * Returns the path as an array of cells [{col, row}, ...], or null if no path exists.
 *
 * @param {{col: number, row: number}} start
 * @param {number} goalRow
 * @param {Array} horizontalWalls
 * @param {Array} verticalWalls
 * @returns {Array<{col: number, row: number}>|null}
 */
export function getShortestPath(start, goalRow, horizontalWalls, verticalWalls) {
  const hSet = new Set(horizontalWalls.map(w => `${w.col},${w.row}`));
  const vSet = new Set(verticalWalls.map(w => `${w.col},${w.row}`));

  const queue = [{ col: start.col, row: start.row, parent: null }];
  const visited = new Set();
  visited.add(`${start.col},${start.row}`);
  
  let head = 0;
  let goalNode = null;

  while (head < queue.length) {
    const current = queue[head++];
    
    if (current.row === goalRow) {
      goalNode = current;
      break;
    }
    
    const neighbors = getValidNeighborsFast(current.col, current.row, hSet, vSet);
    for (const neighbor of neighbors) {
      const key = `${neighbor.col},${neighbor.row}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({
          col: neighbor.col,
          row: neighbor.row,
          parent: current
        });
      }
    }
  }
  
  if (!goalNode) return null;

  // Reconstruct path backward from goal node to start node
  const path = [];
  let curr = goalNode;
  while (curr) {
    path.push({ col: curr.col, row: curr.row });
    curr = curr.parent;
  }
  return path.reverse();
}

/**
 * High-performance shortest distance calculator using flat queues and zero object allocation
 * inside the BFS loop.
 *
 * @param {{col: number, row: number}} start
 * @param {number} goalRow
 * @param {Set<string>} hSet
 * @param {Set<string>} vSet
 * @returns {number} Distance to goal row, or -1 if blocked
 */
export function getShortestDistanceFast(start, goalRow, hSet, vSet) {
  const queueCol = [start.col];
  const queueRow = [start.row];
  const queueDist = [0];
  const visited = new Set();
  visited.add(`${start.col},${start.row}`);

  let head = 0;
  while (head < queueCol.length) {
    const c = queueCol[head];
    const r = queueRow[head];
    const d = queueDist[head++];

    if (r === goalRow) {
      return d;
    }

    // Up: (c, r + 1)
    if (r + 1 < 9) {
      const isBlocked = hSet.has(`${c},${r}`) || hSet.has(`${c - 1},${r}`);
      if (!isBlocked) {
        const key = `${c},${r + 1}`;
        if (!visited.has(key)) {
          visited.add(key);
          queueCol.push(c);
          queueRow.push(r + 1);
          queueDist.push(d + 1);
        }
      }
    }
    // Down: (c, r - 1)
    if (r - 1 >= 0) {
      const isBlocked = hSet.has(`${c},${r - 1}`) || hSet.has(`${c - 1},${r - 1}`);
      if (!isBlocked) {
        const key = `${c},${r - 1}`;
        if (!visited.has(key)) {
          visited.add(key);
          queueCol.push(c);
          queueRow.push(r - 1);
          queueDist.push(d + 1);
        }
      }
    }
    // Left: (c - 1, r)
    if (c - 1 >= 0) {
      const isBlocked = vSet.has(`${c - 1},${r}`) || vSet.has(`${c - 1},${r - 1}`);
      if (!isBlocked) {
        const key = `${c - 1},${r}`;
        if (!visited.has(key)) {
          visited.add(key);
          queueCol.push(c - 1);
          queueRow.push(r);
          queueDist.push(d + 1);
        }
      }
    }
    // Right: (c + 1, r)
    if (c + 1 < 9) {
      const isBlocked = vSet.has(`${c},${r}`) || vSet.has(`${c},${r - 1}`);
      if (!isBlocked) {
        const key = `${c + 1},${r}`;
        if (!visited.has(key)) {
          visited.add(key);
          queueCol.push(c + 1);
          queueRow.push(r);
          queueDist.push(d + 1);
        }
      }
    }
  }

  return -1;
}
