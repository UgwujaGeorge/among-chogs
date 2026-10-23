"use client";

import { useState } from "react";
import { LIMITS, MIN_PLAYERS, maxRuggersFor, type Settings } from "@/shared/protocol";
import { SUITS, hex } from "@/shared/suits";
import type { GameRoom } from "@/net/net";
import type { GameSnapshot, Seat } from "@/net/useGame";
import { ENTRY_FEE } from "@/shared/chain";
import { savedLogin, stake } from "@/net/wallet";
import { friendlyError } from "@/net/net";

const SETTING_ROWS: { key: keyof Settings; label: string; fmt: (v: number) => string }[] = [
  { key: "maxPlayers", label: "Max players", fmt: (v) => `${v}` },
  { key: "ruggers", label: "Ruggers", fmt: (v) => `${v}` },
  { key: "speed", label: "Player speed", fmt: (v) => `${v}x` },
  { key: "tasks", label: "Tasks per dev", fmt: (v) => `${v}` },
  { key: "rugLevers", label: "Red levers to rug", fmt: (v) => `${v}` },
  { key: "timeLimit", label: "Launch deadline", fmt: (v) => `${v} min` },
  { key: "meetings", label: "Emergency meetings", fmt: (v) => `${v} each` },
  { key: "discussTime", label: "Discussion time", fmt: (v) => `${v}s` },
  { key: "voteTime", label: "Voting time", fmt: (v) => `${v}s` },
];

