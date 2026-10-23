import { CELL, COLS, ROWS, cellAt, type Grid } from "./map";

/** BFS over walkable cells (8-way, no corner cutting). Returns cell-center waypoints in px, or null. */
export function findPath(g: Grid, fx: number, fy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  const sx = Math.floor(fx / CELL);
  const sy = Math.floor(fy / CELL);
  const ex = Math.floor(tx / CELL);
  const ey = Math.floor(ty / CELL);
  if (cellAt(g, ex, ey) !== 1) return null;
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  const start = sy * COLS + sx;
  const goal = ey * COLS + ex;
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === goal) break;
    const cx = cur % COLS;
    const cy = (cur / COLS) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (cellAt(g, nx, ny) !== 1) continue;
        // Keep a full cell of clearance when cutting corners so the player circle fits.
        if (dx && dy && (cellAt(g, cx + dx, cy) !== 1 || cellAt(g, cx, cy + dy) !== 1)) continue;
        const ni = ny * COLS + nx;
        if (prev[ni] !== -1) continue;
        prev[ni] = cur;
        queue.push(ni);
      }
    }
  }
  if (prev[goal] === -1) return null;
  const out: { x: number; y: number }[] = [];
  for (let c = goal; c !== start; c = prev[c]) {
    out.push({ x: (c % COLS) * CELL + CELL / 2, y: ((c / COLS) | 0) * CELL + CELL / 2 });
  }
  return out.reverse();
}

/** A random walkable point, in px. */
export function randomFloorPoint(g: Grid, rand = Math.random) {
  for (;;) {
    const cx = Math.floor(rand() * COLS);
    const cy = Math.floor(rand() * ROWS);
    if (cellAt(g, cx, cy) === 1) return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
  }
}
