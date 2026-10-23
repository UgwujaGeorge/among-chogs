import * as Phaser from "phaser";
import {
  LIQ_CONSOLE,
  PANELS,
  VENTS,
  buildFloorGrid,
  buildGrid,
  inLiquidity,
  nearTable,
  roomAt,
  spotPos,
  type Grid,
  type Spot,
} from "@/shared/map";
import { PLAYER_SPEED, move } from "@/shared/physics";
import { VISION_RADIUS, canSee, visibilityPolygon } from "@/shared/vision";
import { SUITS } from "@/shared/suits";
import { BLACKOUT_VISION, BUTTON_RANGE, SPOT_RANGE, TICK_MS, type Phase, type PlayerState, type ServerMessages } from "@/shared/protocol";
import { STATIONS, nearestStation } from "@/shared/stations";
import type { GameRoom } from "@/net/net";
import { WALL_H, buildStation } from "./station";
import { makeFloor, makeGlow, makeHall, makeSpace, makeVignette } from "./textures";
import { Chog } from "./Chog";
import { Joystick } from "./Joystick";
import { StationView } from "./StationView";
import { SpotsView } from "./SpotsView";
import { sfx } from "./sfx";
import { bus } from "./bus";

export type SceneConfig = { font: string; dpr: number; room: GameRoom };

/** A player on screen. Remote players glide toward the last position the server sent. */
type Avatar = { chog: Chog; suit: number; tx: number; ty: number; alive: boolean };

export class MainScene extends Phaser.Scene {
  private cfg!: SceneConfig;
  private walk!: Grid;
  private walkOpen!: Grid;
  private spots!: SpotsView;
  /** Current vision radius (shrinks for devs in a blackout). */
  private vision = VISION_RADIUS;
  private sight!: Grid;
  private room!: GameRoom;
  private me: Avatar | null = null;
  private avatars = new Map<string, Avatar>();
  private loading = new Set<number>();
  private rugMates = new Set<string>();
  private phase: Phase = "lobby";
  private sentX = NaN;
  private sentY = NaN;
  private sendTimer = 0;
  private offs: (() => void)[] = [];
  private station!: ReturnType<typeof buildStation>;
  private ui!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private fog!: Phaser.GameObjects.RenderTexture;
  private fogShape!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Image;
  private joy!: Joystick;
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private currentRoom: string | null = null;
  private stations = new Map<string, StationView>();
  /** Last seen "who is pulling which lever" per station, to play a sound when a pull starts. */
  private pullSeen = new Map<string, string>();
  private myTodo = new Set<string>();
  private near: string | null = null;

  constructor() {
    super("main");
  }

  init() {
    this.cfg = this.registry.get("cfg");
    this.room = this.cfg.room;
  }

  preload() {
    // Load whoever is already in the room so the first frame isn't empty.
    this.room.state.players?.forEach((p) => this.load.image(`chog-${p.chogId}`, `/chogs/${p.chogId}.webp`));
  }

