// The office map. Plain data + helpers, shared by the client and the game server.
// Everything is laid out on a grid of CELL px; rooms and halls are rects in cell units.

import { STATIONS } from "./stations";

export const CELL = 40;
export const COLS = 80;
export const ROWS = 56;
export const WORLD_W = COLS * CELL;
export const WORLD_H = ROWS * CELL;

export type Rect = { x: number; y: number; w: number; h: number };

export type RoomId =
  | "open"
  | "meme"
  | "shill"
  | "server"
  | "trading"
  | "conference"
  | "break"
  | "audit"
  | "ceo"
  | "liquidity";

export type Room = Rect & {
  id: RoomId;
  name: string;
  /** Floor tint and neon trim color. */
  floor: number;
  trim: number;
};

// Chog Labs HQ, late at night.
export const ROOMS: Room[] = [
  { id: "open", name: "Open Office", x: 30, y: 4, w: 20, h: 14, floor: 0x1a1430, trim: 0x836ef9 },
  { id: "meme", name: "Meme Studio", x: 6, y: 4, w: 14, h: 10, floor: 0x1d1228, trim: 0xff5cc8 },
  { id: "shill", name: "Shill Corner", x: 60, y: 4, w: 14, h: 10, floor: 0x121a2e, trim: 0x4dd8ff },
  { id: "server", name: "Server Room", x: 2, y: 22, w: 14, h: 12, floor: 0x10162a, trim: 0x6b8cff },
  { id: "conference", name: "Conference Room", x: 32, y: 24, w: 16, h: 12, floor: 0x1e1810, trim: 0xffc94d },
  { id: "trading", name: "Trading Desk", x: 64, y: 22, w: 14, h: 12, floor: 0x0f1c1c, trim: 0x2ee6a6 },
  { id: "break", name: "Break Room", x: 8, y: 40, w: 16, h: 12, floor: 0x1c1418, trim: 0xff9a5c },
  { id: "audit", name: "Audit Room", x: 32, y: 42, w: 16, h: 11, floor: 0x0e1a14, trim: 0x7dff9a },
  { id: "ceo", name: "CEO Office", x: 58, y: 40, w: 16, h: 12, floor: 0x1a1022, trim: 0xb98bff },
  { id: "liquidity", name: "Liquidity Room", x: 52, y: 15, w: 8, h: 9, floor: 0x220c16, trim: 0xff2d55 },
];

export const HALLS: Rect[] = [
  { x: 20, y: 8, w: 10, h: 4 }, // meme <-> open office
  { x: 50, y: 8, w: 10, h: 4 }, // open office <-> shill
  { x: 10, y: 14, w: 4, h: 8 }, // meme -> server
  { x: 66, y: 14, w: 4, h: 8 }, // shill -> trading
  { x: 38, y: 18, w: 4, h: 6 }, // open office -> conference
  { x: 16, y: 28, w: 16, h: 4 }, // server <-> conference
  { x: 48, y: 28, w: 16, h: 4 }, // conference <-> trading
  { x: 10, y: 34, w: 4, h: 6 }, // server -> break
  { x: 66, y: 34, w: 4, h: 6 }, // trading -> ceo
  { x: 38, y: 36, w: 4, h: 6 }, // conference -> audit
  { x: 24, y: 45, w: 8, h: 4 }, // break <-> audit
  { x: 48, y: 45, w: 10, h: 4 }, // audit <-> ceo
  { x: 55, y: 24, w: 2, h: 4 }, // liquidity room door
];

/** The Liquidity Room door: cells that block movement while it's locked. */
export const LIQUIDITY_DOOR: Rect = { x: 55, y: 24, w: 2, h: 1 };

/** Blocking furniture. Cell units. Task stations are added on top of these (see stations.ts). */
export const PROPS: (Rect & { kind: string })[] = [
  // Open Office: four dev desks around the spawn lane.
  { kind: "desk", x: 32, y: 10, w: 4, h: 2 },
  { kind: "desk", x: 44, y: 10, w: 4, h: 2 },
  { kind: "desk", x: 32, y: 14, w: 4, h: 2 },
  { kind: "desk", x: 44, y: 14, w: 4, h: 2 },
  // Conference Room: the big table with the emergency button.
  { kind: "table", x: 36, y: 28, w: 8, h: 3 },
  // Server Room
  { kind: "racks", x: 4, y: 27, w: 6, h: 1 },
  { kind: "racks", x: 4, y: 31, w: 6, h: 1 },
  // Trading Desk
  { kind: "desk", x: 66, y: 28, w: 4, h: 2 },
  { kind: "desk", x: 72, y: 28, w: 4, h: 2 },
  // Meme Studio + Shill Corner
  { kind: "desk", x: 9, y: 9, w: 4, h: 2 },
  { kind: "desk", x: 66, y: 9, w: 4, h: 2 },
  // Break Room
  { kind: "counter", x: 10, y: 46, w: 5, h: 1 },
  { kind: "sofa", x: 17, y: 48, w: 5, h: 2 },
  // Audit Room
  { kind: "desk", x: 36, y: 47, w: 4, h: 2 },
  { kind: "desk", x: 42, y: 47, w: 4, h: 2 },
  // CEO Office
  { kind: "ceodesk", x: 63, y: 45, w: 6, h: 2 },
  // Liquidity Room
  { kind: "pool", x: 54, y: 20, w: 4, h: 2 },
];

