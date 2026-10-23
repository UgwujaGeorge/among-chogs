import { CELL, cellAt, type Grid } from "./map";

export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 240; // px per second

/** True if a circle at (x, y) overlaps no wall cell. */
export function circleFree(g: Grid, x: number, y: number, r: number): boolean {
  const x0 = Math.floor((x - r) / CELL);
  const x1 = Math.floor((x + r) / CELL);
  const y0 = Math.floor((y - r) / CELL);
  const y1 = Math.floor((y + r) / CELL);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (cellAt(g, cx, cy) === 1) continue;
      // Closest point of the wall cell to the circle center.
      const nx = Math.max(cx * CELL, Math.min(x, cx * CELL + CELL));
      const ny = Math.max(cy * CELL, Math.min(y, cy * CELL + CELL));
      if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return false;
    }
  }
  return true;
}

/** Moves a circle by (dx, dy), sliding along walls. Steps in small chunks so fast moves can't tunnel. */
export function move(g: Grid, x: number, y: number, dx: number, dy: number, r = PLAYER_RADIUS) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (r / 2)));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (circleFree(g, x + sx, y, r)) x += sx;
    if (circleFree(g, x, y + sy, r)) y += sy;
  }
  return { x, y };
}
