import * as Phaser from "phaser";
import {
  CELL,
  COLS,
  HALLS,
  LIQUIDITY_DOOR,
  PROPS,
  ROOMS,
  ROWS,
  WORLD_H,
  WORLD_W,
  buildFloorGrid,
  cellAt,
  roomAt,
  type Room,
  type RoomId,
} from "@/shared/map";

// Draws Chog Labs HQ: the night outside, carpet floors, walls with neon trim, lights, furniture and live wall screens.

export const WALL_H = 64;
const PURPLE = 0x836ef9;
const GREEN = 0x2ee6a6;
const RED = 0xff4d6d;

type Animated = { update: (t: number) => void };

export function scaleColor(c: number, f: number) {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * f) | 0;
  const b = Math.min(255, (c & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}

const px = (cells: number) => cells * CELL;
const room = (id: RoomId) => ROOMS.find((r) => r.id === id)!;

export function buildStation(scene: Phaser.Scene, font: string) {
  const anim: Animated[] = [];
  const floorGrid = buildFloorGrid();

  // The city at night, outside the office windows.
  scene.add.tileSprite(WORLD_W / 2, WORLD_H / 2, WORLD_W + 2000, WORLD_H + 2000, "space").setDepth(-100);

  // Floors.
  for (const r of ROOMS) {
    scene.add
      .tileSprite(px(r.x), px(r.y), px(r.w), px(r.h), "floor")
      .setOrigin(0)
      .setTint(scaleColor(r.floor, 2.3))
      .setDepth(-50);
  }
  for (const h of HALLS) {
    scene.add.tileSprite(px(h.x), px(h.y), px(h.w), px(h.h), "hall").setOrigin(0).setDepth(-51);
  }

  // Floor stencils with the room name.
  for (const r of ROOMS) {
    scene.add
      .text(px(r.x + r.w / 2), px(r.y + r.h) - 34, r.name.toUpperCase(), {
        fontFamily: font,
        fontSize: "40px",
        fontStyle: "700",
        color: "#ffffff",
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.07)
      .setLetterSpacing(10)
      .setDepth(-49);
  }

  drawWalls(scene, floorGrid);

  // Room lights: big soft pool plus a few ceiling spots.
  for (const r of ROOMS) {
    scene.add
      .image(px(r.x + r.w / 2), px(r.y + r.h / 2), "glow")
      .setTint(r.trim)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.22)
      .setDisplaySize(px(r.w) * 1.2, px(r.h) * 1.2)
      .setDepth(-40);
    const spots = Math.max(2, Math.round(r.w / 6));
    for (let i = 0; i < spots; i++) {
      scene.add
        .image(px(r.x) + ((i + 0.5) / spots) * px(r.w), px(r.y) + 30, "glow")
        .setTint(0xffffff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.08)
        .setDisplaySize(260, 200)
        .setDepth(-39);
    }
  }

  // Wall decor and props.
  anim.push(openOffice(scene, font));
  anim.push(tradingWall(scene));
  anim.push(neonSign(scene, font, room("meme"), "WAGMI", 0xff5cc8, 0.75));
  anim.push(neonSign(scene, font, room("shill"), "GM", 0x4dd8ff, 0.85));
  anim.push(neonSign(scene, font, room("server"), "NODES", 0x6b8cff, 0.7));
  anim.push(neonSign(scene, font, room("conference"), "STANDUP", 0xffc94d));
  anim.push(neonSign(scene, font, room("break"), "COFFEE", 0xff9a5c, 0.3));
  anim.push(neonSign(scene, font, room("ceo"), "CEO", 0xb98bff, 0.7));
  anim.push(neonSign(scene, font, room("liquidity"), "LIQUIDITY", 0xff2d55));
  anim.push(shillScreens(scene));
  anim.push(auditScreens(scene, font));
  anim.push(liquidityDoor(scene, font));

  for (const p of PROPS) {
    const x = px(p.x);
    const y = px(p.y);
    const w = px(p.w);
    const h = px(p.h);
    if (p.kind === "desk") anim.push(desk(scene, x, y, w, h));
    if (p.kind === "table") anim.push(meetingTable(scene, x, y, w, h, font));
    if (p.kind === "racks") anim.push(serverRack(scene, x, y, w, h));
    if (p.kind === "pool") anim.push(liquidityPool(scene, x, y, w, h));
    if (p.kind === "counter") anim.push(coffeeCounter(scene, x, y, w, h));
    if (p.kind === "sofa") sofa(scene, x, y, w, h);
    if (p.kind === "ceodesk") anim.push(ceoDesk(scene, x, y, w, h));
  }

  return {
    update(t: number) {
      for (const a of anim) a.update(t);
    },
  };
}

function trimAt(cx: number, cy: number) {
  return roomAt(cx * CELL + CELL / 2, cy * CELL + CELL / 2)?.trim ?? PURPLE;
}

function drawWalls(scene: Phaser.Scene, fg: Uint8Array) {
  const faces = scene.make.graphics({}, false);
  const caps = scene.make.graphics({}, false);
  const trims = scene.make.graphics({}, false).setBlendMode(Phaser.BlendModes.ADD);
  const T = 14; // side wall thickness

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      if (cellAt(fg, cx, cy) !== 1) continue;
      const x = cx * CELL;
      const y = cy * CELL;
      const trim = trimAt(cx, cy);

      if (cellAt(fg, cx, cy - 1) === 0) {
        // North wall face, seen at an angle like the classic top-down view.
        faces.fillGradientStyle(0x2c2346, 0x2c2346, 0x17122a, 0x17122a, 1);
        faces.fillRect(x, y - WALL_H, CELL, WALL_H);
        faces.fillStyle(0x000000, 0.25);
        faces.fillRect(x + CELL - 1, y - WALL_H + 8, 1, WALL_H - 16);
        caps.fillStyle(0x3b3060, 1);
        caps.fillRect(x - 2, y - WALL_H - T, CELL + 4, T);
        trims.fillStyle(trim, 0.9);
        trims.fillRect(x, y - 4, CELL, 3);
        trims.fillStyle(trim, 0.18);
        trims.fillRect(x, y - 10, CELL, 10);
      }
      if (cellAt(fg, cx, cy + 1) === 0) {
        caps.fillStyle(0x3b3060, 1);
        caps.fillRect(x - 2, y + CELL, CELL + 4, T);
        caps.fillStyle(0x1a1430, 1);
        caps.fillRect(x - 2, y + CELL + T, CELL + 4, 10);
        trims.fillStyle(trim, 0.5);
        trims.fillRect(x, y + CELL - 2, CELL, 2);
      }
      if (cellAt(fg, cx - 1, cy) === 0) {
        const top = cellAt(fg, cx, cy - 1) === 0 ? y - WALL_H - T : y;
        caps.fillStyle(0x3b3060, 1);
        caps.fillRect(x - T, top, T, y + CELL - top + (cellAt(fg, cx, cy + 1) === 0 ? T : 0));
        trims.fillStyle(trim, 0.5);
        trims.fillRect(x, y, 2, CELL);
      }
      if (cellAt(fg, cx + 1, cy) === 0) {
        const top = cellAt(fg, cx, cy - 1) === 0 ? y - WALL_H - T : y;
        caps.fillStyle(0x3b3060, 1);
        caps.fillRect(x + CELL, top, T, y + CELL - top + (cellAt(fg, cx, cy + 1) === 0 ? T : 0));
        trims.fillStyle(trim, 0.5);
        trims.fillRect(x + CELL - 2, y, 2, CELL);
      }
    }
  }
  // Bake into one texture: thousands of rects are cheap to draw once, costly every frame.
  const rt = scene.add.renderTexture(0, -CELL * 2, WORLD_W, WORLD_H + CELL * 2).setOrigin(0).setDepth(-45);
  rt.draw([faces, caps, trims], 0, CELL * 2);
  faces.destroy();
  caps.destroy();
  trims.destroy();
}

