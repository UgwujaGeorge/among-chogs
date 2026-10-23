"use client";

import { useEffect, useRef, useState } from "react";
import { bus } from "@/game/bus";
import { sfx } from "@/game/sfx";
import { SUITS, hex } from "@/shared/suits";
import { ROOMS } from "@/shared/map";
import { STATION_BY_ID } from "@/shared/stations";
import type { Sabotage, ServerMessages } from "@/shared/protocol";
import type { GameRoom } from "@/net/net";
import { useGame, usePrivate, useRole } from "@/net/useGame";
import { Lobby } from "./Lobby";
import { Meeting } from "./Meeting";
import { MatchEnd } from "./MatchEnd";
import { Reveal } from "./Reveal";

const roomName = (id: string) => ROOMS.find((r) => r.id === id)?.name ?? "";

/** What USE does where you stand (`null` = disabled), and whether RUG (red lever) is available. */
type Actions = { use: { label: string; send: () => void } | null; rug: (() => void) | null };

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function Hud({ room: net, onLeave }: { room: GameRoom; onLeave: () => void }) {
  const game = useGame(net);
  const role = useRole(net, game?.phase);
  const priv = usePrivate(net, game?.phase);
  const [near, setNear] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [room, setRoom] = useState<{ name: string; key: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState(true);
  // Phones in landscape have little height: start with the task list folded. (Hud only renders on the client.)
  const [tasksOpen, setTasksOpen] = useState(() => window.innerHeight >= 520);
  const [alert, setAlert] = useState<(ServerMessages["alert"] & { key: number }) | null>(null);
  const [sabOpen, setSabOpen] = useState(false);

  useEffect(() => {
    const offs = [
      bus.on("room", (r) => setRoom(r ? { name: r, key: Date.now() } : null)),
      bus.on("ready", () => setReady(true)),
      bus.on("near", setNear),
      net.onMessage("toast", (text: ServerMessages["toast"]) => setToast({ text, key: Date.now() })),
      net.onMessage("alert", (m: ServerMessages["alert"]) => {
        setAlert({ ...m, key: Date.now() });
        if (m.tone === "danger") sfx.red(0.8);
        else sfx.done();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [net]);

  const phase = game?.phase;
  // Show the controls hint for the first few seconds of the lobby and of each match.
  useEffect(() => {
    if (!phase || phase === "reveal") return;
    const t = setTimeout(() => setHint(false), 9000);
    return () => {
      clearTimeout(t);
      setHint(true);
    };
  }, [phase]);

  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(null), 4500);
    return () => clearTimeout(t);
  }, [alert]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const me = game?.seats.find((s) => s.id === net.sessionId);
  const suit = SUITS[me?.suit ?? 0];
  const launch = game?.launch ?? 0;
  const inMatch = phase === "playing" || phase === "reveal" || phase === "meeting";
  const rugger = role?.role === "rugger";

  // What USE and RUG do right now, depending on what you're standing at.
  const tasks = priv.tasks;
  const rugMeter = priv.rug;
  const me_ = net.sessionId;
  const [kind, spotId] = near?.split(":") ?? [];
  const actions: Actions = { use: null, rug: null };
  const fired = !!me && !me.alive && phase !== "lobby";
  if (phase === "playing" && game && near && !fired) {
    const send = (type: string, msg?: unknown) => () => net.send(type as never, msg as never);
    if (kind === "station") {
      const here = game.stations.find((st) => st.id === spotId);
      if (here?.by === me_) actions.use = { label: "Stop", send: send("cancel") };
      else if (here && !here.by) {
        const pull = (lever: "green" | "red") => send("pull", { station: here.id, lever });
        if (rugger) {
          actions.use = { label: "Fake", send: pull("green") };
          if (!here.tampered) actions.rug = pull("red");
        } else if (here.tampered) actions.use = { label: "Fix", send: pull("green") };
        else if (tasks?.ids.includes(here.id) && !tasks.done.includes(here.id)) actions.use = { label: "Task", send: pull("green") };
      }
    } else if (kind === "panel") {
      const press = send("panel", { id: spotId });
      if (spotId === "breaker" && game.sabotage === "blackout") actions.use = { label: "Flip", send: press };
      if ((spotId === "coreA" || spotId === "coreB") && game.sabotage === "meltdown" && game[spotId] !== me_)
        actions.use = { label: "Hold", send: press };
      if (spotId === "alarm" && game.liqUnlocked) actions.use = { label: "Alarm", send: press };
    } else if (kind === "vent" && rugger) actions.use = { label: "Vent", send: send("vent", { id: spotId }) };
    else if (near === "button" && me && me.calls > 0 && game.sabotage !== "meltdown") actions.use = { label: `Meeting (${me.calls})`, send: send("emergency") };
    else if (near === "liq" && rugger && game.liqUnlocked) {
      if (game.liqBy === me_) actions.use = { label: "Stop", send: send("cancel") };
      else if (!game.liqBy) actions.use = { label: "Pull", send: send("liq") };
    }
  }
  const act = useRef(actions);
  useEffect(() => {
    act.current = actions;
  });
  useEffect(() => {
    const off = bus.on("action", (k) => {
      if (k === "sabotage") return setSabOpen((o) => !o);
      const a = act.current;
      const fn = k === "rug" ? a.rug : a.use?.send;
      if (fn) fn();
      else sfx.deny();
    });
    return () => void off();
  }, [net]);

  const sabotage = (k: Sabotage) => {
    net.send("sabotage", k);
    setSabOpen(false);
  };

  // Ding when one of your tasks completes.
  const doneCount = tasks?.done.length ?? 0;
  const lastDone = useRef(doneCount);
  useEffect(() => {
    if (doneCount > lastDone.current) sfx.done();
    lastDone.current = doneCount;
  }, [doneCount]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {(!ready || !game) && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-bg">
          <div className="display animate-pulse text-sm uppercase tracking-[0.4em] text-muted">Clocking in…</div>
        </div>
      )}

      {game && phase === "lobby" && <Lobby room={net} game={game} />}
      {game && phase === "reveal" && <Reveal game={game} meId={net.sessionId} role={role} />}
      {game && phase === "ended" && <MatchEnd room={net} game={game} ruggers={priv.reveal ?? []} payout={priv.payout} />}
      {game && phase === "meeting" && <Meeting room={net} game={game} rugMates={role?.ruggers ?? []} />}

      {/* Deadline + live crisis banners */}
      {game && (phase === "playing" || phase === "meeting") && (
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-2">
          <div className={`panel display rounded-xl px-4 py-1.5 text-center ${game.timeLeft <= 60 ? "text-down" : "text-ink"}`}>
            <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted">Launch in</div>
            <div className={`text-xl font-bold tabular-nums ${game.timeLeft <= 60 ? "animate-pulse" : ""}`}>{fmtTime(game.timeLeft)}</div>
          </div>
          {game.sabotage === "blackout" && (
            <div className="crisis display rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider">
              Blackout · flip the breaker in the Break Room
            </div>
          )}
          {game.sabotage === "meltdown" && (
            <div className="crisis display rounded-xl px-4 py-2 text-center text-xs font-bold uppercase tracking-wider">
              Meltdown {game.sabTime}s · Core A {game.coreA ? "✓" : "✗"} · Core B {game.coreB ? "✓" : "✗"}
            </div>
          )}
          {game.liqBy && (
            <div className="crisis crisis-hot display rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider">
              {game.liqBy === me_ ? "Pulling liquidity… stay at the lever" : "Liquidity is draining! Hit the alarm by the door"}
            </div>
          )}
          {game.liqUnlocked && !game.liqBy && !rugger && (
            <div className="panel display rounded-xl px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gold">Liquidity Room unlocked</div>
          )}
        </div>
      )}

      {alert && (
        <div key={alert.key} className={`alert-in display absolute left-1/2 top-[26%] z-30 max-w-[92vw] -translate-x-1/2 rounded-2xl px-5 py-3 text-center text-sm font-bold uppercase tracking-wider md:text-base ${alert.tone === "danger" ? "alert-danger" : alert.tone === "good" ? "alert-good" : "panel"}`}>
          {alert.text}
        </div>
      )}

      {/* Launch meter + tasks */}
      {inMatch && (
      <div className="absolute left-[max(12px,env(safe-area-inset-left))] top-3 w-[min(300px,40vw)]">
        <div className="panel rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="display text-[11px] font-bold uppercase text-mon-hi">Launch meter</span>
            <span className="display text-[11px] font-bold tabular-nums text-ink">{launch}%</span>
          </div>
          <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
            <div
              className="meter-sheen relative h-full rounded-full bg-gradient-to-r from-mon to-up"
              style={{ width: `${Math.max(3, launch)}%` }}
            />
          </div>
          {rugger && rugMeter && (
            <>
              <div className="mt-2 flex items-center justify-between">
                <span className="display text-[11px] font-bold uppercase text-down">Rug meter</span>
                <span className="display text-[11px] font-bold tabular-nums text-ink">
                  {rugMeter.tampered}/{rugMeter.needed} levers
                </span>
              </div>
              <div className="mt-1.5 flex gap-1">
                {Array.from({ length: rugMeter.needed }, (_, i) => (
                  <div key={i} className={`h-2.5 flex-1 rounded-sm ${i < rugMeter.tampered ? "bg-down shadow-[0_0_10px_rgba(255,77,109,.8)]" : "bg-black/50 ring-1 ring-white/10"}`} />
                ))}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setTasksOpen((o) => !o)}
          className="panel pointer-events-auto mt-2 w-full rounded-xl px-3 py-2 text-left"
        >
          <div className="flex items-center justify-between">
            <span className="display text-[11px] font-bold uppercase tracking-widest text-muted">{rugger ? "Fake tasks" : "Tasks"}</span>
            <span className="text-[10px] text-muted">{tasksOpen ? "▾" : "▸"}</span>
          </div>
          {tasksOpen && tasks && (
            <ul className="mt-1.5 space-y-1">
              {tasks.ids.map((id) => {
                const st = STATION_BY_ID.get(id)!;
                const done = tasks.done.includes(id);
                return (
                  <li key={id} className={`flex items-baseline justify-between gap-2 text-[12px] leading-tight ${done ? "text-up/80 line-through decoration-up/60" : "text-ink/90"}`}>
                    <span>
                      {done ? "✓ " : ""}
                      {st.task}
                    </span>
                    <span className="truncate text-[10px] text-muted no-underline">{roomName(st.room)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {tasksOpen && rugger && (
            <p className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-snug text-down/90">
              Your tasks are fake. Pull <b>red levers</b> when nobody&apos;s watching to unlock the Liquidity Room.
            </p>
          )}
        </button>
      </div>
      )}

      {/* Your Chog */}
      <div className="absolute right-[max(12px,env(safe-area-inset-right))] top-3 flex items-start gap-2">
        {me && (
        <div className="panel flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-lg" style={{ boxShadow: `0 0 0 2px ${hex(suit.color)}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/chogs/${me.chogId}.webp`} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="leading-tight">
            <div className="display text-[13px] font-bold">{me.name}</div>
            {role && phase === "playing" ? (
              <div className={`display text-[10px] font-bold uppercase tracking-wider ${rugger ? "text-down" : "text-up"}`}>
                {rugger ? "Rugger" : "Dev"}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] text-muted">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: hex(suit.color) }} />
                {suit.name} suit
              </div>
            )}
          </div>
        </div>
        )}
        <button type="button" onClick={onLeave} className="panel pointer-events-auto grid h-[52px] w-11 place-items-center rounded-xl text-muted hover:text-ink" aria-label="Leave room" title="Leave room">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
          </svg>
        </button>
      </div>

      {toast && (
        <div key={toast.key} className="toast-in panel absolute bottom-[22%] left-1/2 z-30 max-w-[90vw] -translate-x-1/2 rounded-xl px-4 py-2.5 text-center text-sm text-ink">
          {toast.text}
        </div>
      )}

      {/* Room banner */}
      {room && (
        <div
          key={room.key}
          className="room-banner display absolute left-1/2 top-[14%] whitespace-nowrap text-[clamp(16px,2.4vw,26px)] font-bold uppercase text-white"
          style={{ textShadow: "0 0 18px rgba(131,110,249,.9), 0 2px 0 rgba(0,0,0,.6)" }}
        >
          {room.name}
        </div>
      )}

      {fired && phase === "playing" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <div className="crisis display rounded-xl px-5 py-2.5 text-center text-xs font-bold uppercase tracking-wider">You were fired · spectating</div>
        </div>
      )}

      {/* Action buttons */}
      {inMatch && !fired && (
      <div className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] right-[max(16px,env(safe-area-inset-right))] flex items-end gap-3">
        {rugger && (
          <div className="relative">
            {sabOpen && (
              <div className={`panel pointer-events-auto absolute bottom-[calc(100%+10px)] right-0 w-48 rounded-xl p-2 ${phase !== "playing" || !game || game.sabotage || game.sabReady > 0 ? "hidden" : ""}`}>
                <button type="button" onClick={() => sabotage("blackout")} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">
                  <b className="display uppercase">Blackout</b>
                  <div className="text-[11px] text-muted">Devs can barely see</div>
                </button>
                <button type="button" onClick={() => sabotage("meltdown")} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">
                  <b className="display uppercase">Server meltdown</b>
                  <div className="text-[11px] text-muted">Two devs must hold the cores</div>
                </button>
              </div>
            )}
            <ActionButton
              label={game && game.sabReady > 0 ? `${game.sabReady}s` : "Sabotage"}
              keyHint="F"
              tone="down"
              disabled={phase !== "playing" || !game || !!game.sabotage || game.sabReady > 0}
              onPress={() => setSabOpen((o) => !o)}
            >
              <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
            </ActionButton>
          </div>
        )}
        {rugger && (
          <ActionButton label="Rug" keyHint="Q" tone="down" disabled={!actions.rug} onPress={() => bus.emit("action", "rug")}>
            <path d="M8 21V9m0 0-3 3m3-3 3 3M16 3v12m0 0-3-3m3 3 3-3" />
          </ActionButton>
        )}
        <ActionButton
          label={actions.use ? actions.use.label : "Use"}
          keyHint="E"
          tone="mon"
          big
          disabled={!actions.use}
          onPress={() => bus.emit("action", "use")}
        >
          <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4 15a1.5 1.5 0 0 1 2.4-1.8L9 15.5" />
        </ActionButton>
      </div>
      )}

      {/* Controls hint */}
      <div
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-700 ${hint && ready && phase !== "reveal" ? "opacity-100" : "opacity-0"}`}
      >
        <div className="panel whitespace-nowrap rounded-full px-4 py-2 text-[12px] text-muted">
          <span className="hidden [@media(pointer:fine)]:inline">
            <Kbd>W</Kbd>
            <Kbd>A</Kbd>
            <Kbd>S</Kbd>
            <Kbd>D</Kbd> move · <Kbd>E</Kbd> {rugger ? "fake task" : "task / fix"}
            {rugger && (
              <>
                {" "}
                · <Kbd>Q</Kbd> red lever · <Kbd>F</Kbd> sabotage
              </>
            )}
          </span>
          <span className="[@media(pointer:fine)]:hidden">Drag on the left side to move</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="display mx-0.5 inline-grid h-5 min-w-5 place-items-center rounded border border-white/15 bg-white/5 px-1 text-[10px] font-bold text-ink">
      {children}
    </kbd>
  );
}

function ActionButton({
  label,
  keyHint,
  tone,
  big,
  disabled,
  onPress,
  children,
}: {
  label: string;
  keyHint: string;
  tone: "mon" | "down";
  big?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const size = big ? "h-[clamp(72px,11vmin,96px)] w-[clamp(72px,11vmin,96px)]" : "h-[clamp(58px,9vmin,76px)] w-[clamp(58px,9vmin,76px)]";
  const color = tone === "mon" ? "from-mon/90 to-[#4b36c9]" : "from-down/90 to-[#a3173a]";
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!disabled) onPress();
      }}
      className={`pointer-events-auto relative grid ${size} place-items-center rounded-full bg-gradient-to-b ${color} text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,.8),inset_0_2px_0_rgba(255,255,255,.25)] ring-2 ring-white/15 transition active:scale-95 disabled:opacity-35 disabled:grayscale-[.6]`}
    >
      <svg viewBox="0 0 24 24" className="h-[42%] w-[42%]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      <span className="display absolute -bottom-0.5 text-[10px] font-bold uppercase tracking-wider drop-shadow">{label}</span>
      <span className="display absolute -right-1 -top-1 hidden h-5 w-5 place-items-center rounded-md bg-black/70 text-[10px] font-bold text-ink ring-1 ring-white/20 [@media(pointer:fine)]:grid">
        {keyHint}
      </span>
    </button>
  );
}
