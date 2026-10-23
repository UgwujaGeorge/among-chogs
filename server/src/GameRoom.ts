import { Room, ServerError, matchMaker, type Client } from "@colyseus/core";
import {
  LIQ_CONSOLE,
  PANELS,
  VENTS,
  buildFloorGrid,
  buildGrid,
  inLiquidity,
  nearTable,
  CELL,
  MEETING_TABLE,
  spotPos,
  ventExit,
  type Grid,
  type Spot,
} from "../../web/src/shared/map";
import { PLAYER_SPEED, move } from "../../web/src/shared/physics";
import { findPath, randomFloorPoint } from "../../web/src/shared/path";
import { SUITS } from "../../web/src/shared/suits";
import { VISION_RADIUS, canSee } from "../../web/src/shared/vision";
import {
  PULL_MS,
  STATIONS,
  STATION_BY_ID,
  STATION_RANGE,
  stationFront,
  stationSpot,
  type PullKind,
} from "../../web/src/shared/stations";
import {
  ALARM_COOLDOWN,
  BLACKOUT_VISION,
  CODE_ALPHABET,
  CODE_LENGTH,
  LIMITS,
  LIQ_PULL_MS,
  BUTTON_COOLDOWN,
  BUTTON_RANGE,
  CHAT_MAX,
  RESULT_SECONDS,
  SKIP,
  MELTDOWN_PENALTY,
  MELTDOWN_SECONDS,
  SABOTAGE_COOLDOWN,
  SPOT_RANGE,
  VENT_COOLDOWN_MS,
  MAX_SEATS,
  MIN_PLAYERS,
  REVEAL_SECONDS,
  TICK_MS,
  clampSetting,
  lobbySpawn,
  maxRuggersFor,
  ringSpawn,
  type ClientMessages,
  type JoinOptions,
  type Lever,
  type Role,
  type Sabotage,
  type Winner,
  type ServerMessages,
  type Settings as SettingsData,
} from "../../web/src/shared/protocol";
import { GameState, Player, Station } from "./schema";
import { canPay, newMatchId, ownsChog, refund, settle, stakedBy, verifyLogin } from "./chain";
import type { Address } from "viem";

const TOTAL_CHOGS = 1969;
const walk = buildGrid();
/** Same map with the Liquidity Room door open: what Ruggers walk on once it's unlocked. */
const walkOpen = buildGrid(true);
const sight = buildFloorGrid();
const PANEL = new Map(PANELS.map((p) => [p.id, p]));

type Goal = { kind: "station"; id: string; lever: Lever } | { kind: "panel"; id: string } | { kind: "liq" } | { kind: "button" };
type Bot = { path: { x: number; y: number }[]; wait: number; goal: Goal | null };
type Pull = { by: string; lever: Lever; kind: PullKind; start: number; dur: number };
type TaskList = { ids: string[]; done: Set<string> };

export class GameRoom extends Room<{ state: GameState }> {
  state = new GameState();
  /** Testnet room: wallet login, owned Chogs only, no AI, real stakes. See LiveRoom. */
  protected live = false;
  /** Testnet: each player's verified wallet. */
  private wallets = new Map<string, Address>();
  maxClients = MAX_SEATS;
  maxMessagesPerSecond = 60;

  private roles = new Map<string, Role>();
  private bots = new Map<string, Bot>();
  private budget = new Map<string, { at: number; px: number }>();
  private botSeq = 0;
  private tasks = new Map<string, TaskList>();
  private pulls = new Map<string, Pull>();
  private totalTasks = 0;
  private doneTasks = 0;
  private liqStart = 0;
  private ventAt = new Map<string, number>();
  private alarmAt = 0;
  private secondAcc = 0;
  private votes = new Map<string, string>();
  private botVoteAt = new Map<string, number>();
  private chatAt = new Map<string, number>();
  private buttonReadyAt = 0;
  /** What each bot has seen: suspicion score per player. */
  private sus = new Map<string, Map<string, number>>();
  /** Accusations made in this meeting's chat by bots: target -> how strong (2 = "I saw", 1 = "is sus"). */
  private claims = new Map<string, number>();

  async onCreate(options: JoinOptions) {
    this.roomId = await this.freeCode();
    this.state.code = this.roomId;
    this.state.live = this.live;
    if (this.live) this.state.matchId = newMatchId(this.roomId);
    if (options.private) await this.setPrivate(true);
    for (const st of STATIONS) this.state.stations.set(st.id, new Station({ id: st.id, by: "", lever: "", progress: 0 }));
    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);