/** A candlestick chart that random-walks; redraws into its own Graphics. */
function chartScreen(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { candles?: number; depth?: number; frame?: number; seed?: number } = {},
) {
  const n = opts.candles ?? 24;
  const g = scene.add.graphics().setDepth(opts.depth ?? -42);
  const glow = scene.add
    .image(x + w / 2, y + h / 2, "glow")
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(GREEN)
    .setAlpha(0.18)
    .setDisplaySize(w * 1.6, h * 2.2)
    .setDepth((opts.depth ?? -42) - 0.5);
  let price = 100;
  const candles: { o: number; c: number; hi: number; lo: number }[] = [];
  const push = () => {
    const o = price;
    price = Math.max(20, price + (Math.random() - 0.46) * 9);
    candles.push({ o, c: price, hi: Math.max(o, price) + Math.random() * 4, lo: Math.min(o, price) - Math.random() * 4 });
    if (candles.length > n) candles.shift();
  };
  for (let i = 0; i < n; i++) push();
  let last = 0;
  const draw = () => {
    g.clear();
    g.fillStyle(0x07060f, 1);
    g.fillRoundedRect(x - 4, y - 4, w + 8, h + 8, 6);
    g.lineStyle(2, opts.frame ?? 0x4a3f78, 1);
    g.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 6);
    g.lineStyle(1, 0xffffff, 0.05);
    for (let i = 1; i < 4; i++) g.lineBetween(x, y + (h * i) / 4, x + w, y + (h * i) / 4);
    const lo = Math.min(...candles.map((c) => c.lo));
    const hi = Math.max(...candles.map((c) => c.hi));
    const sy = (v: number) => y + h - 6 - ((v - lo) / (hi - lo || 1)) * (h - 12);
    const cw = w / n;
    candles.forEach((c, i) => {
      const up = c.c >= c.o;
      const col = up ? GREEN : RED;
      const cx = x + i * cw + cw / 2;
      g.lineStyle(1, col, 0.9);
      g.lineBetween(cx, sy(c.hi), cx, sy(c.lo));
      g.fillStyle(col, 1);
      const top = sy(Math.max(c.o, c.c));
      g.fillRect(cx - cw * 0.32, top, cw * 0.64, Math.max(2, sy(Math.min(c.o, c.c)) - top));
    });
    const lastC = candles[candles.length - 1];
    g.lineStyle(1, lastC.c >= lastC.o ? GREEN : RED, 0.6);
    g.lineBetween(x, sy(lastC.c), x + w, sy(lastC.c));
    glow.setTint(lastC.c >= candles[0].o ? GREEN : RED);
  };
  draw();
  return {
    update(t: number) {
      if (t - last < 650) return;
      last = t;
      push();
      draw();
    },
  };
}

