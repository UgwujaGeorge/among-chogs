"use client";

import { useEffect, useState } from "react";
import { maxRuggersFor, type Role } from "@/shared/protocol";
import { SUITS, hex } from "@/shared/suits";
import type { GameSnapshot } from "@/net/useGame";

/**
 * The match-start cinematic. "Shhh!" first, then your role: Community Members see the whole crew,
 * Ruggers see only their partners in crime.
 */
export function Reveal({ game, meId, role }: { game: GameSnapshot; meId: string; role: { role: Role; ruggers: string[] } | null }) {
  const [stage, setStage] = useState<"shh" | "role">("shh");
  useEffect(() => {
    const t = setTimeout(() => setStage("role"), 1700);
    return () => clearTimeout(t);
  }, []);

  const rugger = role?.role === "rugger";
  const count = Math.min(game.settings.ruggers, maxRuggersFor(game.seats.length));
  const shown = rugger ? game.seats.filter((s) => role!.ruggers.includes(s.id)) : game.seats;
  // You stand in the middle of the lineup.
  const lineup = [...shown].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0));
  const ordered = lineup.slice(1).reduce((acc, s, i) => (i % 2 ? [s, ...acc] : [...acc, s]), lineup.slice(0, 1));

  return (
    <div className={`reveal pointer-events-auto absolute inset-0 z-50 grid place-items-center overflow-hidden ${game.countdown <= 1 ? "reveal-out" : ""}`}>
      {stage === "shh" || !role ? (
        <div className="shh display text-[clamp(56px,14vw,150px)] font-bold uppercase text-white">Shhhh!</div>
      ) : (
        <div className={`role-in flex flex-col items-center px-4 text-center ${rugger ? "role-rugger" : "role-community"}`}>
          <div className="role-glow" />
          <div className="display text-[11px] font-bold uppercase tracking-[0.5em] text-white/60">You are a</div>
          <h1 className="role-title display mt-2 text-[clamp(40px,9vw,104px)] font-bold uppercase leading-none">
            {rugger ? "Rugger" : "Dev"}
          </h1>
          <p className="mt-4 max-w-md text-sm text-white/75 md:text-base">
            {rugger ? (
              <>Fake your tasks. Pull the red levers when nobody&apos;s looking. Don&apos;t get caught.</>
            ) : (
              <>
                There {count === 1 ? "is" : "are"} <span className="font-bold text-down">{count} Rugger{count === 1 ? "" : "s"}</span> among us.
                Do your tasks to launch the coin. Watch for red levers.
              </>
            )}
          </p>
          <div className="mt-8 flex max-w-[92vw] flex-wrap items-end justify-center gap-[clamp(6px,1.4vw,14px)]">
            {ordered.map((s, i) => {
              const me = s.id === meId;
              return (
                <div key={s.id} className="lineup-in flex flex-col items-center" style={{ animationDelay: `${120 + i * 70}ms` }}>
                  <div
                    className={`overflow-hidden rounded-[38%] ${me ? "h-[clamp(72px,12vw,120px)] w-[clamp(72px,12vw,120px)]" : "h-[clamp(48px,8vw,84px)] w-[clamp(48px,8vw,84px)]"}`}
                    style={{ boxShadow: `0 0 0 3px ${hex(SUITS[s.suit].color)}, 0 0 30px ${hex(SUITS[s.suit].color)}66` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/chogs/${s.chogId}.webp`} alt="" className="h-full w-full object-cover" />
                  </div>
                  <span className={`display mt-1.5 max-w-24 truncate text-[11px] font-bold ${rugger ? "text-down" : "text-white/80"}`}>{s.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
