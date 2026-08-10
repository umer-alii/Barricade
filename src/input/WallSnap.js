/**
 * Shared wall-placement snap logic with sticky hysteresis.
 * Suggestions only appear outside cell boxes; snap reach is generous in the gaps.
 */

const MAX_SNAP_DISTANCE = 42;
const STICK_RADIUS = 34;
const SWITCH_BIAS = 22;
const CENTER_THRESHOLD = 14;

export class WallSnap {
  constructor(renderer) {
    this.renderer = renderer;
    this.intersections = [];
    this.cellRects = [];
    this.sticky = null;
  }

  clear() {
    this.sticky = null;
  }

  cacheIntersections() {
    this.intersections = [];
    this.cellRects = [];
    const cells = this.renderer.cellElements;
    if (!cells.length) return;

    for (let r = 0; r < 9; r++) {
      const rowRects = [];
      for (let c = 0; c < 9; c++) {
        const el = cells[r]?.[c];
        rowRects.push(el ? el.getBoundingClientRect() : null);
      }
      this.cellRects.push(rowRects);
    }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const bl = this.cellRects[r]?.[c];
        const br = this.cellRects[r]?.[c + 1];
        const tl = this.cellRects[r + 1]?.[c];
        if (!bl || !br || !tl) continue;

        const x = (bl.right + br.left) / 2;
        const y = (tl.bottom + bl.top) / 2;

        this.intersections.push({ col: c, row: r, x, y });
      }
    }
  }

  /** True when cursor is on or inside a cell's bounding box. */
  _isInsideAnyCell(mx, my) {
    for (const row of this.cellRects) {
      for (const rect of row) {
        if (!rect) continue;
        if (
          mx >= rect.left &&
          mx <= rect.right &&
          my >= rect.top &&
          my <= rect.bottom
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Pick wall orientation from cursor offset at an intersection.
   * Centre of 4 blocks (similar |dx| and |dy|) → vertical.
   */
  pickOrientation(mx, my, intersection) {
    const dx = mx - intersection.x;
    const dy = my - intersection.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < CENTER_THRESHOLD && absDy < CENTER_THRESHOLD) {
      return 'v';
    }

    return absDx < absDy ? 'v' : 'h';
  }

  _dist(mx, my, point) {
    return Math.hypot(mx - point.x, my - point.y);
  }

  _findClosest(mx, my) {
    let best = null;
    let minDist = Infinity;

    for (const inter of this.intersections) {
      const dist = this._dist(mx, my, inter);
      if (dist < minDist) {
        minDist = dist;
        best = { ...inter, dist };
      }
    }

    return best;
  }

  /**
   * Resolve snap target for cursor position.
   * @param {number} mx - clientX
   * @param {number} my - clientY
   * @param {string|null} forcedOrientation - 'h' | 'v' when dragging a specific wall type
   * @returns {{ col, row, orientation, x, y }|null}
   */
  resolve(mx, my, forcedOrientation = null) {
    if (this.intersections.length === 0) return null;

    if (this._isInsideAnyCell(mx, my)) {
      this.sticky = null;
      return null;
    }

    const closest = this._findClosest(mx, my);
    if (!closest || closest.dist > MAX_SNAP_DISTANCE) {
      this.sticky = null;
      return null;
    }

    const orientation = forcedOrientation || this.pickOrientation(mx, my, closest);

    if (this.sticky) {
      const stickyDist = this._dist(mx, my, this.sticky);

      if (stickyDist < STICK_RADIUS) {
        const sameSlot = this.sticky.col === closest.col && this.sticky.row === closest.row;
        if (sameSlot) {
          this.sticky = { ...this.sticky, orientation, x: closest.x, y: closest.y };
          return this.sticky;
        }

        if (closest.dist + SWITCH_BIAS >= stickyDist) {
          return { ...this.sticky, orientation: forcedOrientation || this.sticky.orientation };
        }
      }
    }

    this.sticky = {
      col: closest.col,
      row: closest.row,
      orientation,
      x: closest.x,
      y: closest.y
    };

    return this.sticky;
  }
}