function openOffice(scene: Phaser.Scene, font: string): Animated {
  const r = room("open");
  const x = px(r.x);
  const w = px(r.w);
  const top = px(r.y) - WALL_H;
  // The $CHOG chart everyone is building toward, between the two task consoles.
  const big = chartScreen(scene, x + w / 2 - 170, top + 6, 340, WALL_H - 18, { candles: 40, frame: PURPLE });
  void font;
  return { update: (t) => big.update(t) };
}

function tradingWall(scene: Phaser.Scene): Animated {
  const r = room("trading");
  const top = px(r.y) - WALL_H;
  const screens = [0, 1].map((i) =>
    chartScreen(scene, px(r.x) + 20 + i * 150, top + 10, 130, WALL_H - 24, { candles: 16, frame: GREEN }),
  );
  return { update: (t) => screens.forEach((s, i) => s.update(t + i * 220)) };
}

function neonSign(scene: Phaser.Scene, font: string, r: Room, label: string, color: number, at = 0.5): Animated {
  const cx = px(r.x) + px(r.w) * at;
  const cy = px(r.y) - WALL_H / 2 - 2;
  const css = `#${color.toString(16).padStart(6, "0")}`;
  const t = scene.add
    .text(cx, cy, label, { fontFamily: font, fontSize: "30px", fontStyle: "700", color: "#ffffff" })
    .setOrigin(0.5)
    .setShadow(0, 0, css, 16, true, true)
    .setStroke(css, 3)
    .setLetterSpacing(4)
    .setResolution(2)
    .setDepth(-41);
  const glow = scene.add
    .image(cx, cy + 10, "glow")
    .setTint(color)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0.35)
    .setDisplaySize(t.width * 2.2, 140)
    .setDepth(-41.5);
  const seed = Math.random() * 1000;
  return {
    update(time) {
      // Occasional flicker, like a real neon tube.
      const f = Math.sin((time + seed) * 0.013) > 0.985 ? 0.4 : 1;
      t.setAlpha(f);
      glow.setAlpha(0.35 * f);
    },
  };
}

