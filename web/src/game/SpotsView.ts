import * as Phaser from "phaser";
import { CELL, LIQUIDITY_DOOR, LIQ_CONSOLE, PANELS, VENTS } from "@/shared/map";
import type { GameStateView } from "@/shared/protocol";

const RED = 0xff2d55;
const GREEN = 0x2ee6a6;
const GOLD = 0xffc94d;

type Glow = Phaser.GameObjects.Image;

function glow(scene: Phaser.Scene, x: number, y: number, tint: number, size: number, depth: number): Glow {
  return scene.add.image(x, y, "glow").setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(size, size * 0.8).setDepth(depth).setAlpha(0);
}

/**
 * Everything interactive that isn't a lever station: floor vents, wall panels (breaker, meltdown cores, alarm),
 * the liquidity lever and the door's status light. Redraws state each frame from the synced room state.
 */
export class SpotsView {
  private panels: { id: string; g: Phaser.GameObjects.Graphics; glow: Glow; x: number; y: number }[] = [];
  private liqLever: Phaser.GameObjects.Container;
  private liqBar: Phaser.GameObjects.Graphics;
  private liqGlow: Glow;
  private doorLight: Phaser.GameObjects.Arc;
  private doorGlow: Glow;
  private doorText: Phaser.GameObjects.Text;
  private liqA = -0.8;

  constructor(
    private scene: Phaser.Scene,
    font: string,
  ) {
    // Vents: floor grates. Everyone sees them; only Ruggers can use them.
    for (const v of VENTS) {
      const x = (v.cx + 0.5) * CELL;
      const y = (v.cy + 0.5) * CELL;
      const g = scene.add.graphics().setDepth(-30);
      g.fillStyle(0x07060d, 1).fillRoundedRect(x - 18, y - 12, 36, 24, 4);
      g.lineStyle(2, 0x4a4466, 1).strokeRoundedRect(x - 18, y - 12, 36, 24, 4);
      g.lineStyle(2, 0x2a2540, 1);
      for (let i = -12; i <= 12; i += 6) g.lineBetween(x + i, y - 9, x + i, y + 9);
    }

    // Wall panels.
    for (const p of PANELS) {
      const x = (p.cx + 0.5) * CELL;
      const y = (p.cy + 1) * CELL;
      const base = scene.add.graphics().setDepth(y);
      base.fillStyle(0x000000, 0.35).fillEllipse(x, y + 3, 40, 10);
      base.fillStyle(0x1b1530, 1).fillRoundedRect(x - 17, y - 52, 34, 52, 5);
      base.lineStyle(2, p.id === "alarm" ? RED : 0x4a3f78, 1).strokeRoundedRect(x - 17, y - 52, 34, 52, 5);
      scene.add
        .text(x, y - 49, p.label.toUpperCase(), { fontFamily: font, fontSize: "7px", fontStyle: "700", color: p.id === "alarm" ? "#ffb3c1" : "#bfb4ff" })
        .setOrigin(0.5, 0)
        .setResolution(3)
        .setDepth(y + 0.1);
      this.panels.push({ id: p.id, g: scene.add.graphics().setDepth(y + 0.2), glow: glow(scene, x, y - 26, RED, 160, y + 0.15), x, y });
    }

    // Liquidity lever: one huge red lever on a gold plinth.
    const lx = (LIQ_CONSOLE.cx + (LIQ_CONSOLE.w ?? 1) / 2) * CELL;
    const ly = (LIQ_CONSOLE.cy + 1) * CELL;
    const plinth = scene.add.graphics().setDepth(ly);
    plinth.fillStyle(0x000000, 0.4).fillEllipse(lx, ly + 4, 90, 18);
    plinth.fillStyle(0x3a2c12, 1).fillRoundedRect(lx - 40, ly - 30, 80, 30, 8);
    plinth.lineStyle(3, GOLD, 1).strokeRoundedRect(lx - 40, ly - 30, 80, 30, 8);
    scene.add
      .text(lx, ly - 22, "PULL LIQUIDITY", { fontFamily: font, fontSize: "8px", fontStyle: "700", color: "#ffe9a8" })
      .setOrigin(0.5, 0)
      .setResolution(3)
      .setDepth(ly + 0.1);
    this.liqGlow = glow(scene, lx, ly - 30, RED, 260, ly + 0.05);
    this.liqLever = scene.add.container(lx, ly - 30).setDepth(ly + 0.2);
    const lg = scene.add.graphics();
    lg.fillStyle(0x2a2a2a, 1).fillRect(-5, -44, 10, 44);
    lg.fillStyle(RED, 1).fillRoundedRect(-20, -56, 40, 14, 6);
    lg.lineStyle(2, 0x5a0016, 1).strokeRoundedRect(-20, -56, 40, 14, 6);
    lg.fillStyle(0x3a3354, 1).fillCircle(0, 0, 8);
    this.liqLever.add(lg);
    this.liqLever.rotation = this.liqA;
    this.liqBar = scene.add.graphics().setDepth(ly + 0.3);

    // Door status light (the door itself is drawn by station.ts).
    const dx = (LIQUIDITY_DOOR.x + LIQUIDITY_DOOR.w / 2) * CELL;
    const dy = LIQUIDITY_DOOR.y * CELL + 22;
    this.doorGlow = glow(scene, dx, dy, RED, 140, LIQUIDITY_DOOR.y * CELL + CELL + 0.3);
    this.doorLight = scene.add.circle(dx, dy, 6, RED).setDepth(LIQUIDITY_DOOR.y * CELL + CELL + 0.4);
    this.doorText = scene.add
      .text(dx, dy + 10, "SEALED", { fontFamily: font, fontSize: "8px", fontStyle: "700", color: "#ffb3c1" })
      .setOrigin(0.5, 0)
      .setResolution(3)
      .setDepth(LIQUIDITY_DOOR.y * CELL + CELL + 0.4);
  }