/** A point you interact with (not a lever station). Cell coords; blocks its cell unless `floor`. */
export type Spot = { id: string; cx: number; cy: number; w?: number; floor?: boolean };

/** The big lever inside the Liquidity Room. Pulling it to the end rugs the coin. */
export const LIQ_CONSOLE: Spot = { id: "liq", cx: 55, cy: 16, w: 2 };

/** Wall panels: blackout breaker, the two meltdown cores, and the alarm by the Liquidity Room door. */
export const PANELS: (Spot & { label: string })[] = [
  { id: "breaker", label: "Breaker", cx: 22, cy: 40 },
  { id: "coreA", label: "Core A", cx: 14, cy: 22 },
  { id: "coreB", label: "Core B", cx: 64, cy: 22 },
  { id: "alarm", label: "Alarm", cx: 59, cy: 28 },
];

/** Floor vents, Ruggers only. Each network is a loop: venting takes you to the next vent in it. */
export const VENTS: (Spot & { net: string })[] = [
  { id: "v-meme", net: "west", cx: 8, cy: 12, floor: true },
  { id: "v-server", net: "west", cx: 13, cy: 32, floor: true },
  { id: "v-break", net: "south", cx: 21, cy: 42, floor: true },
  { id: "v-audit", net: "south", cx: 34, cy: 50, floor: true },
  { id: "v-ceo", net: "east", cx: 71, cy: 49, floor: true },
  { id: "v-trading", net: "east", cx: 75, cy: 32, floor: true },
  { id: "v-hall", net: "east", cx: 51, cy: 30, floor: true },
];

/** Center of a spot in px (floor vents) or its front edge (wall panels and consoles). */
export function spotPos(s: Spot) {
  const w = s.w ?? 1;
  return s.floor
    ? { x: (s.cx + w / 2) * CELL, y: (s.cy + 0.5) * CELL }
    : { x: (s.cx + w / 2) * CELL, y: (s.cy + 1) * CELL + 8 };
}

/** Next vent in the same network. */
export function ventExit(id: string) {
  const v = VENTS.find((x) => x.id === id);
  if (!v) return null;
  const net = VENTS.filter((x) => x.net === v.net);
  return net[(net.indexOf(v) + 1) % net.length];
}

export const SPAWN = { x: 40 * CELL, y: 7 * CELL };
/** Where the emergency button sits (middle of the conference table). */
export const MEETING_TABLE = { x: 40 * CELL, y: 29.5 * CELL };

/** Grid: 1 = walkable floor, 0 = wall / void. */
export type Grid = Uint8Array;

/** Walk grid. `doorOpen` is the Rugger's version once the Liquidity Room is unlocked. */
export function buildGrid(doorOpen = false): Grid {
  const g = new Uint8Array(COLS * ROWS);
  const fill = (r: Rect, v: number) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) g[y * COLS + x] = v;
  };
  ROOMS.forEach((r) => fill(r, 1));
  HALLS.forEach((r) => fill(r, 1));
  PROPS.forEach((p) => fill(p, 0));
  STATIONS.forEach((s) => fill({ x: s.cx, y: s.cy, w: 2, h: 1 }, 0));
  [LIQ_CONSOLE, ...PANELS].forEach((s) => fill({ x: s.cx, y: s.cy, w: s.w ?? 1, h: 1 }, 0));
  if (!doorOpen) fill(LIQUIDITY_DOOR, 0);
  return g;
}

/** Floor cells only (props count as floor), for rendering. */
export function buildFloorGrid(): Grid {
  const g = new Uint8Array(COLS * ROWS);
  for (const r of [...ROOMS, ...HALLS])
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) g[y * COLS + x] = 1;
  return g;
}

export function cellAt(g: Grid, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return 0;
  return g[cy * COLS + cx];
}

export function walkableAt(g: Grid, px: number, py: number): boolean {
  return cellAt(g, Math.floor(px / CELL), Math.floor(py / CELL)) === 1;
}

/** True if (px, py) is within `range` px of the conference table (where the emergency button is). */
export function nearTable(px: number, py: number, range: number) {
  const t = PROPS.find((p) => p.kind === "table")!;
  const dx = Math.max(t.x * CELL - px, 0, px - (t.x + t.w) * CELL);
  const dy = Math.max(t.y * CELL - py, 0, py - (t.y + t.h) * CELL);
  return Math.hypot(dx, dy) <= range;
}

/** True inside the Liquidity Room or its doorway. */
export function inLiquidity(px: number, py: number) {
  const cx = px / CELL;
  const cy = py / CELL;
  const r = ROOMS.find((x) => x.id === "liquidity")!;
  const inRoom = cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h;
  const d = LIQUIDITY_DOOR;
  const inDoor = cx >= d.x && cx < d.x + d.w && cy >= d.y - 0.5 && cy < d.y + d.h + 1;
  return inRoom || inDoor;
}

export function roomAt(px: number, py: number): Room | null {
  const cx = px / CELL;
  const cy = py / CELL;
  return ROOMS.find((r) => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) ?? null;
}
