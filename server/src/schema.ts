import { schema, t, type SchemaType } from "@colyseus/schema";
import { DEFAULT_SETTINGS } from "../../web/src/shared/protocol";

// Synced state. Roles and task lists are NOT in here: they go to each player privately (see GameRoom).

export const Player = schema(
  {
    id: t.string(),
    name: t.string(),
    chogId: t.uint16(),
    suit: t.uint8(),
    x: t.float32(),
    y: t.float32(),
    alive: t.boolean().default(true),
    connected: t.boolean().default(true),
    bot: t.boolean().default(false),
    calls: t.uint8(),
    voted: t.boolean().default(false),
    paid: t.boolean().default(false),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const Settings = schema(
  {
    maxPlayers: t.uint8().default(DEFAULT_SETTINGS.maxPlayers),
    ruggers: t.uint8().default(DEFAULT_SETTINGS.ruggers),
    speed: t.float32().default(DEFAULT_SETTINGS.speed),
    tasks: t.uint8().default(DEFAULT_SETTINGS.tasks),
    rugLevers: t.uint8().default(DEFAULT_SETTINGS.rugLevers),
    timeLimit: t.uint8().default(DEFAULT_SETTINGS.timeLimit),
    meetings: t.uint8().default(DEFAULT_SETTINGS.meetings),
    discussTime: t.uint8().default(DEFAULT_SETTINGS.discussTime),
    voteTime: t.uint8().default(DEFAULT_SETTINGS.voteTime),
  },
  "Settings",
);
export type Settings = SchemaType<typeof Settings>;

/** A task station. Whether a lever is moving here is public: anyone who can see the console sees which one. */
export const Station = schema(
  {
    id: t.string(),
    by: t.string(),
    lever: t.string(),
    progress: t.uint8(),
    tampered: t.boolean().default(false),
  },
  "Station",
);
export type Station = SchemaType<typeof Station>;

export const GameState = schema(
  {
    live: t.boolean().default(false),
    matchId: t.string(),
    phase: t.string().default("lobby"),
    code: t.string(),
    hostId: t.string(),
    countdown: t.uint8(),
    players: t.map(Player),
    settings: Settings,
    stations: t.map(Station),
    launch: t.uint8(),
    winner: t.string(),
    liqUnlocked: t.boolean().default(false),
    liqBy: t.string(),
    liqProgress: t.uint8(),
    sabotage: t.string(),
    sabTime: t.uint8(),
    sabReady: t.uint8(),
    coreA: t.string(),
    coreB: t.string(),
    timeLeft: t.uint16(),
    meetingBy: t.string(),
    meetingWhy: t.string(),
    meetingStage: t.string(),
    endWhy: t.string(),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
