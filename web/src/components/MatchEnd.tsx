"use client";

import { useEffect } from "react";
import { sfx } from "@/game/sfx";
import { SUITS, hex } from "@/shared/suits";
import type { GameRoom } from "@/net/net";
import type { GameSnapshot } from "@/net/useGame";
import type { ServerMessages } from "@/shared/protocol";
import { txUrl } from "@/net/wallet";

/** End of the match: who won, who the Ruggers were, and the host's way back to the lobby. */
export function MatchEnd({
  room,
  game,
  ruggers,
  payout,
}: {
  room: GameRoom;
  game: GameSnapshot;
  ruggers: string[];
  payout: ServerMessages["payout"] | null;
}) {
  const devsWin = game.winner === "devs";
  const iRug = ruggers.includes(room.sessionId);
  const iWon = devsWin !== iRug;
  const isHost = game.hostId === room.sessionId;
  const rugSeats = game.seats.filter((s) => ruggers.includes(s.id));

  useEffect(() => {
    if (iWon) sfx.win();
    else sfx.lose();
  }, [iWon]);

  return (
    <div className={`reveal pointer-events-auto absolute inset-0 z-50 grid place-items-center overflow-y-auto px-4 ${devsWin ? "role-community" : "role-rugger"}`}>
      <div className="role-in flex flex-col items-center text-center">
        <div className="role-glow" />
        <div className="display text-[11px] font-bold uppercase tracking-[0.5em] text-white/60">{devsWin ? "The coin launched" : "The coin got rugged"}</div>
        <h1 className="role-title display mt-2 text-[clamp(44px,10vw,110px)] font-bold uppercase leading-none">{devsWin ? "Devs win" : "Ruggers win"}</h1>
        {game.endWhy && <p className="mt-3 max-w-md text-sm text-white/75">{game.endWhy}</p>}
        <p className={`display mt-3 text-lg font-bold uppercase tracking-widest ${iWon ? "text-up" : "text-down"}`}>{iWon ? "You won" : "You lost"}</p>

        {game.live && (
          <div className="mt-5 rounded-xl bg-black/40 px-4 py-3 text-sm ring-1 ring-white/10">
            {!payout ? (
              <span className="animate-pulse text-muted">Paying out the pot on Monad testnet…</span>
            ) : "error" in payout ? (
              <span className="text-down">{payout.error}</span>
            ) : (
              <span>
                <b className="text-gold">{payout.each.toFixed(2)} test $CHOG</b> to each of {payout.winners.length} winner{payout.winners.length === 1 ? "" : "s"}
                {payout.winners.includes(room.sessionId) && <b className="text-up"> (including you)</b>} ·{" "}
                <a href={txUrl(payout.txHash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-mon-hi underline underline-offset-2">
                  view tx
                </a>
              </span>
            )}
          </div>
        )}

        <div className="mt-8 text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">
          The Rugger{rugSeats.length === 1 ? " was" : "s were"}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          {rugSeats.map((s, i) => (
            <div key={s.id} className="lineup-in flex flex-col items-center" style={{ animationDelay: `${200 + i * 120}ms` }}>
              <div
                className="h-[clamp(64px,10vw,96px)] w-[clamp(64px,10vw,96px)] overflow-hidden rounded-[38%]"
                style={{ boxShadow: `0 0 0 3px ${hex(SUITS[s.suit].color)}, 0 0 30px rgba(255,45,85,.5)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/chogs/${s.chogId}.webp`} alt="" className="h-full w-full object-cover" />
              </div>
              <span className="display mt-1.5 text-xs font-bold text-down">{s.name}</span>
            </div>
          ))}
        </div>

        <div className="mt-10">
          {isHost ? (
            <button type="button" onClick={() => room.send("lobby")} className="ghost-btn px-8">
              Back to lobby
            </button>
          ) : (
            <div className="display animate-pulse text-xs font-bold uppercase tracking-widest text-muted">Waiting for the host…</div>
          )}
        </div>
      </div>
    </div>
  );
}
