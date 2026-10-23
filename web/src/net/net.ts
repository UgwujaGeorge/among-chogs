import { Client, type Room } from "@colyseus/sdk";
import { LIVE_ROOM, ROOM_NAME, normalizeCode, type GameStateView, type JoinOptions } from "@/shared/protocol";
import { getMode } from "./mode";

export type GameRoom = Room<unknown, GameStateView>;

/** Game server URL. Defaults to the same host on :2567 so phones on the LAN can join a dev server. */
function endpoint() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  const secure = window.location.protocol === "https:";
  return `${secure ? "https" : "http"}://${window.location.hostname}:2567`;
}

let client: Client | null = null;
const sdk = () => (client ??= new Client(endpoint()));

/** Demo and testnet rooms are different room types on the same game server. */
const roomName = () => (getMode() === "live" ? LIVE_ROOM : ROOM_NAME);

export const quickPlay = (o: JoinOptions) => sdk().joinOrCreate<GameStateView>(roomName(), { ...o, private: false });
export const createPrivate = (o: JoinOptions) => sdk().create<GameStateView>(roomName(), { ...o, private: true });
export const joinCode = (code: string, o: JoinOptions) => sdk().joinById<GameStateView>(normalizeCode(code), o);

/** Turns SDK/server errors into something a player can read. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/not found/i.test(msg)) return "No room with that code.";
  if (/locked|already started/i.test(msg)) return "That game already started. Try another code.";
  if (/full/i.test(msg)) return "That room is full.";
  if (/fetch|network|ECONNREFUSED|Failed to fetch/i.test(msg)) return "Can't reach the game server.";
  if (/rejected|denied/i.test(msg)) return "You cancelled in your wallet.";
  return msg || "Something went wrong.";
}