function shillScreens(scene: Phaser.Scene): Animated {
  const r = room("shill");
  const g = scene.add.graphics().setDepth(-42);
  const x0 = px(r.x) + px(r.w) * 0.3;
  const top = px(r.y) - WALL_H + 10;
  let last = 0;
  let likes = [12, 40, 7];
  const draw = () => {
    g.clear();
    likes.forEach((l, i) => {
      const x = x0 + i * 70;
      g.fillStyle(0x0b0d18, 1).fillRoundedRect(x, top, 56, WALL_H - 22, 6);
      g.lineStyle(2, 0x4dd8ff, 0.9).strokeRoundedRect(x, top, 56, WALL_H - 22, 6);
      g.fillStyle(0x4dd8ff, 0.8).fillCircle(x + 10, top + 10, 5);
      g.fillStyle(0xffffff, 0.5).fillRect(x + 18, top + 7, 30, 3).fillRect(x + 6, top + 20, 44, 2).fillRect(x + 6, top + 26, 36, 2);
      g.fillStyle(0xff4fb8, 1).fillRect(x + 6, top + 34, Math.min(44, l / 2), 3);
    });
  };
  draw();
  return {
    update(t) {
      if (t - last < 900) return;
      last = t;
      likes = likes.map((l) => (l > 88 ? 4 : l + Math.random() * 12));
      draw();
    },
  };
}

function auditScreens(scene: Phaser.Scene, font: string): Animated {
  const r = room("audit");
  const lines = [
    "function rug() external {",
    "  require(msg.sender == dev);",
    "  treasury.transfer(dev, all);",
    "}  // 🚩 FLAGGED",
    "modifier onlyChogs() { _; }",
    "mint(to, 420_690e18);",
    "renounceOwnership(); // ✅",
  ];
  const x = px(r.x) + 30;
  const top = px(r.y) - WALL_H + 8;
  const w = px(r.w) * 0.55;
  const bg = scene.add.graphics().setDepth(-42);
  bg.fillStyle(0x050b08, 1).fillRoundedRect(x - 6, top - 2, w + 12, WALL_H - 16, 6);
  bg.lineStyle(2, 0x7dff9a, 0.8).strokeRoundedRect(x - 6, top - 2, w + 12, WALL_H - 16, 6);
  const txt = scene.add
    .text(x, top + 2, "", { fontFamily: "monospace", fontSize: "11px", color: "#7dff9a", lineSpacing: 1 })
    .setResolution(2)
    .setDepth(-41);
  void font;
  let i = 0;
  let last = 0;
  return {
    update(t) {
      if (t - last < 700) return;
      last = t;
      i = (i + 1) % lines.length;
      txt.setText([0, 1, 2].map((k) => lines[(i + k) % lines.length]));
    },
  };
}

