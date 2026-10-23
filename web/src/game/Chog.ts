import * as Phaser from "phaser";
import { CHAR_H, makeCharacter } from "./textures";
import { hex } from "@/shared/suits";

const SCALE = 0.5;

/** A player on the map: shadow, suit sprite with the Chog in the visor, and a nameplate. */
export class Chog extends Phaser.GameObjects.Container {
  private body_: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private plate: Phaser.GameObjects.Text;
  private walkT = 0;
  private lastX: number;
  private lastY: number;
  /** 0..1, used to fade players in and out of vision. */
  seen = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    public readonly id: string,
    readonly suit: { name: string; color: number },
    readonly chogId: number,
    name: string,
    font: string,
  ) {
    super(scene, x, y);
    const key = `char-${id}`;
    makeCharacter(scene, key, suit.color, `chog-${chogId}`);
    this.shadow = scene.add.ellipse(0, 0, 54, 16, 0x000000, 0.45);
    this.body_ = scene.add.image(0, 0, key).setOrigin(0.5, 1).setScale(SCALE);
    this.plate = scene.add
      .text(0, -CHAR_H * SCALE - 10, name, {
        fontFamily: font,
        fontSize: "15px",
        fontStyle: "700",
        color: "#ffffff",
        stroke: "#0b0716",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setResolution(2);
    const dot = scene.add.circle(-this.plate.width / 2 - 8, -CHAR_H * SCALE - 19, 4, suit.color);
    dot.setStrokeStyle(1.5, Phaser.Display.Color.HexStringToColor(hex(suit.color)).darken(40).color);
    this.add([this.shadow, this.body_, this.plate, dot]);
    this.lastX = x;
    this.lastY = y;
    scene.add.existing(this);
  }

  /** Fellow Ruggers see each other's names in red. */
  setNameColor(color: string) {
    this.plate.setColor(color);
  }

  /** Call once per frame after moving. Drives the walk bob and facing. */
  animate(dt: number) {
    const dx = this.x - this.lastX;
    const dy = this.y - this.lastY;
    const moving = Math.hypot(dx, dy) > 0.2;
    if (dx < -0.2) this.body_.setFlipX(true);
    else if (dx > 0.2) this.body_.setFlipX(false);
    if (moving) {
      this.walkT += dt * 0.018;
      const s = Math.sin(this.walkT);
      this.body_.y = -Math.abs(s) * 6;
      this.body_.rotation = s * 0.07;
      this.body_.setScale(SCALE * (1 + Math.abs(s) * 0.02), SCALE * (1 - Math.abs(s) * 0.03));
      this.shadow.setScale(1 - Math.abs(s) * 0.12, 1);
    } else {
      this.walkT = 0;
      // Idle breathing.
      const b = Math.sin(this.scene.time.now * 0.003) * 0.012;
      this.body_.y = 0;
      this.body_.rotation *= 0.8;
      this.body_.setScale(SCALE * (1 - b), SCALE * (1 + b));
      this.shadow.setScale(1, 1);
    }
    this.setDepth(this.y);
    this.lastX = this.x;
    this.lastY = this.y;
  }
}
