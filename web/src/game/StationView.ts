import * as Phaser from "phaser";
import { CELL } from "@/shared/map";
import type { Station } from "@/shared/stations";
import type { StationState } from "@/shared/protocol";

const GREEN = 0x2ee6a6;
const RED = 0xff2d55;
const UP = -0.75;
const DOWN = 0.75;

/**
 * A task console against the wall, with its two levers on the front:
 * - green: slim shaft, round ball knob (the dev task)
 * - red: thick shaft, T-handle on a yellow/black hazard plate (the rug)
 * They look nothing alike on purpose: anyone who sees a red lever move knows.
 * A tampered console gets a spinning red beacon on top.
 */
export class StationView {
  private green: Phaser.GameObjects.Container;
  private red: Phaser.GameObjects.Container;
  private beacon: Phaser.GameObjects.Graphics;
  private beaconGlow: Phaser.GameObjects.Image;
  private bar: Phaser.GameObjects.Graphics;
  private screen: Phaser.GameObjects.Graphics;
  private greenA = UP;
  private redA = UP;
  readonly x: number;
  readonly y: number;
  /** Set by the scene: true while this console is one of your unfinished tasks. */
  highlight = false;

  constructor(
    private scene: Phaser.Scene,
    readonly def: Station,
    font: string,
  ) {
    const x = def.cx * CELL;
    const y = def.cy * CELL;
    const w = CELL * 2;
    this.x = x + w / 2;
    this.y = y + CELL;
    const depth = y + CELL;

    const g = scene.add.graphics().setDepth(depth);
    g.fillStyle(0x000000, 0.4).fillEllipse(this.x, y + CELL + 4, w * 1.05, 18);
    // Cabinet, tall enough to read against the wall.
    g.fillStyle(0x1b1530, 1).fillRoundedRect(x, y - 46, w, CELL + 46, 8);
    g.lineStyle(2, 0x4a3f78, 1).strokeRoundedRect(x, y - 46, w, CELL + 46, 8);
    // Lever plates: green on the left, hazard-striped red on the right.
    g.fillStyle(0x0d0a1a, 1).fillRoundedRect(x + 4, y, 34, 38, 6);
    g.lineStyle(2, GREEN, 0.8).strokeRoundedRect(x + 4, y, 34, 38, 6);
    for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xffc94d : 0x111111, 1).fillRect(x + 42 + i * (34 / 6), y, 34 / 6, 38);
    g.lineStyle(2, RED, 1).strokeRect(x + 42, y, 34, 38);

    this.screen = scene.add.graphics().setDepth(depth + 0.05);
    scene.add
      .text(this.x, y - 43, def.task.toUpperCase(), { fontFamily: font, fontSize: "7px", fontStyle: "700", color: "#bfb4ff" })
      .setOrigin(0.5, 0)
      .setResolution(3)
      .setDepth(depth + 0.1);

    this.green = this.lever(x + 21, y + 32, false, depth + 0.2);
    this.red = this.lever(x + 59, y + 32, true, depth + 0.2);

    this.beaconGlow = scene.add
      .image(this.x, y - 56, "glow")
      .setTint(RED)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(220, 180)
      .setDepth(depth + 0.3)
      .setVisible(false);
    this.beacon = scene.add.graphics().setDepth(depth + 0.35);
    this.bar = scene.add.graphics().setDepth(depth + 0.4);
  }

  private lever(x: number, y: number, red: boolean, depth: number) {
    const c = this.scene.add.container(x, y).setDepth(depth);
    const g = this.scene.add.graphics();
    if (red) {
      g.fillStyle(0x2a2a2a, 1).fillRect(-3.5, -22, 7, 22);
      g.fillStyle(RED, 1).fillRoundedRect(-11, -28, 22, 7, 3);
      g.lineStyle(1.5, 0x5a0016, 1).strokeRoundedRect(-11, -28, 22, 7, 3);
    } else {
      g.fillStyle(0xb8bccc, 1).fillRect(-1.5, -20, 3, 20);
      g.fillStyle(GREEN, 1).fillCircle(0, -22, 5.5);
      g.fillStyle(0xffffff, 0.6).fillCircle(-1.5, -23.5, 1.8);
    }
    g.fillStyle(0x3a3354, 1).fillCircle(0, 0, red ? 5 : 3.5);
    c.add(g);
    c.setScale(1.3);
    c.rotation = UP;
    return c;
  }

  update(t: number, dt: number, s: StationState | undefined) {
    const pulling = !!s?.by;
    const p = (s?.progress ?? 0) / 100;
    const target = (lever: "green" | "red") => (pulling && s?.lever === lever ? UP + (DOWN - UP) * Math.min(1, p * 1.6) : UP);
    const k = Math.min(1, dt / 60);
    this.greenA += (target("green") - this.greenA) * k;
    this.redA += (target("red") - this.redA) * k;
    this.green.rotation = this.greenA;
    // The red lever shudders while it's being pulled.
    this.red.rotation = this.redA + (pulling && s?.lever === "red" ? Math.sin(t * 0.06) * 0.06 : 0);

    // Screen: green when idle or on a task, red while rugging or tampered.
    const danger = s?.tampered || (pulling && s?.lever === "red");
    const sx = this.def.cx * CELL + 8;
    const sy = this.def.cy * CELL - 32;
    this.screen.clear();
    this.screen.fillStyle(0x05040b, 1).fillRect(sx, sy, CELL * 2 - 16, 26);
    const col = danger ? RED : this.highlight ? 0xffc94d : GREEN;
    this.screen.fillStyle(col, danger ? 0.5 + 0.3 * Math.sin(t * 0.02) : 0.4);
    for (let i = 0; i < 8; i++) {
      const hgt = 4 + ((i * 7 + Math.floor(t / 400)) % 14);
      this.screen.fillRect(sx + 5 + i * 7.5, sy + 22 - hgt, 5, hgt);
    }

    // Tampered: spinning beacon.
    this.beacon.clear();
    this.beaconGlow.setVisible(!!s?.tampered);
    if (s?.tampered) {
      const by = this.def.cy * CELL - 54;
      const a = t * 0.008;
      this.beacon.fillStyle(0x5a0016, 1).fillRect(this.x - 8, by + 2, 16, 6);
      this.beacon.fillStyle(RED, 0.95).fillCircle(this.x, by, 7);
      this.beacon.fillStyle(0xffffff, 0.8).fillCircle(this.x + Math.cos(a) * 4, by - 1, 2);
      this.beaconGlow.setAlpha(0.35 + 0.35 * Math.max(0, Math.cos(a)));
    }

    // Progress bar above the console while someone works it.
    this.bar.clear();
    if (pulling) {
      const bw = 70;
      const bx = this.x - bw / 2;
      const by = this.def.cy * CELL - 74;
      this.bar.fillStyle(0x000000, 0.7).fillRoundedRect(bx - 2, by - 2, bw + 4, 10, 4);
      this.bar.fillStyle(s?.lever === "red" ? RED : GREEN, 1).fillRoundedRect(bx, by, Math.max(4, bw * p), 6, 3);
    }
  }
}