function desk(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Animated {
  const g = scene.add.graphics().setDepth(y + h);
  g.fillStyle(0x000000, 0.35).fillEllipse(x + w / 2, y + h + 4, w * 1.05, 22);
  g.fillStyle(0x221b3d, 1).fillRoundedRect(x, y + 10, w, h - 10, 10);
  g.fillStyle(0x3a3063, 1).fillRoundedRect(x, y, w, h - 14, 10);
  g.lineStyle(2, 0x5b4c99, 1).strokeRoundedRect(x, y, w, h - 14, 10);
  // Two laptops.
  for (const ox of [0.18, 0.58]) {
    g.fillStyle(0x0a0816, 1).fillRect(x + w * ox, y + 6, w * 0.26, 26);
    g.lineStyle(1, 0x836ef9, 0.8).strokeRect(x + w * ox, y + 6, w * 0.26, 26);
  }
  const screen = chartScreen(scene, x + w * 0.18 + 3, y + 9, w * 0.26 - 6, 20, { candles: 8, depth: y + h + 0.1 });
  const screen2 = chartScreen(scene, x + w * 0.58 + 3, y + 9, w * 0.26 - 6, 20, { candles: 8, depth: y + h + 0.1 });
  return {
    update(t) {
      screen.update(t);
      screen2.update(t + 300);
    },
  };
}

function serverRack(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Animated {
  const g = scene.add.graphics().setDepth(y + h);
  g.fillStyle(0x000000, 0.35).fillRect(x + 4, y + h - 4, w, 14);
  g.fillStyle(0x161b33, 1).fillRect(x, y - 50, w, h + 50);
  g.lineStyle(2, 0x2c3666, 1).strokeRect(x, y - 50, w, h + 50);
  const units = Math.floor(w / 40);
  for (let i = 0; i < units; i++) g.lineStyle(1, 0x2c3666, 1).lineBetween(x + i * 40, y - 50, x + i * 40, y + h);
  const leds = scene.add.graphics().setDepth(y + h + 0.1);
  let last = 0;
  return {
    update(t) {
      if (t - last < 160) return;
      last = t;
      leds.clear();
      for (let i = 0; i < units; i++)
        for (let k = 0; k < 6; k++) {
          const on = Math.random() > 0.35;
          leds.fillStyle(k % 3 === 0 ? 0x6b8cff : 0x2ee6a6, on ? 1 : 0.15);
          leds.fillRect(x + i * 40 + 8 + (k % 2) * 14, y - 40 + Math.floor(k / 2) * 18, 8, 3);
        }
    },
  };
}

function liquidityPool(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Animated {
  const rim = scene.add.graphics().setDepth(-30);
  rim.fillStyle(0x2a2450, 1).fillRoundedRect(x - 12, y - 12, w + 24, h + 24, 28);
  rim.lineStyle(3, 0xa98bff, 0.9).strokeRoundedRect(x - 12, y - 12, w + 24, h + 24, 28);
  const liquid = scene.add.graphics().setDepth(-29);
  const glow = scene.add
    .image(x + w / 2, y + h / 2, "glow")
    .setTint(0x8f6bff)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0.5)
    .setDisplaySize(w * 1.6, h * 1.8)
    .setDepth(-28);
  return {
    update(t) {
      liquid.clear();
      liquid.fillGradientStyle(0x5b3fe0, 0x7b5cff, 0x2a1a8a, 0x3b22b0, 1);
      liquid.fillRoundedRect(x, y, w, h, 20);
      liquid.lineStyle(2, 0xc8b8ff, 0.35);
      for (let k = 0; k < 5; k++) {
        const yy = y + 24 + k * ((h - 48) / 4);
        liquid.beginPath();
        for (let i = 0; i <= 20; i++) {
          const xx = x + 20 + (i / 20) * (w - 40);
          const off = Math.sin(t * 0.002 + i * 0.6 + k) * 4;
          if (i === 0) liquid.moveTo(xx, yy + off);
          else liquid.lineTo(xx, yy + off);
        }
        liquid.strokePath();
      }
      glow.setAlpha(0.42 + 0.1 * Math.sin(t * 0.0015));
    },
  };
}

/** The conference table, with the emergency button in the middle. */
function meetingTable(scene: Phaser.Scene, x: number, y: number, w: number, h: number, font: string): Animated {
  const g = scene.add.graphics().setDepth(y + h);
  g.fillStyle(0x000000, 0.4).fillEllipse(x + w / 2, y + h + 6, w * 1.05, 34);
  g.fillStyle(0x2a1f10, 1).fillRoundedRect(x, y + 14, w, h - 14, 40);
  g.fillStyle(0x5a4020, 1).fillRoundedRect(x, y, w, h - 10, 40);
  g.lineStyle(3, 0xffc94d, 0.6).strokeRoundedRect(x, y, w, h - 10, 40);
  // Laptops round the edge.
  for (const ox of [0.15, 0.32, 0.68, 0.85]) {
    g.fillStyle(0x0a0816, 1).fillRect(x + w * ox - 14, y + 10, 28, 16);
    g.fillStyle(0x836ef9, 0.6).fillRect(x + w * ox - 11, y + 13, 22, 10);
  }
  const bx = x + w / 2;
  const by = y + (h - 10) / 2;
  const glass = scene.add.graphics().setDepth(y + h + 0.2);
  const glow = scene.add
    .image(bx, by, "glow")
    .setTint(0xff2d55)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(200, 140)
    .setDepth(y + h + 0.1);
  scene.add
    .text(bx, by + 24, "EMERGENCY", { fontFamily: font, fontSize: "10px", fontStyle: "700", color: "#ffd0da" })
    .setOrigin(0.5)
    .setLetterSpacing(3)
    .setResolution(2)
    .setDepth(y + h + 0.3);
  return {
    update(t) {
      const p = 0.5 + 0.5 * Math.sin(t * 0.004);
      glow.setAlpha(0.25 + p * 0.3);
      glass.clear();
      glass.fillStyle(0x3d335f, 1).fillEllipse(bx, by + 4, 56, 26);
      glass.fillStyle(0xd81e45, 1).fillEllipse(bx, by - 2, 44, 20);
      glass.fillStyle(0xff4d6d, 1).fillEllipse(bx, by - 5, 36, 15);
      glass.fillStyle(0xffffff, 0.35 + p * 0.2).fillEllipse(bx - 7, by - 8, 12, 4);
    },
  };
}

/** Coffee counter: espresso machine with a steaming cup and a little neon. */
function coffeeCounter(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Animated {
  const g = scene.add.graphics().setDepth(y + h);
  g.fillStyle(0x000000, 0.35).fillRect(x + 4, y + h - 2, w, 12);
  g.fillStyle(0x3a2a22, 1).fillRect(x, y - 24, w, h + 24);
  g.fillStyle(0x5c4436, 1).fillRect(x, y - 30, w, 12);
  // Machine
  g.fillStyle(0x9aa0b4, 1).fillRoundedRect(x + 16, y - 70, 54, 46, 6);
  g.fillStyle(0x23202e, 1).fillRect(x + 26, y - 52, 34, 16);
  g.fillStyle(0xffffff, 1).fillRoundedRect(x + 36, y - 40, 12, 10, 2);
  // Fridge + vending
  g.fillStyle(0x1b2438, 1).fillRoundedRect(x + w - 70, y - 90, 56, 70, 6);
  g.fillStyle(0xff9a5c, 0.85).fillRect(x + w - 62, y - 82, 40, 4);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) g.fillStyle([0xff4d6d, 0x2ee6a6, 0xffc94d][(i + k) % 3], 0.9).fillRect(x + w - 62 + k * 14, y - 72 + i * 14, 9, 9);
  const steam = scene.add.graphics().setDepth(y + h + 0.1);
  return {
    update(t) {
      steam.clear();
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.0006 + i / 3) % 1);
        steam.fillStyle(0xffffff, 0.25 * (1 - k)).fillCircle(x + 42 + Math.sin(t * 0.003 + i) * 3, y - 44 - k * 30, 3 + k * 4);
      }
    },
  };
}

