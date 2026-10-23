import { CELL, cellAt, type Grid } from "./map";

export const VISION_RADIUS = 330;

/**
 * Distance a ray travels from (ox, oy) at `angle` before it hits a wall, capped at `max` (grid DDA).
 * `northWall` lets the ray climb that many px up a north wall face, so wall screens stay lit.
 */
export function castRay(g: Grid, ox: number, oy: number, angle: number, max: number, northWall = 0): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let cx = Math.floor(ox / CELL);
  let cy = Math.floor(oy / CELL);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(CELL / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(CELL / dy);
  let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? (cx + 1) * CELL : cx * CELL) - ox) / dx;
  let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? (cy + 1) * CELL : cy * CELL) - oy) / dy;
  let t = 0;
  while (t < max) {
    let vertical = false;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      cx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      cy += stepY;
      vertical = true;
    }
    if (cellAt(g, cx, cy) === 0) {
      if (northWall && vertical && stepY < 0) return Math.min(t + northWall / -dy, max);
      return Math.min(t, max);
    }
  }
  return max;
}

/** Visibility polygon around a point, as a flat [x0, y0, x1, y1, ...] list. */
export function visibilityPolygon(g: Grid, ox: number, oy: number, radius = VISION_RADIUS, rays = 240, northWall = 0) {
  const pts = new Array<number>(rays * 2);
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const d = castRay(g, ox, oy, a, radius, northWall);
    pts[i * 2] = ox + Math.cos(a) * d;
    pts[i * 2 + 1] = oy + Math.sin(a) * d;
  }
  return pts;
}

/** Can a viewer at (ox, oy) see the point (tx, ty)? */
export function canSee(g: Grid, ox: number, oy: number, tx: number, ty: number, radius = VISION_RADIUS) {
  const d = Math.hypot(tx - ox, ty - oy);
  if (d > radius) return false;
  return castRay(g, ox, oy, Math.atan2(ty - oy, tx - ox), d) >= d - 1;
}
