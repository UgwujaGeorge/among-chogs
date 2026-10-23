import * as Phaser from "phaser";

/**
 * Floating touch joystick: press anywhere on the left side of the screen, drag to move.
 * Lives on the UI camera, so it works in screen pixels.
 */
export class Joystick {
  readonly vec = new Phaser.Math.Vector2();
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private pointerId: number | null = null;
  private ox = 0;
  private oy = 0;
  private readonly radius: number;

  constructor(private scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, dpr: number) {
    this.radius = 64 * dpr;
    this.base = scene.add.circle(0, 0, this.radius, 0x0b0716, 0.35).setStrokeStyle(3 * dpr, 0x836ef9, 0.7).setVisible(false);
    this.knob = scene.add.circle(0, 0, 28 * dpr, 0x836ef9, 0.85).setStrokeStyle(3 * dpr, 0xffffff, 0.8).setVisible(false);
    layer.add([this.base, this.knob]);
    scene.input.addPointer(2);
    scene.input.on("pointerdown", this.down, this);
    scene.input.on("pointermove", this.move, this);
    scene.input.on("pointerup", this.up, this);
    scene.input.on("pointerupoutside", this.up, this);
  }

  private down(p: Phaser.Input.Pointer) {
    if (this.pointerId !== null || !p.wasTouch) return;
    if (p.x > this.scene.scale.width * 0.6) return;
    this.pointerId = p.id;
    this.ox = p.x;
    this.oy = p.y;
    this.base.setPosition(p.x, p.y).setVisible(true);
    this.knob.setPosition(p.x, p.y).setVisible(true);
  }

  private move(p: Phaser.Input.Pointer) {
    if (p.id !== this.pointerId) return;
    const dx = p.x - this.ox;
    const dy = p.y - this.oy;
    const d = Math.hypot(dx, dy);
    const k = d > this.radius ? this.radius / d : 1;
    this.knob.setPosition(this.ox + dx * k, this.oy + dy * k);
    const mag = Math.min(1, d / this.radius);
    // Small dead zone, then full speed quickly: Among Us style.
    if (mag < 0.15) this.vec.set(0, 0);
    else this.vec.set(dx / d, dy / d).scale(Math.min(1, mag * 1.4));
  }

  private up(p: Phaser.Input.Pointer) {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.vec.set(0, 0);
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }
}