    this.onMessage("move", (client, m: ClientMessages["move"]) => this.onMove(client, m));
    this.onMessage("suit", (client, suit: ClientMessages["suit"]) => this.pickSuit(client.sessionId, suit));
    this.onMessage("settings", (client, s: ClientMessages["settings"]) => this.host(client) && this.applySettings(s));
    this.onMessage("addBot", (client) => this.host(client) && this.addBot());
    this.onMessage("removeBot", (client) => this.host(client) && this.removeBot());
    this.onMessage("start", (client) => this.host(client) && this.start(client));
    this.onMessage("lobby", (client) => this.host(client) && this.backToLobby());
    this.onMessage("pull", (client, m: ClientMessages["pull"]) => this.startPull(client.sessionId, m?.station, m?.lever));
    this.onMessage("cancel", (client) => {
      this.cancelPullsBy(client.sessionId);
      if (this.state.liqBy === client.sessionId) this.stopLiq();
    });
    this.onMessage("vent", (client, m: ClientMessages["vent"]) => this.vent(client.sessionId, m?.id));
    this.onMessage("sabotage", (client, kind: ClientMessages["sabotage"]) => this.sabotage(client.sessionId, kind));
    this.onMessage("panel", (client, m: ClientMessages["panel"]) => this.pressPanel(client.sessionId, m?.id));
    this.onMessage("liq", (client) => this.startLiq(client.sessionId));
    this.onMessage("emergency", (client) => this.emergency(client.sessionId));
    this.onMessage("chat", (client, text: ClientMessages["chat"]) => this.chat(client.sessionId, text));
    this.onMessage("vote", (client, target: ClientMessages["vote"]) => this.vote(client.sessionId, target));
    this.onMessage("paid", (client) => this.checkStake(client.sessionId));
  }

  /** A short, readable room code that's not in use. Doubles as the Colyseus roomId. */
  private async freeCode() {
    for (;;) {
      let code = "";
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!(await matchMaker.query({ roomId: code })).length) return code;
    }
  }

  async onAuth(_client: Client, options: JoinOptions) {
    if (this.state.phase !== "lobby") throw new ServerError(403, "That game already started");
    if (this.state.players.size >= this.state.settings.maxPlayers) throw new ServerError(403, "That room is full");
    const id = Number(options?.chogId);
    if (!Number.isInteger(id) || id < 1 || id > TOTAL_CHOGS) throw new ServerError(400, "Pick a Chog first");
    if (!this.live) return true;
    // Testnet: prove the wallet, then prove it owns this Chog right now.
    const wallet = await verifyLogin(options.wallet, options.issuedAt, options.signature);
    if (!wallet.startsWith("0x")) throw new ServerError(401, wallet);
    if ([...this.state.players.values()].some((p) => p.chogId === id)) throw new ServerError(403, "That Chog is already in this room");
    // SKIP_OWNERSHIP is for local end-to-end tests with throwaway wallets only. Never set it on a real deploy.
    if (process.env.SKIP_OWNERSHIP !== "1" && !(await ownsChog(wallet, id)))
      throw new ServerError(403, `Your wallet doesn't own Chog #${id}`);
    return { wallet };
  }

  onJoin(client: Client, options: JoinOptions, auth?: { wallet: Address } | true) {
    if (this.live && auth && auth !== true) this.wallets.set(client.sessionId, auth.wallet);
    const name = String(options.name ?? "").trim().slice(0, 16) || `Chog #${options.chogId}`;
    this.addPlayer(client.sessionId, name, Number(options.chogId), false, Number(options.suit));
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.syncSeats();
  }

  async onDrop(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    await this.allowReconnection(client, 20);
  }

  onReconnect(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = true;
    const role = this.roles.get(client.sessionId);
    if (role) this.sendRole(client, role);
    this.sendTasks(client.sessionId);
    if (role === "rugger") this.sendRug();
  }

  onLeave(client: Client) {
    const id = client.sessionId;
    const leaving = this.state.players.get(id);
    // Testnet: a Chog that staked and leaves before the match starts gets its stake back.
    if (this.live && leaving?.paid && this.state.phase === "lobby") this.refundStake(this.state.matchId, leaving.chogId);
    this.wallets.delete(id);
    this.cancelPullsBy(id);
    if (this.state.liqBy === id) this.stopLiq();
    if (this.state.coreA === id) this.state.coreA = "";
    if (this.state.coreB === id) this.state.coreB = "";
    // A dev who leaves takes their unfinished tasks off the Launch Meter, so it can still reach 100%.
    const list = this.tasks.get(id);
    if (list && this.roles.get(id) === "dev") {
      this.totalTasks -= list.ids.length - list.done.size;
      this.updateLaunch();
    }
    this.tasks.delete(id);
    this.state.players.delete(id);
    this.roles.delete(id);
    this.budget.delete(id);
    if (this.state.phase === "playing") this.checkEnd();
    if (this.state.hostId === client.sessionId) {
      const next = [...this.state.players.values()].find((p) => !p.bot);
      this.state.hostId = next?.id ?? "";
    }
    this.syncSeats();
  }

  // ---- seats ----

  private addPlayer(id: string, name: string, chogId: number, bot: boolean, wanted = -1) {
    const taken = new Set([...this.state.players.values()].map((p) => p.suit));
    const suit = SUITS[wanted] && !taken.has(wanted) ? wanted : SUITS.findIndex((_, i) => !taken.has(i));
    const spot = lobbySpawn(this.state.players.size);
    const p = new Player({ id, name, chogId, suit, x: spot.x, y: spot.y, bot, calls: 0 });
    this.state.players.set(id, p);
    return p;
  }

  private pickSuit(id: string, suit: number) {
    if (this.state.phase !== "lobby" || !Number.isInteger(suit) || suit < 0 || suit >= SUITS.length) return;
    const p = this.state.players.get(id);
    if (!p || [...this.state.players.values()].some((o) => o !== p && o.suit === suit)) return;
    p.suit = suit;
  }

  private addBot() {
    if (this.live) return;
    if (this.state.phase !== "lobby" || this.state.players.size >= this.state.settings.maxPlayers) return;
    const used = new Set([...this.state.players.values()].map((p) => p.chogId));
    let chogId = 0;
    do chogId = 1 + Math.floor(Math.random() * TOTAL_CHOGS);
    while (used.has(chogId));
    const id = `bot-${++this.botSeq}`;
    this.addPlayer(id, `Chog #${chogId}`, chogId, true);
    this.bots.set(id, { path: [], wait: 800 + Math.random() * 1500, goal: null });
    this.syncSeats();
  }

  private removeBot() {
    if (this.state.phase !== "lobby") return;
    const last = [...this.bots.keys()].pop();
    if (!last) return;
    this.bots.delete(last);
    this.state.players.delete(last);
    this.syncSeats();
  }

  /** Bots hold seats, so quick play must only see the seats humans can still take. */
  private syncSeats() {
    const room = this.state.settings.maxPlayers - this.bots.size;
    this.setMatchmaking({ maxClients: Math.max(this.clients.length, room) });
  }

  private host(client: Client) {
    return client.sessionId === this.state.hostId;
  }

  private applySettings(s: Partial<SettingsData>) {
    if (this.state.phase !== "lobby" || !s) return;
    const cur = this.state.settings;
    for (const key of Object.keys(LIMITS) as (keyof SettingsData)[]) {
      if (typeof s[key] === "number") cur[key] = clampSetting(key, s[key]);
    }
    // Can't shrink the room below who's already in it.
    cur.maxPlayers = Math.max(cur.maxPlayers, this.state.players.size);
    this.syncSeats();
  }

  // ---- match flow ----

  private start(client: Client) {
    const n = this.state.players.size;
    if (this.state.phase !== "lobby") return;
    if (n < MIN_PLAYERS) {
      const how = this.live ? "Invite friends with the room code." : "Add AI Chogs or invite friends.";
      client.send("toast", `Need ${MIN_PLAYERS} Chogs to launch. ${how}` satisfies ServerMessages["toast"]);
      return;
    }
    if (this.live && [...this.state.players.values()].some((p) => !p.paid)) {
      client.send("toast", "Everyone has to stake before launch." satisfies ServerMessages["toast"]);
      return;
    }
    this.lock();
    this.resetMatch();
    this.dealRoles();
    this.dealTasks();

    // Everyone gathers round the conference table.
    const ids = [...this.state.players.keys()].sort(() => Math.random() - 0.5);
    ids.forEach((id, i) => {
      const p = this.state.players.get(id)!;
      const s = ringSpawn(walk, i, ids.length);
      p.x = s.x;
      p.y = s.y;
      p.alive = true;
      const b = this.bots.get(id);
      if (b) {
        b.path = [];
        b.goal = null;
        b.wait = 1000 + Math.random() * 2000;
      }
    });
    this.snapAll();

    this.state.phase = "reveal";
    this.state.countdown = REVEAL_SECONDS;
    const timer = this.clock.setInterval(() => {
      this.state.countdown = Math.max(0, this.state.countdown - 1);
    }, 1000);
    this.clock.setTimeout(() => {
      timer.clear();
      if (this.state.phase === "reveal") this.state.phase = "playing";
    }, REVEAL_SECONDS * 1000);
  }

  /** Picks the Ruggers in secret. Each human only learns their own role (and fellow Ruggers if they rug). */
  private dealRoles() {
    const ids = [...this.state.players.keys()];
    const count = Math.min(this.state.settings.ruggers, maxRuggersFor(ids.length));
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const ruggers = new Set(shuffled.slice(0, count));
    this.roles.clear();
    for (const id of ids) this.roles.set(id, ruggers.has(id) ? "rugger" : "dev");
    for (const c of this.clients) this.sendRole(c, this.roles.get(c.sessionId)!);
  }

  private sendRole(client: Client, role: Role) {
    const ruggers = role === "rugger" ? [...this.roles].filter(([, r]) => r === "rugger").map(([id]) => id) : [];
    client.send("role", { role, ruggers } satisfies ServerMessages["role"]);
  }

  private backToLobby() {
    // Testnet: every match has its own pot, so everyone stakes again.
    if (this.live) {
      this.state.matchId = newMatchId(this.roomId);
      this.state.players.forEach((p) => (p.paid = false));
    }
    this.state.phase = "lobby";
    this.state.countdown = 0;
    this.resetMatch();
    this.roles.clear();
    for (const b of this.bots.values()) {
      b.path = [];
      b.goal = null;
    }
    [...this.state.players.values()].forEach((p, i) => {
      const s = lobbySpawn(i);
      p.x = s.x;
      p.y = s.y;
      p.alive = true;
    });
    this.snapAll();
    this.unlock();
  }

  private snapAll() {
    for (const c of this.clients) {
      const p = this.state.players.get(c.sessionId);
      if (p) c.send("snap", { x: p.x, y: p.y } satisfies ServerMessages["snap"]);
    }
  }

  // ---- tasks, levers, meters ----

  private resetMatch() {
    this.pulls.clear();
    this.tasks.clear();
    this.totalTasks = 0;
    this.doneTasks = 0;
    this.state.launch = 0;
    this.state.winner = "";
    this.state.endWhy = "";
    this.state.liqUnlocked = false;
    this.state.liqBy = "";
    this.state.liqProgress = 0;
    this.state.sabotage = "";
    this.state.sabTime = 0;
    this.state.sabReady = 10;
    this.state.coreA = "";
    this.state.coreB = "";
    this.state.timeLeft = this.state.settings.timeLimit * 60;
    this.state.meetingBy = "";
    this.state.meetingWhy = "";
    this.ventAt.clear();
    this.alarmAt = 0;
    this.state.meetingStage = "";
    this.votes.clear();
    this.sus.clear();
    this.buttonReadyAt = Date.now() + BUTTON_COOLDOWN * 1000;
    this.state.players.forEach((p) => {
      p.alive = true;
      p.voted = false;
      p.calls = this.state.settings.meetings;
    });
    this.state.stations.forEach((st) => {
      st.by = "";
      st.lever = "";
      st.progress = 0;
      st.tampered = false;
    });
  }

  /** Every player gets a random set of stations. Ruggers get a list too, so their HUD looks the same. */
  private dealTasks() {
    const n = Math.min(this.state.settings.tasks, STATIONS.length);
    for (const id of this.state.players.keys()) {
      const ids = STATIONS.map((st) => st.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, n);
      this.tasks.set(id, { ids, done: new Set() });
      if (this.roles.get(id) === "dev") this.totalTasks += n;
      this.sendTasks(id);
    }
    this.sendRug();
  }

  private client(id: string) {
    return this.clients.find((c) => c.sessionId === id);
  }

  private sendTasks(id: string) {
    const list = this.tasks.get(id);
    const c = this.client(id);
    if (!list || !c) return;
    c.send("tasks", { ids: list.ids, done: [...list.done], fake: this.roles.get(id) === "rugger" } satisfies ServerMessages["tasks"]);
  }

  private tampered() {
    let n = 0;
    this.state.stations.forEach((st) => (n += st.tampered ? 1 : 0));
    return n;
  }

  private rugNeeded() {
    return Math.min(this.state.settings.rugLevers, STATIONS.length);
  }

  /** Only Ruggers see the Rug Meter. Devs only see tampered consoles they walk past. */
  private sendRug() {
    const msg = { tampered: this.tampered(), needed: this.rugNeeded() } satisfies ServerMessages["rug"];
    for (const [id, role] of this.roles) if (role === "rugger") this.client(id)?.send("rug", msg);
  }

  private updateLaunch() {
    this.state.launch = this.totalTasks > 0 ? Math.min(100, Math.floor((this.doneTasks / this.totalTasks) * 100)) : 0;
  }

  private toast(id: string, text: string) {
    this.client(id)?.send("toast", text satisfies ServerMessages["toast"]);
  }

  /** Works out what a lever pull means for this player at this station, or why it's not allowed. */
  private pullKind(id: string, stationId: string, lever: Lever): PullKind | string {
    const st = this.state.stations.get(stationId)!;
    const role = this.roles.get(id);
    const list = this.tasks.get(id);
    if (lever === "red") {
      if (role !== "rugger") return "Only a Rugger would pull that.";
      return st.tampered ? "Already tampered." : "rug";
    }
    if (role === "rugger") return "fake";
    if (st.tampered) return "fix";
    if (!list?.ids.includes(stationId)) return "Not one of your tasks.";
    if (list.done.has(stationId)) return "You already did this one.";
    return "task";
  }

  private startPull(id: string, stationId: unknown, lever: unknown) {
    if (this.state.phase !== "playing" || typeof stationId !== "string" || (lever !== "green" && lever !== "red")) return;
    const def = STATION_BY_ID.get(stationId);
    const st = this.state.stations.get(stationId);
    const p = this.state.players.get(id);
    if (!def || !st || !p || !p.alive) return;
    const f = stationFront(def);
    if (Math.hypot(p.x - f.x, p.y - f.y) > STATION_RANGE + 12) return;
    if (st.by && st.by !== id) return this.toast(id, "Someone is using this station.");

    const kind = this.pullKind(id, stationId, lever);
    if (!(kind in PULL_MS)) return this.toast(id, kind);
    this.cancelPullsBy(id);
    this.pulls.set(stationId, { by: id, lever, kind: kind as PullKind, start: Date.now(), dur: PULL_MS[kind as PullKind] });
    st.by = id;
    st.lever = lever;
    st.progress = 0;
  }

  private cancelPullsBy(id: string) {
    for (const [sid, pull] of this.pulls) if (pull.by === id) this.endPull(sid);
  }

  private endPull(stationId: string) {
    this.pulls.delete(stationId);
    const st = this.state.stations.get(stationId);
    if (!st) return;
    st.by = "";
    st.lever = "";
    st.progress = 0;
  }

  /** Advances lever pulls. Walking away from the console cancels. */
  private tickPulls() {
    const now = Date.now();
    for (const [sid, pull] of this.pulls) {
      const p = this.state.players.get(pull.by);
      const f = stationFront(STATION_BY_ID.get(sid)!);
      if (!p || Math.hypot(p.x - f.x, p.y - f.y) > STATION_RANGE + 24) {
        this.endPull(sid);
        continue;
      }
      if (pull.lever === "red") this.witness(p, 1);
      const t = (now - pull.start) / pull.dur;
      this.state.stations.get(sid)!.progress = Math.min(100, Math.floor(t * 100));
      if (t >= 1) {
        this.endPull(sid);
        this.completePull(sid, pull);
      }
    }
  }

  private completePull(stationId: string, pull: Pull) {
    const st = this.state.stations.get(stationId)!;
    const list = this.tasks.get(pull.by);
    switch (pull.kind) {
      case "task":
        if (list && !list.done.has(stationId)) {
          list.done.add(stationId);
          this.doneTasks++;
          this.updateLaunch();
        }
        break;
      case "fake":
        // Ticks the Rugger's fake list so their HUD keeps looking like a dev's.
        if (list?.ids.includes(stationId)) list.done.add(stationId);
        break;
      case "fix":
        st.tampered = false;
        this.rugChanged();
        break;
      case "rug":
        st.tampered = true;
        this.rugChanged();
        break;
    }
    this.sendTasks(pull.by);
    this.checkEnd();
  }

  /** Launch, or one side gone. (Liquidity pull and the deadline end the match elsewhere.) */
  private checkEnd() {
    if (this.state.phase !== "playing") return;
    let devs = 0;
    let ruggers = 0;
    this.state.players.forEach((p) => {
      if (!p.alive) return;
      if (this.roles.get(p.id) === "rugger") ruggers++;
      else devs++;
    });
    if (this.totalTasks > 0 && this.doneTasks >= this.totalTasks) this.end("devs", "Every task done. The coin launched.");
    else if (ruggers === 0) this.end("devs", "No Ruggers left in the office.");
    else if (ruggers >= devs) this.end("ruggers", "The Ruggers took over the office.");
  }

  private end(winner: Winner, why: string) {
    for (const sid of [...this.pulls.keys()]) this.endPull(sid);
    this.stopLiq();
    this.state.sabotage = "";
    this.state.endWhy = why;
    this.state.winner = winner;
    this.state.phase = "ended";
    const ruggers = [...this.roles].filter(([, r]) => r === "rugger").map(([id]) => id);
    this.broadcast("reveal", { ruggers } satisfies ServerMessages["reveal"]);
    if (this.live) void this.payWinners(winner);
  }

  // ---- Liquidity Room, vents, sabotage, deadline ----

  private alert(text: string, tone: ServerMessages["alert"]["tone"]) {
    this.broadcast("alert", { text, tone } satisfies ServerMessages["alert"]);
  }

  private isRugger(id: string) {
    return this.roles.get(id) === "rugger";
  }

  private near(p: Player, spot: Spot, range = SPOT_RANGE) {
    const f = spotPos(spot);
    return Math.hypot(p.x - f.x, p.y - f.y) <= range;
  }

  /** The walk grid for this player: Ruggers get through the door once it's unlocked (and can always get out). */
  private gridFor(p: Player): Grid {
    return this.isRugger(p.id) && (this.state.liqUnlocked || inLiquidity(p.x, p.y)) ? walkOpen : walk;
  }

  /** Tampered count changed: update the Ruggers' meter and lock or unlock the Liquidity Room. */
  private rugChanged() {
    this.sendRug();
    const open = this.tampered() >= this.rugNeeded();
    if (open === this.state.liqUnlocked) return;
    this.state.liqUnlocked = open;
    if (open) this.alert("The Liquidity Room is UNLOCKED. Guard the door!", "danger");
    else {
      this.stopLiq();
      this.alert("Stations fixed. The Liquidity Room is sealed again.", "good");
    }
  }

  private startLiq(id: string) {
    const p = this.state.players.get(id);
    if (this.state.phase !== "playing" || !p?.alive || !this.isRugger(id) || !this.state.liqUnlocked) return;
    if (this.state.liqBy || !this.near(p, LIQ_CONSOLE)) return;
    this.cancelPullsBy(id);
    this.state.liqBy = id;
    this.state.liqProgress = 0;
    this.liqStart = Date.now();
  }

  private stopLiq() {
    this.state.liqBy = "";
    this.state.liqProgress = 0;
  }

  private tickLiq() {
    const id = this.state.liqBy;
    if (!id) return;
    const p = this.state.players.get(id);
    if (!p || !this.near(p, LIQ_CONSOLE, SPOT_RANGE + 20)) return this.stopLiq();
    this.witness(p, 2);
    const t = (Date.now() - this.liqStart) / LIQ_PULL_MS;
    this.state.liqProgress = Math.min(100, Math.floor(t * 100));
    if (t >= 1) this.end("ruggers", "The Ruggers pulled the liquidity.");
  }

  private vent(id: string, ventId: unknown) {
    const p = this.state.players.get(id);
    const v = VENTS.find((x) => x.id === ventId);
    if (this.state.phase !== "playing" || !p?.alive || !v || !this.isRugger(id) || !this.near(p, v)) return;
    const now = Date.now();
    if (now - (this.ventAt.get(id) ?? 0) < VENT_COOLDOWN_MS) return;
    const exit = ventExit(v.id);
    if (!exit) return;
    this.ventAt.set(id, now);
    this.cancelPullsBy(id);
    this.witness(p, 40);
    const from = { x: p.x, y: p.y };
    const to = spotPos(exit);
    p.x = to.x;
    p.y = to.y;
    this.budget.delete(id);
    this.client(id)?.send("snap", to satisfies ServerMessages["snap"]);
    this.broadcast("vent", { from, to } satisfies ServerMessages["vent"]);
  }

  private sabotage(id: string, kind: Sabotage) {
    if (this.state.phase !== "playing" || !this.isRugger(id) || !this.state.players.get(id)?.alive) return;
    if (kind !== "blackout" && kind !== "meltdown") return;
    if (this.state.sabotage) return this.toast(id, "A sabotage is already running.");
    if (this.state.sabReady > 0) return this.toast(id, `Sabotage ready in ${this.state.sabReady}s.`);
    this.state.sabotage = kind;
    if (kind === "blackout") this.alert("Blackout! Flip the breaker in the Break Room.", "danger");
    else {
      this.state.sabTime = MELTDOWN_SECONDS;
      this.state.coreA = "";
      this.state.coreB = "";
      this.alert("Server meltdown! Two devs must hold Core A (Server Room) and Core B (Trading Desk).", "danger");
    }
  }

  private endSabotage(fixed: boolean) {
    const kind = this.state.sabotage;
    this.state.sabotage = "";
    this.state.sabTime = 0;
    this.state.coreA = "";
    this.state.coreB = "";
    this.state.sabReady = SABOTAGE_COOLDOWN;
    if (fixed) this.alert(kind === "blackout" ? "Lights are back on." : "Meltdown stopped.", "good");
  }

  private pressPanel(id: string, panelId: unknown) {
    const p = this.state.players.get(id);
    const panel = typeof panelId === "string" ? PANEL.get(panelId) : undefined;
    if (this.state.phase !== "playing" || !p?.alive || !panel || !this.near(p, panel)) return;
    if (panel.id === "breaker") {
      if (this.state.sabotage === "blackout") this.endSabotage(true);
    } else if (panel.id === "coreA" || panel.id === "coreB") {
      if (this.state.sabotage !== "meltdown") return;
      this.state[panel.id] = id;
      if (this.state.coreA && this.state.coreB) this.endSabotage(true);
    } else if (panel.id === "alarm") {
      if (!this.state.liqUnlocked) return this.toast(id, "The Liquidity Room is sealed. Nothing to report.");
      const wait = ALARM_COOLDOWN - Math.floor((Date.now() - this.alarmAt) / 1000);
      if (wait > 0) return this.toast(id, `Alarm recharging: ${wait}s.`);
      this.alarmAt = Date.now();
      this.startMeeting(id, "alarm");
    }
  }

  /** Once a second while playing: deadline, sabotage cooldown, meltdown countdown. */
  private everySecond() {
    const s = this.state;
    if (s.sabReady > 0) s.sabReady--;
    if (s.sabotage === "meltdown") {
      // Holding a core only counts while you stand at it.
      for (const key of ["coreA", "coreB"] as const) {
        const h = s[key] ? s.players.get(s[key]) : undefined;
        if (s[key] && (!h || !this.near(h, PANEL.get(key)!, SPOT_RANGE + 20))) s[key] = "";
      }
      if (--s.sabTime <= 0) {
        const clean = STATIONS.filter((st) => !s.stations.get(st.id)!.tampered).sort(() => Math.random() - 0.5);
        clean.slice(0, MELTDOWN_PENALTY).forEach((st) => (s.stations.get(st.id)!.tampered = true));
        this.endSabotage(false);
        this.alert(`Meltdown! ${MELTDOWN_PENALTY} stations got tampered.`, "danger");
        this.rugChanged();
      }
    }
    if (s.timeLeft > 0 && --s.timeLeft === 0) this.end("ruggers", "The launch deadline passed.");
  }

  // ---- meetings ----

  private emergency(id: string) {
    const p = this.state.players.get(id);
    if (this.state.phase !== "playing" || !p?.alive || !nearTable(p.x, p.y, BUTTON_RANGE)) return;
    if (p.calls <= 0) return this.toast(id, "You've used all your emergency meetings.");
    if (this.state.sabotage === "meltdown") return this.toast(id, "Can't call a meeting during a meltdown.");
    const wait = Math.ceil((this.buttonReadyAt - Date.now()) / 1000);
    if (wait > 0) return this.toast(id, `Emergency button ready in ${wait}s.`);
    p.calls--;
    this.startMeeting(id, "button");
  }

  /** Stops everything and pulls everyone to the conference table: discussion, then voting, then the verdict. */
  private startMeeting(by: string, why: string) {
    if (this.state.phase !== "playing") return;
    for (const sid of [...this.pulls.keys()]) this.endPull(sid);
    this.stopLiq();
    if (this.state.sabotage) this.endSabotage(false);
    this.state.meetingBy = by;
    this.state.meetingWhy = why;
    this.state.phase = "meeting";
    this.votes.clear();
    this.botVoteAt.clear();
    this.claims.clear();
    this.state.players.forEach((p) => (p.voted = false));
    const ids = [...this.state.players.keys()];
    ids.forEach((pid, i) => {
      const p = this.state.players.get(pid)!;
      const sp = ringSpawn(walk, i, ids.length);
      p.x = sp.x;
      p.y = sp.y;
      const b = this.bots.get(pid);
      if (b) {
        b.path = [];
        b.goal = null;
        b.wait = 1500;
      }
    });
    this.snapAll();
    this.secondAcc = 0;
    this.setStage(this.state.settings.discussTime > 0 ? "discuss" : "vote");
    this.clock.setTimeout(() => this.botsTalk(), 1500);
  }

  private setStage(stage: "discuss" | "vote" | "result") {
    const s = this.state;
    s.meetingStage = stage;
    if (stage === "discuss") s.countdown = s.settings.discussTime;
    if (stage === "vote") {
      s.countdown = s.settings.voteTime;
      // Bots vote at a random moment in the first two thirds of the window.
      for (const id of this.bots.keys()) {
        if (s.players.get(id)?.alive) this.botVoteAt.set(id, 2 + Math.floor(Math.random() * Math.max(1, (s.settings.voteTime * 2) / 3)));
      }
    }
    if (stage === "result") {
      s.countdown = RESULT_SECONDS;
      this.verdict();
    }
  }

  /** Once a second during a meeting. */
  private meetingSecond() {
    const s = this.state;
    if (s.meetingStage === "vote") {
      const elapsed = s.settings.voteTime - s.countdown;
      for (const [id, at] of this.botVoteAt) {
        if (elapsed >= at) {
          this.botVoteAt.delete(id);
          this.vote(id, this.botVoteFor(id));
        }
      }
    }
    if (s.countdown > 0) s.countdown--;
    if (s.countdown > 0) return;
    if (s.meetingStage === "discuss") this.setStage("vote");
    else if (s.meetingStage === "vote") this.setStage("result");
    else this.endMeeting();
  }

  private chat(id: string, raw: unknown) {
    const p = this.state.players.get(id);
    if (this.state.phase !== "meeting" || !p?.alive || typeof raw !== "string") return;
    const text = raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
    const now = Date.now();
    if (!text || now - (this.chatAt.get(id) ?? 0) < 800) return;
    this.chatAt.set(id, now);
    this.broadcast("chat", { from: id, text } satisfies ServerMessages["chat"]);
  }

  private vote(id: string, target: unknown) {
    const s = this.state;
    const p = s.players.get(id);
    if (s.phase !== "meeting" || s.meetingStage !== "vote" || !p?.alive || p.voted) return;
    if (typeof target !== "string" || (target !== SKIP && !s.players.get(target)?.alive)) return;
    this.votes.set(id, target);
    p.voted = true;
    // Everyone's in: jump to the result.
    let waiting = 0;
    s.players.forEach((o) => (waiting += o.alive && !o.voted ? 1 : 0));
    if (!waiting) s.countdown = 0;
  }

  /** Counts votes. Most votes is fired; a tie, or skip on top, fires nobody. */
  private verdict() {
    const count = new Map<string, number>();
    for (const t of this.votes.values()) count.set(t, (count.get(t) ?? 0) + 1);
    let top = "";
    let best = 0;
    let tie = false;
    for (const [t, n] of count) {
      if (n > best) {
        top = t;
        best = n;
        tie = false;
      } else if (n === best) tie = true;
    }
    const fired = !tie && top && top !== SKIP ? top : "";
    const wasRugger = !!fired && this.isRugger(fired);
    if (fired) this.fire(fired);
    let ruggersLeft = 0;
    this.state.players.forEach((p) => (ruggersLeft += p.alive && this.isRugger(p.id) ? 1 : 0));
    this.broadcast("verdict", { votes: Object.fromEntries(this.votes), fired, wasRugger, ruggersLeft } satisfies ServerMessages["verdict"]);
  }

  /** Fired players are out: no tasks, no votes, invisible to everyone still playing. */
  private fire(id: string) {
    const p = this.state.players.get(id);
    if (!p) return;
    p.alive = false;
    this.cancelPullsBy(id);
    const list = this.tasks.get(id);
    if (list && !this.isRugger(id)) {
      this.totalTasks -= list.ids.length - list.done.size;
      this.updateLaunch();
    }
  }

  private endMeeting() {
    const s = this.state;
    s.meetingStage = "";
    s.meetingBy = "";
    s.meetingWhy = "";
    s.countdown = 0;
    s.players.forEach((p) => (p.voted = false));
    this.buttonReadyAt = Date.now() + BUTTON_COOLDOWN * 1000;
    s.phase = "playing";
    this.checkEnd();
  }

  // ---- bots in meetings ----

  /** Dev bots remember what they see: someone at a red lever, venting, or in the Liquidity Room. */
  private witness(culprit: Player, weight: number) {
    const radius = this.state.sabotage === "blackout" ? VISION_RADIUS * BLACKOUT_VISION : VISION_RADIUS;
    for (const id of this.bots.keys()) {
      const b = this.state.players.get(id);
      if (!b?.alive || b === culprit || this.isRugger(id)) continue;
      if (!canSee(sight, b.x, b.y, culprit.x, culprit.y - 30, radius)) continue;
      const seen = this.sus.get(id) ?? new Map<string, number>();
      seen.set(culprit.id, (seen.get(culprit.id) ?? 0) + weight);
      this.sus.set(id, seen);
    }
  }

  private topSuspect(botId: string) {
    let best = "";
    let n = 0;
    for (const [t, v] of this.sus.get(botId) ?? []) {
      if (v > n && this.state.players.get(t)?.alive) {
        best = t;
        n = v;
      }
    }
    return best;
  }

  private botsTalk() {
    if (this.state.phase !== "meeting") return;
    const alive = [...this.state.players.values()].filter((p) => p.alive);
    const nameOf = (id: string) => this.state.players.get(id)?.name ?? "someone";
    let delay = 0;
    for (const id of this.bots.keys()) {
      if (!this.state.players.get(id)?.alive) continue;
      let line = "";
      let claim: [string, number] | null = null;
      if (!this.isRugger(id)) {
        const sus = this.topSuspect(id);
        if (sus) {
          line = Math.random() < 0.5 ? `I saw ${nameOf(sus)} at a red lever!` : `${nameOf(sus)} is the Rugger. Vote them.`;
          claim = [sus, 2];
        }
        else if (Math.random() < 0.35) line = ["Where?", "I was doing tasks", "Who called this?", "Skip, no proof"][Math.floor(Math.random() * 4)];
      } else if (Math.random() < 0.5) {
        const devs = alive.filter((p) => !this.isRugger(p.id) && p.id !== id);
        const pick = devs[Math.floor(Math.random() * devs.length)];
        if (pick && Math.random() < 0.6) {
          line = `${pick.name} is sus`;
          claim = [pick.id, 1];
        } else line = "I was doing tasks";
      }
      if (!line) continue;
      delay += 700 + Math.random() * 1600;
      this.clock.setTimeout(() => {
        this.chatAt.delete(id);
        this.chat(id, line);
        if (claim) this.claims.set(claim[0], (this.claims.get(claim[0]) ?? 0) + claim[1]);
      }, delay);
    }
  }

  private botVoteFor(id: string): string {
    const alive = [...this.state.players.values()].filter((p) => p.alive && p.id !== id);
    if (!this.isRugger(id)) {
      const sus = this.topSuspect(id);
      if (sus) return sus;
      // No eyewitness of its own: sometimes trusts what others said in chat.
      let claimed = "";
      let w = 0;
      for (const [t, v] of this.claims) if (v > w && t !== id && this.state.players.get(t)?.alive) [claimed, w] = [t, v];
      if (claimed && Math.random() < (w >= 2 ? 0.65 : 0.3)) return claimed;
      return Math.random() < 0.75 || !alive.length ? SKIP : alive[Math.floor(Math.random() * alive.length)].id;
    }
    const devs = alive.filter((p) => !this.isRugger(p.id));
    return Math.random() < 0.5 || !devs.length ? SKIP : devs[Math.floor(Math.random() * devs.length)].id;
  }

  // ---- testnet stakes ----

  /** A player says they staked: read the pot contract to confirm. */
  private async checkStake(id: string) {
    const p = this.state.players.get(id);
    const wallet = this.wallets.get(id);
    if (!this.live || !p || !wallet || p.paid || this.state.phase !== "lobby") return;
    const matchId = this.state.matchId;
    try {
      const by = await stakedBy(matchId, p.chogId);
      if (by.toLowerCase() !== wallet.toLowerCase()) return this.toast(id, "Stake not found yet. Try again in a few seconds.");
      // Still the same match? (The host could have started a new one while we waited.)
      if (this.state.matchId === matchId) p.paid = true;
    } catch {
      this.toast(id, "Couldn't reach Monad testnet. Try again.");
    }
  }

  /** The winning side splits the pot. Fired players on the winning side still get their share. */
  private async payWinners(winner: Winner) {
    const matchId = this.state.matchId;
    const won = (id: string) => (winner === "ruggers") === this.isRugger(id);
    const ids = [...this.state.players.values()].filter((p) => p.paid && won(p.id)).map((p) => p.id);
    const wallets = ids.map((id) => this.wallets.get(id)).filter((w): w is Address => !!w);
    if (!wallets.length || !canPay()) {
      this.broadcast("payout", { error: canPay() ? "No staked winners to pay." : "Payouts are off on this server." } satisfies ServerMessages["payout"]);
      return;
    }
    try {
      const { txHash, each } = await settle(matchId, wallets);
      this.broadcast("payout", { txHash, each, winners: ids } satisfies ServerMessages["payout"]);
    } catch (e) {
      console.error("payout failed", matchId, e);
      this.broadcast("payout", { error: "The payout transaction failed. The team will settle it by hand." } satisfies ServerMessages["payout"]);
    }
  }

  private refundStake(matchId: string, chogId: number) {
    refund(matchId, chogId).catch((e) => console.error("refund failed", matchId, chogId, e));
  }

  onDispose() {
    // Room closed before a match started: give every stake back.
    if (this.live && this.state.phase === "lobby") {
      this.state.players.forEach((p) => p.paid && this.refundStake(this.state.matchId, p.chogId));
    }
  }

  // ---- movement ----

  /**
   * The client simulates its own movement and reports where it ended up. The server replays that move through
   * the same collision code, capped to what the speed allows, and sends a snap if the client cheated or drifted.
   */
  private onMove(client: Client, m: ClientMessages["move"]) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    if (this.state.phase === "reveal" || this.state.phase === "meeting") return;

    // Distance budget refills at a bit over top speed, so bunched-up packets from a laggy phone still pass.
    const now = Date.now();
    const rate = (PLAYER_SPEED * this.state.settings.speed * 1.2) / 1000;
    const last = this.budget.get(p.id) ?? { at: now, px: 0 };
    let budget = Math.min(rate * 400, last.px + rate * (now - last.at));

    let dx = m.x - p.x;
    let dy = m.y - p.y;
    const want = Math.hypot(dx, dy);
    if (want > budget) {
      dx *= budget / want;
      dy *= budget / want;
      budget = 0;
    } else budget -= want;
    this.budget.set(p.id, { at: now, px: budget });
    const r = move(this.gridFor(p), p.x, p.y, dx, dy);
    p.x = r.x;
    p.y = r.y;
    if (Math.hypot(r.x - m.x, r.y - m.y) > 8) client.send("snap", { x: r.x, y: r.y } satisfies ServerMessages["snap"]);
  }

  private tick(dt: number) {
    if (this.state.phase === "reveal") return;
    if (this.state.phase === "meeting") {
      this.secondAcc += dt;
      while (this.secondAcc >= 1000 && this.state.phase === "meeting") {
        this.secondAcc -= 1000;
        this.meetingSecond();
      }
      return;
    }
    if (this.state.phase === "playing") {
      this.tickPulls();
      this.tickLiq();
      this.secondAcc += dt;
      while (this.secondAcc >= 1000 && this.state.phase === "playing") {
        this.secondAcc -= 1000;
        this.everySecond();
      }
    }
    const step = (PLAYER_SPEED * this.state.settings.speed * 0.85 * dt) / 1000;
    for (const [id, b] of this.bots) {
      const p = this.state.players.get(id);
      if (p) this.stepBot(p, b, dt, step);
    }
  }

  /**
   * Simple bot brain so a solo player can test a full match.
   * Devs: tasks, fixing tampered stations, the breaker and meltdown cores, and the alarm if they see a Rugger at the
   * Liquidity Room. Ruggers: fake tasks, red levers when unseen, and the liquidity lever once the room unlocks.
   * Day 6 makes them smarter (and lets them vote).
   */
  private stepBot(p: Player, b: Bot, dt: number, step: number) {
    if (b.wait > 0) {
      b.wait -= dt;
      return;
    }
    const playing = this.state.phase === "playing";
    if (playing && !p.alive) return;
    if (playing && ([...this.pulls.values()].some((pl) => pl.by === p.id) || this.state.liqBy === p.id)) return;
    if (playing && (this.state.coreA === p.id || this.state.coreB === p.id)) return;

    // Dev bots react to a Rugger seen at the Liquidity Room right away.
    if (playing && !this.isRugger(p.id) && b.goal?.kind !== "panel" && this.seesRuggerAtLiquidity(p)) {
      b.goal = { kind: "panel", id: "alarm" };
      b.path = this.pathTo(p, this.standAt(PANEL.get("alarm")!));
    }

    if (!b.path.length) {
      if (playing && b.goal) {
        this.botAct(p, b.goal);
        b.goal = null;
        b.wait = 400;
        return;
      }
      let t: { x: number; y: number } | null = null;
      if (playing) {
        b.goal = this.botPick(p);
        t = b.goal ? this.goalSpot(b.goal) : randomFloorPoint(walk);
      } else if (this.state.phase === "lobby") {
        // In the lobby, mill around the Open Office.
        t = lobbySpawn(Math.floor(Math.random() * 15));
      }
      if (!t) return;
      b.path = this.pathTo(p, t);
      if (!b.path.length) {
        b.goal = null;
        b.wait = 500;
      }
      return;
    }
    const next = b.path[0];
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= step) {
      b.path.shift();
      if (!b.path.length && !b.goal) b.wait = this.state.phase === "lobby" ? 2000 + Math.random() * 4000 : 800 + Math.random() * 2000;
    }
    const s = Math.min(step, d) / (d || 1);
    const r = move(this.gridFor(p), p.x, p.y, dx * s, dy * s);
    p.x = r.x;
    p.y = r.y;
  }

  private pathTo(p: Player, t: { x: number; y: number }) {
    return findPath(this.gridFor(p), p.x, p.y, t.x, t.y) ?? [];
  }

  /** Where to stand to use a wall spot. */
  private standAt(spot: Spot) {
    const f = spotPos(spot);
    return { x: f.x, y: f.y + 24 };
  }

  private goalSpot(g: Goal) {
    if (g.kind === "station") return stationSpot(STATION_BY_ID.get(g.id)!);
    if (g.kind === "panel") return this.standAt(PANEL.get(g.id)!);
    if (g.kind === "button") return { x: MEETING_TABLE.x, y: MEETING_TABLE.y + 2.6 * CELL };
    return this.standAt(LIQ_CONSOLE);
  }

  private botAct(p: Player, g: Goal) {
    if (g.kind === "panel") return this.pressPanel(p.id, g.id);
    if (g.kind === "liq") return this.startLiq(p.id);
    if (g.kind === "button") return this.emergency(p.id);
    // Rugger bots chicken out of a red pull if anyone's watching.
    const lever = g.lever === "red" && this.watched(p) ? "green" : g.lever;
    this.startPull(p.id, g.id, lever);
  }

  private botPick(p: Player): Goal | null {
    const id = p.id;
    const s = this.state;
    const list = this.tasks.get(id);
    const free = (sid: string) => !s.stations.get(sid)!.by;
    const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

    if (this.isRugger(id)) {
      if (s.liqUnlocked && !s.liqBy && Math.random() < 0.6) return { kind: "liq" };
      // Sabotage for cover: a blackout makes red pulls easy, a meltdown drags devs away.
      if (!s.sabotage && s.sabReady === 0 && Math.random() < 0.5) this.sabotage(id, Math.random() < 0.6 ? "blackout" : "meltdown");
      const clean = STATIONS.filter((st) => !s.stations.get(st.id)!.tampered && free(st.id));
      if (clean.length && Math.random() < 0.45) return { kind: "station", id: pick(clean).id, lever: "red" };
      const fake = (list?.ids ?? []).filter(free);
      return fake.length ? { kind: "station", id: pick(fake), lever: "green" } : null;
    }

    // Saw something? Go hit the emergency button.
    if (p.calls > 0 && s.sabotage !== "meltdown" && Date.now() > this.buttonReadyAt && (this.sus.get(id)?.get(this.topSuspect(id)) ?? 0) >= 30)
      return { kind: "button" };
    // Sabotage first: send the closest devs.
    if (s.sabotage === "blackout" && Math.random() < 0.5) return { kind: "panel", id: "breaker" };
    if (s.sabotage === "meltdown") {
      const open = (["coreA", "coreB"] as const).filter((k) => !s[k]);
      if (open.length && Math.random() < 0.6) return { kind: "panel", id: pick(open) };
    }
    const todo = (list?.ids ?? []).filter((sid) => !list!.done.has(sid) && free(sid));
    const broken = STATIONS.filter((st) => s.stations.get(st.id)!.tampered && free(st.id));
    if (broken.length && (Math.random() < 0.35 || !todo.length)) return { kind: "station", id: broken[0].id, lever: "green" };
    return todo.length ? { kind: "station", id: pick(todo), lever: "green" } : null;
  }

  /** A dev who can see someone inside the Liquidity Room knows they're a Rugger. */
  private seesRuggerAtLiquidity(p: Player) {
    if (!this.state.liqUnlocked) return false;
    let seen = false;
    this.state.players.forEach((o) => {
      if (seen || o === p || !inLiquidity(o.x, o.y)) return;
      if (canSee(sight, p.x, p.y, o.x, o.y - 30)) seen = true;
    });
    return seen;
  }

  /** True if any non-Rugger can see this player right now (devs see less in a blackout). */
  private watched(p: Player) {
    const radius = this.state.sabotage === "blackout" ? VISION_RADIUS * BLACKOUT_VISION : VISION_RADIUS;
    let seen = false;
    this.state.players.forEach((o) => {
      if (seen || o === p || !o.alive || this.isRugger(o.id)) return;
      if (canSee(sight, o.x, o.y, p.x, p.y - 30, radius)) seen = true;
    });
    return seen;
  }
}

/** Testnet rooms: same game, real stakes. */
export class LiveRoom extends GameRoom {
  protected live = true;
}
