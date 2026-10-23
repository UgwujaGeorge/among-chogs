"use client";

import { useCallback, useEffect, useState } from "react";
import { CloseCode } from "@colyseus/sdk";
import { GameCanvas } from "./GameCanvas";
import { Hud } from "./Hud";
import { Menu, TOTAL_CHOGS, randomChog } from "./Menu";
import { normalizeCode, type JoinOptions } from "@/shared/protocol";
import type { GameRoom } from "@/net/net";
import type { SceneConfig } from "@/game/MainScene";

const SAVE_KEY = "among-chogs:me";

function load(): { name: string; chogId: number; suit?: number } | null {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
  } catch {
    return null;
  }
}

function save(me: JoinOptions) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ name: me.name, chogId: me.chogId, suit: me.suit }));
  } catch {
    // Private mode: just don't remember.
  }
}

/** Title menu until you're in a room, then the game + HUD. `?chog=123` picks a Chog, `?code=ABCD` prefills an invite. */
export function Play() {
  const [initial, setInitial] = useState<{ name: string; chogId: number; code: string; suit: number } | null>(null);
  const [config, setConfig] = useState<SceneConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const saved = load();
    const c = Number(q.get("chog"));
    const chogId = c >= 1 && c <= TOTAL_CHOGS ? c : saved?.chogId ?? randomChog();
    // Reading the URL and storage has to wait for the client, so this runs after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitial({ name: saved?.name ?? "", chogId, suit: saved?.suit ?? 0, code: normalizeCode(q.get("code") ?? "") });
  }, []);

  const onJoined = useCallback((room: GameRoom, me: JoinOptions) => {
    save(me);
    setInitial((i) => (i ? { ...i, name: me.name, chogId: me.chogId, suit: me.suit ?? i.suit } : i));
    setError(null);
    room.onLeave((code) => {
      setConfig(null);
      if (code !== CloseCode.CONSENTED && code !== CloseCode.NORMAL_CLOSURE) setError("Lost connection to the game.");
    });
    setConfig({ room, font: "", dpr: 1 });
  }, []);

  const leave = useCallback(() => {
    config?.room.leave();
  }, [config]);

  return (
    <main className="game-root">
      {config ? (
        <>
          <GameCanvas config={config} />
          <Hud room={config.room} onLeave={leave} />
        </>
      ) : (
        initial && <Menu initial={initial} error={error} onJoined={onJoined} />
      )}
    </main>
  );
}