  update(t: number, dt: number, s: GameStateView) {
    const blink = Math.sin(t * 0.012) > 0;

    for (const p of this.panels) {
      p.g.clear();
      let on = false;
      let col = 0x3a3354;
      if (p.id === "breaker") {
        on = s.sabotage === "blackout";
        col = on ? (blink ? GOLD : 0x5a4a20) : GREEN;
        // Breaker switch: down while the lights are out.
        p.g.fillStyle(0x0a0816, 1).fillRect(p.x - 7, p.y - 38, 14, 26);
        p.g.fillStyle(col, 1).fillRect(p.x - 5, on ? p.y - 22 : p.y - 36, 10, 8);
      } else if (p.id === "coreA" || p.id === "coreB") {
        on = s.sabotage === "meltdown";
        const held = !!(p.id === "coreA" ? s.coreA : s.coreB);
        col = !on ? 0x2a5a8a : held ? GREEN : blink ? RED : 0x5a0016;
        p.g.fillStyle(col, 1).fillCircle(p.x, p.y - 24, 10);
        p.g.lineStyle(2, 0xffffff, 0.4).strokeCircle(p.x, p.y - 24, 13);
        p.glow.setTint(held ? GREEN : RED);
      } else if (p.id === "alarm") {
        on = s.liqUnlocked;
        p.g.fillStyle(0x3d335f, 1).fillCircle(p.x, p.y - 22, 11);
        p.g.fillStyle(on ? RED : 0x6a2034, 1).fillCircle(p.x, p.y - 24, 9);
        p.g.fillStyle(0xffffff, on ? 0.5 : 0.15).fillCircle(p.x - 3, p.y - 27, 3);
      }
      p.glow.setAlpha(on ? (blink ? 0.6 : 0.25) : 0);
    }

    // Liquidity lever leans down as it's pulled; the room glows red while it drains.
    const target = s.liqBy ? -0.8 + 1.6 * (s.liqProgress / 100) : -0.8;
    this.liqA += (target - this.liqA) * Math.min(1, dt / 80);
    this.liqLever.rotation = this.liqA + (s.liqBy ? Math.sin(t * 0.05) * 0.04 : 0);
    this.liqGlow.setAlpha(s.liqBy ? 0.4 + 0.3 * Math.sin(t * 0.02) : s.liqUnlocked ? 0.15 : 0);
    this.liqBar.clear();
    if (s.liqBy) {
      const bx = this.liqLever.x - 45;
      const by = this.liqLever.y - 90;
      this.liqBar.fillStyle(0x000000, 0.7).fillRoundedRect(bx - 2, by - 2, 94, 12, 5);
      this.liqBar.fillStyle(RED, 1).fillRoundedRect(bx, by, Math.max(4, 90 * (s.liqProgress / 100)), 8, 4);
    }

    // Door: red and sealed, or flashing gold once the Ruggers have unlocked it.
    const open = s.liqUnlocked;
    this.doorLight.setFillStyle(open ? GOLD : RED).setAlpha(open ? (blink ? 1 : 0.4) : 0.8);
    this.doorGlow.setTint(open ? GOLD : RED).setAlpha(open ? (blink ? 0.7 : 0.25) : 0.3);
    this.doorText.setText(open ? "UNLOCKED" : "SEALED").setColor(open ? "#ffe9a8" : "#ffb3c1");
  }
}