  create() {
    const { font, dpr } = this.cfg;
    makeGlow(this);
    makeVignette(this);
    makeSpace(this);
    makeFloor(this);
    makeHall(this);

    this.walk = buildGrid();
    this.walkOpen = buildGrid(true);
    this.sight = buildFloorGrid();
    this.station = buildStation(this, font);
    for (const def of STATIONS) this.stations.set(def.id, new StationView(this, def, font));
    this.spots = new SpotsView(this, font);

    this.syncPlayers();

    // UI layer: fog + joystick, drawn by a second camera in screen pixels.
    this.ui = this.add.layer().setDepth(1e6);
    this.fog = this.make.renderTexture({ x: 0, y: 0, width: this.scale.width, height: this.scale.height }, false);
    this.fog.setOrigin(0).setAlpha(0.93);
    this.ui.add(this.fog);
    this.fogShape = this.make.graphics({}, false);
    this.vignette = this.make.image({ key: "vignette" }, false);
    this.joy = new Joystick(this, this.ui, dpr);

    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.children.list.filter((o) => o !== (this.ui as unknown)));
    this.cameras.main.ignore(this.ui);
    if (this.me) this.follow(this.me.chog);
    this.cameras.main.setBackgroundColor("#06040d");
    this.fitCamera();
    this.scale.on("resize", this.onResize, this);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: "UP",
      down: "DOWN",
      left: "LEFT",
      right: "RIGHT",
      w: "W",
      a: "A",
      s: "S",
      d: "D",
    }) as typeof this.keys;
    kb.on("keydown-E", () => bus.emit("action", "use"));
    kb.on("keydown-Q", () => bus.emit("action", "rug"));
    kb.on("keydown-F", () => bus.emit("action", "sabotage"));

    this.offs.push(
      this.room.onMessage("snap", (m: ServerMessages["snap"]) => {
        if (!this.me) return;
        this.me.chog.setPosition(m.x, m.y);
        this.sentX = m.x;
        this.sentY = m.y;
      }),
      this.room.onMessage("vent", (m: ServerMessages["vent"]) => {
        for (const at of [m.from, m.to]) if (this.canSeePoint(at.x, at.y)) this.puff(at.x, at.y);
      }),
      this.room.onMessage("tasks", (m: ServerMessages["tasks"]) => {
        this.myTodo = new Set(m.fake ? [] : m.ids.filter((id) => !m.done.includes(id)));
      }),
      this.room.onMessage("role", (m: ServerMessages["role"]) => {
        this.rugMates = new Set(m.ruggers);
        this.avatars.forEach((a, id) => a.chog.setNameColor(this.rugMates.has(id) ? "#ff4d6d" : "#ffffff"));
      }),
    );
    this.events.once("destroy", () => this.offs.forEach((off) => off()));

    bus.emit("ready", undefined);
  }

  private get amRugger() {
    return this.rugMates.has(this.room.sessionId);
  }

  private canSeePoint(x: number, y: number) {
    const me = this.me?.chog;
    return !!me && canSee(this.sight, me.x, me.y - 30, x, y - 20, this.vision);
  }

  /** Smoke puff where someone dropped into or popped out of a vent. */
  private puff(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const c = this.add.circle(x, y, 8 + Math.random() * 8, 0x9a90c0, 0.7).setDepth(y + 50);
      this.uiCam.ignore(c);
      this.tweens.add({
        targets: c,
        x: x + (Math.random() - 0.5) * 70,
        y: y - 20 - Math.random() * 50,
        alpha: 0,
        scale: 1.8,
        duration: 600 + Math.random() * 400,
        onComplete: () => c.destroy(),
      });
    }
  }

  /** The interactable you're closest to: "station:id", "panel:id", "vent:id", "liq" or "button". Fired: nothing. */
  private nearest(x: number, y: number): string | null {
    if (!this.me?.alive) return null;
    const st = nearestStation(x, y);
    if (st) return `station:${st.id}`;
    const spots: [string, Spot][] = PANELS.map((p) => [`panel:${p.id}`, p]);
    if (this.amRugger) {
      spots.push(...VENTS.map((v): [string, Spot] => [`vent:${v.id}`, v]), ["liq", LIQ_CONSOLE]);
    }
    let best: string | null = null;
    let bd = SPOT_RANGE;
    for (const [key, spot] of spots) {
      const f = spotPos(spot);
      const d = Math.hypot(f.x - x, f.y - y);
      if (d <= bd) {
        bd = d;
        best = key;
      }
    }
    return best ?? (nearTable(x, y, BUTTON_RANGE) ? "button" : null);
  }

  private follow(target: Chog) {
    this.cameras.main.startFollow(target, true, 0.12, 0.12, 0, 40);
  }

  /** Makes sure a Chog's NFT art is loaded. Returns false while it's still downloading. */
  private hasFace(chogId: number) {
    const key = `chog-${chogId}`;
    if (this.textures.exists(key)) return true;
    if (!this.loading.has(chogId)) {
      this.loading.add(chogId);
      this.load.image(key, `/chogs/${chogId}.webp`);
      this.load.once(`filecomplete-image-${key}`, () => this.loading.delete(chogId));
      this.load.start();
    }
    return false;
  }

  /** Mirrors the synced player list: spawns, re-skins (suit change) and removes avatars. */
  private syncPlayers() {
    const players = this.room.state.players;
    if (!players) return;
    const seen = new Set<string>();
    players.forEach((p: PlayerState, id: string) => {
      seen.add(id);
      const a = this.avatars.get(id);
      if (a && a.suit === p.suit) {
        a.tx = p.x;
        a.ty = p.y;
        a.alive = p.alive;
        return;
      }
      if (!this.hasFace(p.chogId)) return;
      const x = a?.chog.x ?? p.x;
      const y = a?.chog.y ?? p.y;
      a?.chog.destroy();
      const chog = new Chog(this, x, y, `${id}-${p.suit}`, SUITS[p.suit], p.chogId, p.name, this.cfg.font);
      if (this.rugMates.has(id)) chog.setNameColor("#ff4d6d");
      this.uiCam?.ignore(chog);
      const av: Avatar = { chog, suit: p.suit, tx: p.x, ty: p.y, alive: p.alive };
      this.avatars.set(id, av);
      if (id === this.room.sessionId) {
        this.me = av;
        if (this.uiCam) this.follow(chog);
      }
    });
    for (const [id, a] of this.avatars) {
      if (seen.has(id)) continue;
      a.chog.destroy();
      this.avatars.delete(id);
    }
  }

  private fitCamera() {
    const { width, height } = this.scale;
    const zoom = Math.min(width, height) / 2 / (VISION_RADIUS * 1.12);
    this.cameras.main.setZoom(zoom);
  }

  private onResize(size: Phaser.Structs.Size) {
    this.cameras.main.setSize(size.width, size.height);
    this.uiCam.setSize(size.width, size.height);
    this.fog.resize(size.width, size.height);
    this.fitCamera();
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, 50);
    this.station.update(time);
    this.syncPlayers();

    const phase = this.room.state.phase;
    if (phase !== this.phase) {
      this.phase = phase;
      if (phase === "lobby") {
        this.myTodo.clear();
        this.rugMates.clear();
        this.avatars.forEach((a) => a.chog.setNameColor("#ffffff"));
      }
    }

    const me = this.me;
    if (me) {
      this.moveMe(me.chog, dt);
      me.chog.animate(dt);
      me.chog.setAlpha(me.alive || phase === "lobby" ? 1 : 0.45);
    }

    // Remote players: ease toward the server position, jump if they teleported.
    const k = Math.min(1, dt / 70);
    for (const a of this.avatars.values()) {
      if (a === me) continue;
      const c = a.chog;
      if (Math.hypot(a.tx - c.x, a.ty - c.y) > 200) c.setPosition(a.tx, a.ty);
      else c.setPosition(c.x + (a.tx - c.x) * k, c.y + (a.ty - c.y) * k);
      c.animate(dt);
      // Only show players you can actually see. Fired players vanish for everyone still working;
      // other fired players see each other faintly.
      const meFired = !!me && !me.alive;
      let visible = !me || canSee(this.sight, me.chog.x, me.chog.y, c.x, c.y - 30, this.vision);
      if (!a.alive && !meFired) visible = false;
      c.seen = Phaser.Math.Linear(c.seen, visible ? 1 : 0, Math.min(1, dt / 90));
      c.setAlpha(c.seen * (a.alive ? 1 : 0.4));
    }

    this.updateStations(time, dt);
    this.spots.update(time, dt, this.room.state);
    // Blackout: devs' vision shrinks; Ruggers keep theirs. Fired players see the whole office.
    const fired = this.me && !this.me.alive && this.phase !== "lobby";
    const want = fired
      ? VISION_RADIUS * 3
      : this.room.state.sabotage === "blackout" && !this.amRugger
        ? VISION_RADIUS * BLACKOUT_VISION
        : VISION_RADIUS;
    this.vision += (want - this.vision) * Math.min(1, dt / 250);

    if (me) {
      const n = phase === "playing" ? this.nearest(me.chog.x, me.chog.y) : null;
      if (n !== this.near) {
        this.near = n;
        bus.emit("near", n);
      }
      const r = roomAt(me.chog.x, me.chog.y)?.name ?? null;
      if (r !== this.currentRoom) {
        this.currentRoom = r;
        bus.emit("room", r);
      }
      this.drawFog(me.chog);
    }
  }

  /** Animates consoles and plays lever sounds you can hear: red pulls carry much further than green ones. */
  private updateStations(time: number, dt: number) {
    const states = this.room.state.stations;
    const me = this.me?.chog;
    for (const [id, view] of this.stations) {
      const s = states?.get(id);
      view.highlight = this.myTodo.has(id);
      view.update(time, dt, s);
      const key = s?.by ? `${s.by}:${s.lever}` : "";
      if (key && key !== this.pullSeen.get(id) && me) {
        const d = Math.hypot(view.x - me.x, view.y - me.y);
        if (s!.lever === "red" && d < VISION_RADIUS * 2) sfx.red(1 - d / (VISION_RADIUS * 2.2));
        else if (s!.lever === "green" && d < VISION_RADIUS) sfx.green(1 - d / (VISION_RADIUS * 1.1));
      }
      this.pullSeen.set(id, key);
    }
  }

  /** Local movement runs the same physics as the server, then reports the result a few times a second. */
  private moveMe(me: Chog, dt: number) {
    if (this.phase !== "reveal" && this.phase !== "meeting") {
      const k = this.keys;
      let ix = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      let iy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
      if (ix || iy) {
        const l = Math.hypot(ix, iy);
        ix /= l;
        iy /= l;
      } else {
        ix = this.joy.vec.x;
        iy = this.joy.vec.y;
      }
      const step = (PLAYER_SPEED * (this.room.state.settings?.speed ?? 1) * dt) / 1000;
      // Ruggers walk through the Liquidity Room door once it's unlocked (and can always walk out).
      const open = this.amRugger && (this.room.state.liqUnlocked || inLiquidity(me.x, me.y));
      const p = move(open ? this.walkOpen : this.walk, me.x, me.y, ix * step, iy * step);
      me.setPosition(p.x, p.y);
    }

    this.sendTimer -= dt;
    if (this.sendTimer <= 0 && (me.x !== this.sentX || me.y !== this.sentY)) {
      this.sendTimer = TICK_MS;
      this.sentX = me.x;
      this.sentY = me.y;
      this.room.send("move", { x: me.x, y: me.y });
    }
  }

  private drawFog(me: Chog) {
    const cam = this.cameras.main;
    const z = cam.zoom;
    const view = cam.worldView;
    const ex = me.x;
    const ey = me.y - 30;
    const pts = visibilityPolygon(this.sight, ex, ey, this.vision, 240, WALL_H + 14);
    const g = this.fogShape;
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo((pts[0] - view.x) * z, (pts[1] - view.y) * z);
    for (let i = 2; i < pts.length; i += 2) g.lineTo((pts[i] - view.x) * z, (pts[i + 1] - view.y) * z);
    g.closePath();
    g.fillPath();

    const sx = (ex - view.x) * z;
    const sy = (ey - view.y) * z;
    const size = this.vision * 2 * z;
    this.fog.clear();
    this.fog.fill(0x05030b, 1);
    this.fog.erase(g);
    this.vignette.setDisplaySize(size, size);
    this.fog.draw(this.vignette, sx, sy);
  }
}
