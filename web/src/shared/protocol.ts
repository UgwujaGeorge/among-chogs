// Wire contract between the web client and the Colyseus game server.
// The server imports this file directly, so keep it free of browser-only code.

import { CELL, MEETING_TABLE, SPAWN, type Grid } from "./map";
import { circleFree } from "./physics";

/** Demo rooms: guest pass, any Chog, AI Chogs allowed, free. */
export const ROOM_NAME = "game";
/** Testnet rooms: wallet login, you must own the Chog, no AI, everyone stakes test $CHOG, winners split the pot. */
export const LIVE_ROOM = "live";
export const MIN_PLAYERS = 4;
export const MAX_SEATS = 15;
export const REVEAL_SECONDS = 6;
/** Server sim / bot tick. */
export const TICK_MS = 50;

export type Phase = "lobby" | "reveal" | "playing" | "meeting" | "ended";
export type Sabotage = "blackout" | "meltdown";
export type MeetingStage = "discuss" | "vote" | "result";

/** Interact range for vents, panels and the liquidity lever, px. */
export const SPOT_RANGE = 70;
/** Holding the liquidity lever this long rugs the coin. */
export const LIQ_PULL_MS = 15000;
export const SABOTAGE_COOLDOWN = 30;
export const MELTDOWN_SECONDS = 40;
/** A meltdown nobody fixes tampers this many extra stations. */
export const MELTDOWN_PENALTY = 2;
/** Devs see this fraction of normal range during a blackout. */
export const BLACKOUT_VISION = 0.4;
export const VENT_COOLDOWN_MS = 2500;
export const ALARM_COOLDOWN = 20;
/** How long the vote result (tally, then the firing) stays on screen. */
export const RESULT_SECONDS = 9;
/** After a meeting, the emergency button needs this long before it works again. */
export const BUTTON_COOLDOWN = 15;
/** Stand within this many px of the conference table's edge to hit the emergency button. */
export const BUTTON_RANGE = 60;
export const CHAT_MAX = 120;
export const SKIP = "skip";

/** One-tap phrases for phones. `{name}` is filled with a selected player. */
export const QUICK_CHAT = [
  "Where?",
  "Who?",
  "I was doing tasks",
  "I saw {name} at a red lever",
  "{name} is sus",
  "{name} is safe",
  "I was with {name}",
  "Skip, no proof",
  "Vote {name}",
];
export type Role = "dev" | "rugger";
export type Lever = "green" | "red";
export type Winner = "devs" | "ruggers";

export type Settings = {
  maxPlayers: number;
  ruggers: number;
  /** Player speed multiplier. */
  speed: number;
  /** Tasks each dev gets. */
  tasks: number;
  /** Red levers the Ruggers must have tampered at once to unlock the Liquidity Room. */
  rugLevers: number;
  /** Launch deadline, minutes. */
  timeLimit: number;
  /** Emergency button presses each player gets. */
  meetings: number;
  /** Seconds of discussion before voting opens. */
  discussTime: number;
  /** Seconds to vote. */
  voteTime: number;
};

export const DEFAULT_SETTINGS: Settings = { maxPlayers: 10, ruggers: 1, speed: 1, tasks: 5, rugLevers: 4, timeLimit: 10, meetings: 1, discussTime: 30, voteTime: 30 };

export const LIMITS: Record<keyof Settings, { min: number; max: number; step: number }> = {
  maxPlayers: { min: MIN_PLAYERS, max: MAX_SEATS, step: 1 },
  ruggers: { min: 1, max: 3, step: 1 },
  speed: { min: 0.5, max: 2, step: 0.25 },
  tasks: { min: 2, max: 9, step: 1 },
  rugLevers: { min: 2, max: 7, step: 1 },
  timeLimit: { min: 4, max: 15, step: 1 },
  meetings: { min: 0, max: 3, step: 1 },
  discussTime: { min: 0, max: 90, step: 15 },
  voteTime: { min: 15, max: 60, step: 15 },
};

/** Among Us rule of thumb: more Ruggers need more players to stay fair. */
export function maxRuggersFor(players: number) {
  return players >= 9 ? 3 : players >= 7 ? 2 : 1;
}

export function clampSetting<K extends keyof Settings>(key: K, v: number): number {
  const { min, max, step } = LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(v / step) * step));
}

/** Room codes: 4 letters, no I/O so they read cleanly out loud. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "").slice(0, CODE_LENGTH);

/**
 * `suit` is a preference: you get it if it is free when you join.
 * Testnet rooms also need the wallet login: `wallet`, `issuedAt` and the `signature` of loginMessage(wallet, issuedAt).
 */
export type JoinOptions = {
  name: string;
  chogId: number;
  suit?: number;
  private?: boolean;
  wallet?: string;
  issuedAt?: number;
  signature?: string;
};