function sofa(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  const g = scene.add.graphics().setDepth(y + h);
  g.fillStyle(0x000000, 0.35).fillEllipse(x + w / 2, y + h + 4, w * 1.05, 20);
  g.fillStyle(0x4b2a6b, 1).fillRoundedRect(x, y - 16, w, h + 16, 16);
  g.fillStyle(0x6b3f96, 1).fillRoundedRect(x + 8, y + 6, w - 16, h - 14, 10);
  g.lineStyle(2, 0x2a173d, 1).lineBetween(x + w / 2, y + 8, x + w / 2, y + h - 8);
}

/** The CEO's big desk: gold trim, a monitor showing the launch countdown chart. */
function ceoDesk(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Animated {
  const g = scene.add.graphics().setDepth(y + h);
  g.fillStyle(0x000000, 0.35).fillEllipse(x + w / 2, y + h + 4, w * 1.05, 24);
  g.fillStyle(0x2a1d3d, 1).fillRoundedRect(x, y + 10, w, h - 10, 8);
  g.fillStyle(0x47326a, 1).fillRoundedRect(x, y, w, h - 14, 8);
  g.lineStyle(2, 0xffc94d, 0.8).strokeRoundedRect(x, y, w, h - 14, 8);
  g.fillStyle(0x0a0816, 1).fillRect(x + w / 2 - 50, y - 26, 100, 34);
  const screen = chartScreen(scene, x + w / 2 - 46, y - 22, 92, 26, { candles: 14, depth: y + h + 0.1, frame: 0xffc94d });
  return { update: (t) => screen.update(t) };
}

/** Heavy door into the Liquidity Room. */
function liquidityDoor(scene: Phaser.Scene, font: string): Animated {
  const x = px(LIQUIDITY_DOOR.x);
  const y = px(LIQUIDITY_DOOR.y);
  const w = px(LIQUIDITY_DOOR.w);
  const g = scene.add.graphics().setDepth(y + CELL);
  g.fillStyle(0x2a0d18, 1).fillRect(x - 6, y - 10, w + 12, CELL + 10);
  g.fillStyle(0x4a1426, 1).fillRect(x, y - 4, w, CELL - 2);
  for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xffc94d : 0x111111, 1).fillRect(x + (i * w) / 6, y + CELL - 12, w / 6, 8);
  scene.add
    .text(x + w / 2, y + 8, "AUTHORIZED ONLY", { fontFamily: font, fontSize: "8px", fontStyle: "700", color: "#ffb3c1" })
    .setOrigin(0.5)
    .setResolution(2)
    .setDepth(y + CELL + 0.1);
  // The status light is drawn by SpotsView (it changes when the room unlocks).
  return { update() {} };
}