/** Everything on screen while the crew gathers: room code, crew list, suit + host settings, launch button. */
export function Lobby({ room, game }: { room: GameRoom; game: GameSnapshot }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isHost = game.hostId === room.sessionId;
  const n = game.seats.length;
  const bots = game.seats.filter((s) => s.bot).length;
  const staked = game.seats.filter((s) => s.paid).length;
  const allStaked = !game.live || staked === n;
  const canStart = n >= MIN_PLAYERS && allStaked;
  const me = game.seats.find((s) => s.id === room.sessionId);
  const [stakeStep, setStakeStep] = useState<string | null>(null);
  const [stakeError, setStakeError] = useState<string | null>(null);

  const doStake = async () => {
    const login = savedLogin();
    if (!login || !me || stakeStep) return;
    setStakeError(null);
    try {
      await stake(login, game.matchId, me.chogId, setStakeStep);
      setStakeStep("Confirming…");
      room.send("paid");
    } catch (e) {
      setStakeError(friendlyError(e).split("\n")[0].slice(0, 140));
    } finally {
      setTimeout(() => setStakeStep(null), 1500);
    }
  };

  const copyInvite = async () => {
    const url = `${window.location.origin}/?code=${game.code}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: "Among Chogs", text: `Join my Among Chogs room: ${game.code}`, url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Share sheet dismissed: nothing to do.
    }
  };

  return (
    <>
      {/* Room code */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2">
        <button type="button" onClick={copyInvite} className="panel pointer-events-auto flex items-center gap-3 rounded-xl py-1.5 pl-3 pr-1.5">
          <span className="display text-[10px] font-bold uppercase tracking-widest text-muted">Room</span>
          <span className="display text-xl font-bold tracking-[0.3em] text-ink">{game.code}</span>
          <span className="display rounded-lg bg-mon/25 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-mon-hi ring-1 ring-mon/40">
            {copied ? "Copied" : "Invite"}
          </span>
        </button>
        {game.live && (
          <div className="panel mt-2 rounded-xl px-3 py-1.5 text-center">
            <div className="display text-[10px] font-bold uppercase tracking-widest text-muted">Pot · Monad testnet</div>
            <div className="display text-sm font-bold text-gold">
              {staked * ENTRY_FEE} test $CHOG <span className="text-[11px] font-normal text-muted">({staked}/{n} staked)</span>
            </div>
          </div>
        )}
      </div>

      {/* Testnet: your stake */}
      {game.live && me && (
        <div className="absolute bottom-[calc(max(16px,env(safe-area-inset-bottom))+96px)] right-[max(16px,env(safe-area-inset-right))] w-[min(320px,80vw)]">
          {me.paid ? (
            <div className="panel display rounded-xl px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-up">✓ You staked {ENTRY_FEE} test $CHOG</div>
          ) : (
            <div className="panel pointer-events-auto rounded-xl p-3">
              <button type="button" onClick={doStake} disabled={!!stakeStep} className="tm-stake w-full">
                {stakeStep ?? `Stake ${ENTRY_FEE} test $CHOG`}
              </button>
              <p className="mt-1.5 text-center text-[10px] leading-snug text-muted">
                {stakeError ?? "Free test tokens from the faucet are claimed for you if you're short. The winning side splits the pot."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Crew list */}
      <div className="absolute left-[max(12px,env(safe-area-inset-left))] top-3 w-[min(260px,38vw)]">
        <div className="panel rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="display text-[11px] font-bold uppercase text-mon-hi">Crew</span>
            <span className="display text-[11px] font-bold tabular-nums text-ink">
              {n}/{game.settings.maxPlayers}
            </span>
          </div>
          <ul className="mt-2 max-h-[min(46vh,360px)] space-y-1.5 overflow-y-auto pr-1">
            {game.seats.map((s) => (
              <CrewRow key={s.id} seat={s} host={s.id === game.hostId} me={s.id === room.sessionId} live={game.live} />
            ))}
          </ul>
        </div>
      </div>

      {/* Launch / waiting */}
      <div className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] right-[max(16px,env(safe-area-inset-right))] flex items-end gap-3">
        <button type="button" onClick={() => setOpen(true)} className="ghost-btn pointer-events-auto h-12 px-4 text-sm">
          {isHost ? "Lobby settings" : "Customize"}
        </button>
        {isHost ? (
          <button
            type="button"
            onClick={() => room.send("start")}
            disabled={!canStart}
            className="launch-btn pointer-events-auto"
            title={canStart ? "Start the match" : `Need ${MIN_PLAYERS} Chogs`}
          >
            <span className="display text-lg font-bold uppercase tracking-wider">Launch</span>
            <span className="text-[10px] font-semibold opacity-80">
              {n < MIN_PLAYERS ? `Need ${MIN_PLAYERS - n} more` : !allStaked ? `Stakes ${staked}/${n}` : `${n} Chogs ready`}
            </span>
          </button>
        ) : (
          <div className="panel display rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted">
            <span className="animate-pulse">Waiting for host</span>
          </div>
        )}
      </div>

      {open && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex justify-end bg-black/50" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="panel sheet-in h-full w-[min(360px,100vw)] overflow-y-auto rounded-l-2xl p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h2 className="display text-lg font-bold uppercase tracking-wider">Lobby</h2>
              <button type="button" onClick={() => setOpen(false)} className="icon-btn" aria-label="Close">
                ✕
              </button>
            </div>

            <h3 className="display mt-5 text-[11px] font-bold uppercase tracking-widest text-muted">Your suit</h3>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {SUITS.map((s, i) => {
                const owner = game.seats.find((p) => p.suit === i);
                const mine = owner?.id === room.sessionId;
                return (
                  <button
                    key={s.name}
                    type="button"
                    disabled={!!owner && !mine}
                    onClick={() => room.send("suit", i)}
                    title={owner && !mine ? `${s.name} (taken by ${owner.name})` : s.name}
                    className={`relative aspect-square rounded-lg ring-2 transition active:scale-90 disabled:opacity-25 ${mine ? "ring-white" : "ring-white/10 hover:ring-white/40"}`}
                    style={{ background: `linear-gradient(160deg, ${hex(s.color)}, ${hex(s.color)}99)` }}
                  >
                    {mine && <span className="absolute inset-0 grid place-items-center text-sm font-bold text-black/70">✓</span>}
                  </button>
                );
              })}
            </div>

            <h3 className="display mt-6 text-[11px] font-bold uppercase tracking-widest text-muted">
              Game settings {!isHost && <span className="normal-case tracking-normal">(host only)</span>}
            </h3>
            <div className="mt-2 space-y-2">
              {SETTING_ROWS.map(({ key, label, fmt }) => {
                const v = game.settings[key];
                const { min, max, step } = LIMITS[key];
                const note = key === "ruggers" && v > maxRuggersFor(n) ? `${maxRuggersFor(n)} with ${n} players` : null;
                return (
                  <Stepper
                    key={key}
                    label={label}
                    value={fmt(v)}
                    note={note}
                    disabled={!isHost}
                    canDec={v > min}
                    canInc={v < max}
                    onDec={() => room.send("settings", { [key]: v - step })}
                    onInc={() => room.send("settings", { [key]: v + step })}
                  />
                );
              })}
              {!game.live && <Stepper
                label="AI Chogs"
                value={`${bots}`}
                note={isHost ? "Fill empty seats" : null}
                disabled={!isHost}
                canDec={bots > 0}
                canInc={n < game.settings.maxPlayers}
                onDec={() => room.send("removeBot")}
                onInc={() => room.send("addBot")}
              />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CrewRow({ seat, host, me, live }: { seat: Seat; host: boolean; me: boolean; live: boolean }) {
  const suit = SUITS[seat.suit];
  return (
    <li className={`flex items-center gap-2 ${seat.connected ? "" : "opacity-40"}`}>
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md" style={{ boxShadow: `0 0 0 2px ${hex(suit.color)}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/chogs/${seat.chogId}.webp`} alt="" className="h-full w-full object-cover" />
      </div>
      <span className={`truncate text-[13px] leading-tight ${me ? "font-bold text-ink" : "text-ink/85"}`}>{seat.name}</span>
      {host && <span className="text-[11px] text-gold" title="Host">♛</span>}
      {seat.bot && <span className="display rounded bg-white/10 px-1 text-[9px] font-bold text-muted">AI</span>}
      {me && <span className="text-[10px] text-muted">you</span>}
      {live && (
        <span className={`ml-auto shrink-0 text-[10px] font-bold ${seat.paid ? "text-up" : "text-muted"}`} title={seat.paid ? "Staked" : "Not staked yet"}>
          {seat.paid ? "✓ staked" : "…"}
        </span>
      )}
    </li>
  );
}

function Stepper(p: {
  label: string;
  value: string;
  note: string | null;
  disabled: boolean;
  canDec: boolean;
  canInc: boolean;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/5">
      <div className="leading-tight">
        <div className="text-[13px] text-ink">{p.label}</div>
        {p.note && <div className="text-[10px] text-muted">{p.note}</div>}
      </div>
      <div className="flex items-center gap-2">
        {!p.disabled && (
          <button type="button" onClick={p.onDec} disabled={!p.canDec} className="step-btn" aria-label={`Less ${p.label}`}>
            −
          </button>
        )}
        <span className="display w-10 text-center text-sm font-bold tabular-nums">{p.value}</span>
        {!p.disabled && (
          <button type="button" onClick={p.onInc} disabled={!p.canInc} className="step-btn" aria-label={`More ${p.label}`}>
            +
          </button>
        )}
      </div>
    </div>
  );
}
