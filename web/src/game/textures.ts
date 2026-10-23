import * as Phaser from "phaser";
import { hex } from "@/shared/suits";

// Procedural textures, drawn once with Canvas 2D so the art stays crisp at any zoom.

export const CHAR_W = 128;
export const CHAR_H = 156;

function shade(c: number, f: number) {
  const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((c >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (c & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  return { tex, ctx: tex.getContext() };
}

/** Soft radial glow, white, used for lights (tinted + additive). */
export function makeGlow(scene: Phaser.Scene) {
  const s = 256;
  const { tex, ctx } = canvasTex(scene, "glow", s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.6, "rgba(255,255,255,0.14)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  tex.refresh();
}

/** Dark ring that fades the edge of the vision circle. Transparent center. */
export function makeVignette(scene: Phaser.Scene) {
  const s = 512;
  const { tex, ctx } = canvasTex(scene, "vignette", s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.62, "rgba(0,0,0,0)");
  g.addColorStop(0.86, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  tex.refresh();
}

/** The city at night, far below the office windows: dark blocks with scattered lit windows. */
export function makeSpace(scene: Phaser.Scene) {
  const s = 512;
  const { tex, ctx } = canvasTex(scene, "space", s, s);
  ctx.fillStyle = "#05040b";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) {
    const bw = 30 + Math.random() * 70;
    const bh = 30 + Math.random() * 90;
    const bx = Math.random() * s;
    const by = Math.random() * s;
    ctx.fillStyle = `rgba(${18 + Math.random() * 10},${14 + Math.random() * 8},${34 + Math.random() * 16},1)`;
    ctx.fillRect(bx, by, bw, bh);
    for (let wy = by + 4; wy < by + bh - 4; wy += 7)
      for (let wx = bx + 4; wx < bx + bw - 4; wx += 6) {
        if (Math.random() > 0.18) continue;
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,201,120,0.55)" : "rgba(169,152,255,0.45)";
        ctx.fillRect(wx, wy, 2, 3);
      }
  }
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7);
  g.addColorStop(0, "rgba(131,110,249,0.05)");
  g.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  tex.refresh();
}

/** Office carpet tiles: soft woven squares, alternating grain. Light gray so each room can tint it. */
export function makeFloor(scene: Phaser.Scene) {
  const s = 80;
  const { tex, ctx } = canvasTex(scene, "floor", s, s);
  const half = s / 2;
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * half;
    const y = Math.floor(i / 2) * half;
    ctx.fillStyle = i % 3 ? "#c9c9c9" : "#bdbdbd";
    ctx.fillRect(x, y, half, half);
    // Weave grain, horizontal on two tiles and vertical on the others.
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    for (let k = 1; k < half; k += 3) {
      if (i % 3) ctx.fillRect(x, y + k, half, 1);
      else ctx.fillRect(x + k, y, 1, half);
    }
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x, y, half, 1);
    ctx.fillRect(x, y, 1, half);
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.06)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  tex.refresh();
}

/** Corridor: polished dark concrete with a guide strip. */
export function makeHall(scene: Phaser.Scene) {
  const s = 80;
  const { tex, ctx } = canvasTex(scene, "hall", s, s);
  ctx.fillStyle = "#17142a";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(Math.random() * s, Math.random() * s, 3, 1);
  }
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(0, s / 2, s, 1);
  ctx.fillStyle = "rgba(131,110,249,0.12)";
  ctx.fillRect(0, 0, s, 2);
  tex.refresh();
}

/**
 * A Chog dev: the NFT art is the head (big and round, so the Chog is the face), studio headphones, a hoodie in
 * the seat color with a lanyard ID badge, jeans and sneakers. Faces right; flip for left.
 */
