"use client";

import { useEffect, useState } from "react";
import type { Lever, MeetingStage, Phase, Role, Sabotage, ServerMessages, Settings, Winner } from "@/shared/protocol";
import type { GameRoom } from "./net";

export type Seat = {
  id: string;
  name: string;
  chogId: number;
  suit: number;
  bot: boolean;
  connected: boolean;
  alive: boolean;
  calls: number;
  voted: boolean;
  paid: boolean;
};

/** Station state without the fast-changing progress number. */
export type StationSnap = { id: string; by: string; lever: Lever | ""; tampered: boolean };

export type GameSnapshot = {
  live: boolean;
  matchId: string;
  phase: Phase;
  code: string;
  hostId: string;
  countdown: number;
  settings: Settings;
  seats: Seat[];
  stations: StationSnap[];
  launch: number;
  winner: Winner | "";
  liqUnlocked: boolean;
  liqBy: string;
  sabotage: Sabotage | "";
  sabTime: number;
  sabReady: number;
  coreA: string;
  coreB: string;
  timeLeft: number;
  meetingBy: string;
  meetingWhy: string;
  meetingStage: MeetingStage | "";
  endWhy: string;
};

/** The slow-changing part of the room state (no positions), re-rendered only when it actually changes. */
export function useGame(room: GameRoom) {
  const [snap, setSnap] = useState<GameSnapshot | null>(null);

  useEffect(() => {
    let last = "";
    const read = () => {
      const s = room.state;
      if (!s?.players || !s.settings) return;
      const seats: Seat[] = [];
      s.players.forEach((p) =>
        seats.push({
          id: p.id,
          name: p.name,
          chogId: p.chogId,
          suit: p.suit,
          bot: p.bot,
          connected: p.connected,
          alive: p.alive,
          calls: p.calls,
          voted: p.voted,
          paid: p.paid,
        }),
      );
      const settings = { ...s.settings } as Settings;
      const stations: StationSnap[] = [];
      s.stations?.forEach((st) => stations.push({ id: st.id, by: st.by, lever: st.lever, tampered: st.tampered }));
      const next: GameSnapshot = {
        live: s.live,
        matchId: s.matchId,
        phase: s.phase,
        code: s.code,
        hostId: s.hostId,
        countdown: s.countdown,
        settings: {
          maxPlayers: settings.maxPlayers,
          ruggers: settings.ruggers,
          speed: settings.speed,
          tasks: settings.tasks,
          rugLevers: settings.rugLevers,
          timeLimit: settings.timeLimit,
          meetings: settings.meetings,
          discussTime: settings.discussTime,
          voteTime: settings.voteTime,
        },
        seats,
        stations,
        launch: s.launch ?? 0,
        winner: s.winner ?? "",
        liqUnlocked: s.liqUnlocked,
        liqBy: s.liqBy,
        sabotage: s.sabotage,
        sabTime: s.sabTime,
        sabReady: s.sabReady,
        coreA: s.coreA,
        coreB: s.coreB,
        timeLeft: s.timeLeft,
        meetingBy: s.meetingBy,
        meetingWhy: s.meetingWhy,
        meetingStage: s.meetingStage,
        endWhy: s.endWhy,
      };
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setSnap(next);
      }
    };
    read();
    room.onStateChange(read);
    return () => room.onStateChange.remove(read);
  }, [room]);

  return snap;
}

/** Your secret role. Cleared when the room goes back to the lobby. */
export function useRole(room: GameRoom, phase: Phase | undefined) {
  const [role, setRole] = useState<{ role: Role; ruggers: string[] } | null>(null);
  useEffect(() => room.onMessage("role", (m: ServerMessages["role"]) => setRole(m)), [room]);
  // Derived reset: no role outside a match.
  return phase === "lobby" ? null : role;
}

/** Private match info: your task list, the Rug Meter (Ruggers only), and who the Ruggers were at the end. */
export function usePrivate(room: GameRoom, phase: Phase | undefined) {
  const [tasks, setTasks] = useState<ServerMessages["tasks"] | null>(null);
  const [rug, setRug] = useState<ServerMessages["rug"] | null>(null);
  const [reveal, setReveal] = useState<string[] | null>(null);
  const [payout, setPayout] = useState<ServerMessages["payout"] | null>(null);
  useEffect(() => {
    const offs = [
      room.onMessage("payout", (m: ServerMessages["payout"]) => setPayout(m)),
      room.onMessage("tasks", (m: ServerMessages["tasks"]) => setTasks(m)),
      room.onMessage("rug", (m: ServerMessages["rug"]) => setRug(m)),
      room.onMessage("reveal", (m: ServerMessages["reveal"]) => {
        setReveal(m.ruggers);
        setPayout(null);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [room]);
  const live = phase === "playing" || phase === "ended" || phase === "reveal";
  return {
    tasks: live ? tasks : null,
    rug: live ? rug : null,
    reveal: phase === "ended" ? reveal : null,
    payout: phase === "ended" ? payout : null,
  };
}