/** Client -> server messages. */
export type ClientMessages = {
  move: { x: number; y: number };
  suit: number;
  settings: Partial<Settings>;
  addBot: undefined;
  removeBot: undefined;
  start: undefined;
  lobby: undefined;
  /** Start pulling a lever at a station. Walking away cancels it. */
  pull: { station: string; lever: Lever };
  cancel: undefined;
  /** Ruggers: drop into a vent and pop out of the next one in its network. */
  vent: { id: string };
  /** Ruggers: start a sabotage. */
  sabotage: Sabotage;
  /** Press a wall panel: breaker (ends blackout), coreA/coreB (hold to stop meltdown), alarm. */
  panel: { id: string };
  /** Ruggers inside the Liquidity Room: start pulling liquidity. */
  liq: undefined;
  /** Hit the emergency button at the conference table. */
  emergency: undefined;
  /** Meeting chat. */
  chat: string;
  /** Vote for a player id, or SKIP. */
  vote: string;
  /** Testnet: "I staked, check the pot." */
  paid: undefined;
};

/** Server -> client messages. */
export type ServerMessages = {
  /** Sent privately to each player when roles are dealt. `ruggers` is only filled for Ruggers. */
  role: { role: Role; ruggers: string[] };
  /** Your task list. Ruggers get a fake one (`fake: true`): their green pulls don't count. */
  tasks: { ids: string[]; done: string[]; fake: boolean };
  /** Ruggers only: how many stations are tampered right now, and how many unlock the Liquidity Room. */
  rug: { tampered: number; needed: number };
  /** End of the match: who the Ruggers were. */
  reveal: { ruggers: string[] };
  /** Someone vented: a puff at both ends (clients only draw it if they can see it). */
  vent: { from: { x: number; y: number }; to: { x: number; y: number } };
  /** Office-wide announcement. */
  alert: { text: string; tone: "danger" | "good" | "info" };
  /** Meeting chat line. */
  chat: { from: string; text: string };
  /** Vote result: who voted for whom, and who got fired. */
  verdict: { votes: Record<string, string>; fired: string; wasRugger: boolean; ruggersLeft: number };
  /** Testnet: the pot was paid out (or why it couldn't be). */
  payout: { txHash: string; each: number; winners: string[] } | { error: string };
  /** The server rejected a move: jump back here. */
  snap: { x: number; y: number };
  toast: string;
};

/** Read-only shape of the synced state, as the client sees it. */
export type PlayerState = {
  id: string;
  name: string;
  chogId: number;
  suit: number;
  x: number;
  y: number;
  /** False once fired. */
  alive: boolean;
  connected: boolean;
  bot: boolean;
  /** Emergency button presses left. */
  calls: number;
  /** Testnet: staked for this match (checked on-chain). */
  paid: boolean;
  /** Voted in the current meeting (not who for: that's revealed at the end). */
  voted: boolean;
};

export type SyncedMap<V> = {
  get(key: string): V | undefined;
  forEach(cb: (value: V, key: string) => void): void;
  readonly size: number;
};

export type StationState = {
  id: string;
  /** Who is pulling a lever here right now ("" = nobody). */
  by: string;
  lever: Lever | "";
  /** 0..100 */
  progress: number;
  tampered: boolean;
};

export type GameStateView = {
  /** Testnet room (real stakes) or demo. */
  live: boolean;
  /** Testnet: this match's id in the ChogPot contract (bytes32 hex). New one every match. */
  matchId: string;
  phase: Phase;
  code: string;
  hostId: string;
  countdown: number;
  players: SyncedMap<PlayerState>;
  settings: Settings;
  stations: SyncedMap<StationState>;
  /** Launch Meter, 0..100. */
  launch: number;
  winner: Winner | "";
  /** Liquidity Room door open for Ruggers. */
  liqUnlocked: boolean;
  /** Who is pulling liquidity right now, and how far (0..100). */
  liqBy: string;
  liqProgress: number;
  sabotage: Sabotage | "";
  /** Meltdown seconds left. */
  sabTime: number;
  /** Seconds until Ruggers can sabotage again. */
  sabReady: number;
  /** Who is holding each meltdown core ("" = nobody). */
  coreA: string;
  coreB: string;
  /** Launch deadline, seconds left. */
  timeLeft: number;
  /** Who called the meeting and why ("button" or "alarm"), and where it's at. */
  meetingBy: string;
  meetingWhy: string;
  meetingStage: MeetingStage | "";
  /** Why the match ended, for the win screen. */
  endWhy: string;
};

/** Lobby spawn: up to 15 Chogs in three rows in the middle lane of the Open Office. */
export function lobbySpawn(i: number) {
  const col = i % 5;
  const row = Math.floor(i / 5) % 3;
  return { x: SPAWN.x + (col - 2) * 56, y: SPAWN.y - 20 + row * 52 };
}

/** Game start: everyone stands round the conference table, like an emergency meeting. */
export function ringSpawn(walk: Grid, i: number, n: number) {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  for (const k of [1, 1.15, 0.9, 1.3]) {
    const x = MEETING_TABLE.x + Math.cos(a) * 5.4 * CELL * k;
    const y = MEETING_TABLE.y + 10 + Math.sin(a) * 3.2 * CELL * k;
    if (circleFree(walk, x, y, 20)) return { x, y };
  }
  return lobbySpawn(i);
}