export function makeCharacter(scene: Phaser.Scene, key: string, suit: number, faceKey: string | null) {
  const { tex, ctx } = canvasTex(scene, key, CHAR_W, CHAR_H);
  const outline = "#0b0716";
  const skin = "#f4ead9";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = outline;

  // Legs (jeans) and sneakers, toes pointing the way we face.
  for (const lx of [44, 68]) {
    ctx.fillStyle = "#2b3a66";
    roundRect(ctx, lx, 120, 17, 26, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f2f0f8";
    roundRect(ctx, lx - 2, 140, 25, 12, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(suit, 0.9);
    ctx.fillRect(lx + 2, 143, 14, 3);
  }

  // Back arm.
  ctx.fillStyle = shade(suit, 0.6);
  roundRect(ctx, 24, 88, 16, 34, 8);
  ctx.fill();
  ctx.stroke();

  // Hoodie body.
  const body = ctx.createLinearGradient(30, 80, 98, 132);
  body.addColorStop(0, shade(suit, 1.2));
  body.addColorStop(0.55, shade(suit, 1));
  body.addColorStop(1, shade(suit, 0.6));
  ctx.fillStyle = body;
  roundRect(ctx, 30, 80, 68, 50, 18);
  ctx.fill();
  ctx.stroke();
  // Kangaroo pocket + hem.
  ctx.fillStyle = shade(suit, 0.75);
  roundRect(ctx, 44, 108, 40, 14, 6);
  ctx.fill();
  ctx.fillStyle = shade(suit, 0.55);
  ctx.fillRect(34, 124, 60, 4);
  // Hood bunched behind the neck.
  ctx.fillStyle = shade(suit, 0.7);
  ctx.beginPath();
  ctx.ellipse(64, 84, 30, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Drawstrings.
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  for (const dx of [56, 72]) {
    ctx.beginPath();
    ctx.moveTo(dx, 90);
    ctx.lineTo(dx + (dx < 64 ? -1 : 1), 104);
    ctx.stroke();
  }
  // Lanyard + ID badge.
  ctx.strokeStyle = "#836ef9";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(52, 88);
  ctx.lineTo(70, 104);
  ctx.lineTo(80, 88);
  ctx.stroke();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 64, 102, 14, 17, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#836ef9";
  ctx.fillRect(66, 104, 10, 4);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(66, 111, 10, 2);
  ctx.fillRect(66, 115, 7, 2);

  // Front arm with a hand.
  ctx.lineWidth = 4;
  ctx.fillStyle = shade(suit, 0.9);
  roundRect(ctx, 88, 88, 16, 32, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(96, 122, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head: the Chog NFT, cropped round.
  const hx = 64;
  const hy = 46;
  const hr = 38;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#1b1433";
  ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
  if (faceKey && scene.textures.exists(faceKey)) {
    const img = scene.textures.get(faceKey).getSourceImage() as CanvasImageSource;
    // Crop toward the face (upper-middle of the 384px art).
    ctx.drawImage(img, 56, 50, 272, 272, hx - hr, hy - hr, hr * 2, hr * 2);
  }
  // Soft shading so the head reads as round.
  const shadeG = ctx.createRadialGradient(hx - 12, hy - 14, 6, hx, hy, hr);
  shadeG.addColorStop(0, "rgba(255,255,255,0.12)");
  shadeG.addColorStop(0.7, "rgba(0,0,0,0)");
  shadeG.addColorStop(1, "rgba(10,0,30,0.35)");
  ctx.fillStyle = shadeG;
  ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = outline;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.stroke();

  // Studio headphones: band over the top, cups on both sides.
  ctx.lineWidth = 7;
  ctx.strokeStyle = outline;
  ctx.beginPath();
  ctx.arc(hx, hy + 2, hr + 5, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = shade(suit, 1.15);
  ctx.beginPath();
  ctx.arc(hx, hy + 2, hr + 5, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = outline;
  for (const cx of [hx - hr - 4, hx + hr + 4]) {
    ctx.fillStyle = "#2a2340";
    roundRect(ctx, cx - 8, hy - 12, 16, 28, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(suit, 1);
    roundRect(ctx, cx - 4, hy - 6, 8, 16, 4);
    ctx.fill();
  }

  tex.refresh();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export { hex };
