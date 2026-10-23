"use client";

import { useEffect, useRef, useState } from "react";
import { sfx } from "@/game/sfx";
import { CHAT_MAX, QUICK_CHAT, SKIP, type ServerMessages } from "@/shared/protocol";
import { SUITS, hex } from "@/shared/suits";
import type { GameRoom } from "@/net/net";
import type { GameSnapshot, Seat } from "@/net/useGame";
import { ChogDev } from "./menu/ChogDev";

type Line = ServerMessages["chat"] & { key: number };
type Verdict = ServerMessages["verdict"];

const STAGE = { discuss: "Discuss", vote: "Vote", result: "Result" } as const;
/** The verdict shows the tally first, then the firing. */
const TALLY_MS = 3500;

/**
 * The meeting: who called it, every Chog at the table, chat with quick phrases, voting (or skip),
 * then the tally and the firing ("Chog #412 was fired. They were not The Rugger.").
 */
export function Meeting({ room, game, rugMates }: { room: GameRoom; game: GameSnapshot; rugMates: string[] }) {
  const meId = room.sessionId;
  const me = game.seats.find((s) => s.id === meId);
  const canAct = !!me?.alive;
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [firing, setFiring] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth >= 900);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sfx.red(0.6);
    const offs = [
      room.onMessage("chat", (m: ServerMessages["chat"]) => setLines((l) => [...l.slice(-60), { ...m, key: Math.random() }])),
      room.onMessage("verdict", (v: Verdict) => {
        setVerdict(v);
        setTimeout(() => setFiring(true), TALLY_MS);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [room]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const seat = (id: string) => game.seats.find((s) => s.id === id);
  const caller = seat(game.meetingBy);
  const voting = game.meetingStage === "vote" && canAct && !myVote;
  const send = (t: string) => {
    const msg = t.trim().slice(0, CHAT_MAX);
    if (!msg || !canAct) return;
    room.send("chat", msg);
    setText("");
  };
  const vote = (target: string) => {
    room.send("vote", target);
    setMyVote(target);
    setPicked(null);
    sfx.green();
  };
  const pickedName = picked && picked !== SKIP ? seat(picked)?.name : null;

  // Who voted for whom (only once the verdict is in).
  const votersFor = (target: string) =>
    verdict ? Object.entries(verdict.votes).filter(([, t]) => t === target).map(([v]) => seat(v)).filter(Boolean) as Seat[] : [];

  if (firing && verdict) return <Firing game={game} verdict={verdict} />;

  return (
    <div className="meeting pointer-events-auto absolute inset-0 z-40 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-3 p-3 md:flex-row md:p-6">
        {/* Table */}
        <section className="meeting-panel flex min-w-0 flex-1 flex-col rounded-2xl p-3 md:p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {caller && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/chogs/${caller.chogId}.webp`} alt="" className="h-11 w-11 rounded-xl object-cover" style={{ boxShadow: `0 0 0 2px ${hex(SUITS[caller.suit].color)}` }} />
              )}
              <div className="leading-tight">
                <div className="display text-lg font-bold uppercase tracking-wider text-down md:text-2xl">
                  {game.meetingWhy === "alarm" ? "Liquidity alarm!" : "Emergency meeting"}
                </div>
                <div className="text-xs text-muted">Called by {caller?.name ?? "someone"}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="display text-[10px] font-bold uppercase tracking-[0.3em] text-muted">{game.meetingStage ? STAGE[game.meetingStage] : ""}</div>
              <div className={`display text-2xl font-bold tabular-nums ${game.countdown <= 5 ? "text-down" : "text-ink"}`}>{game.countdown}s</div>
            </div>
          </header>

          <p className="mt-2 text-xs text-muted">
            {!canAct
              ? "You were fired. You can watch, but not talk or vote."
              : game.meetingStage === "discuss"
                ? "Talk it out. Voting opens when the timer ends."
                : game.meetingStage === "vote"
                  ? myVote
                    ? "Vote locked in. Waiting for the others…"
                    : "Tap a Chog to vote them out, or skip."
                  : "The votes are in."}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {game.seats.map((s) => {
              const out = !s.alive;
              const selectable = voting && !out && s.id !== meId;
              const isPicked = picked === s.id;
              const mate = rugMates.includes(s.id);
              return (
                <div
                  key={s.id}
                  role={selectable ? "button" : undefined}
                  tabIndex={selectable ? 0 : undefined}
                  onClick={() => selectable && setPicked(isPicked ? null : s.id)}
                  className={`seat-card relative flex items-center gap-2 rounded-xl p-2 ${out ? "opacity-35 grayscale" : ""} ${selectable ? "cursor-pointer hover:ring-white/40" : ""} ${isPicked ? "ring-2 ring-down" : "ring-1 ring-white/10"}`}
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg" style={{ boxShadow: `0 0 0 2px ${hex(SUITS[s.suit].color)}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/chogs/${s.chogId}.webp`} alt="" className="h-full w-full object-cover" />
                    {out && <div className="absolute inset-0 grid place-items-center bg-black/60 text-[9px] font-bold text-down">FIRED</div>}
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className={`truncate text-[13px] font-bold ${mate ? "text-down" : "text-ink"}`}>
                      {s.name}
                      {s.id === meId && <span className="ml-1 text-[10px] font-normal text-muted">you</span>}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: hex(SUITS[s.suit].color) }} />
                      {SUITS[s.suit].name}
                      {s.id === game.meetingBy && <span title="Called the meeting">· 📣</span>}
                    </div>
                    {verdict && (
                      <div className="mt-1 flex flex-wrap gap-0.5">
                        {votersFor(s.id).map((v) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={v.id} src={`/chogs/${v.chogId}.webp`} alt={v.name} title={v.name} className="vote-chip h-4 w-4 rounded-sm object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                  {s.voted && !verdict && <span className="display rounded bg-up/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-up">Voted</span>}
                  {isPicked && (
                    <div className="absolute inset-y-0 right-1 flex items-center gap-1">
                      <button type="button" onClick={(e) => (e.stopPropagation(), vote(s.id))} className="grid h-8 w-8 place-items-center rounded-lg bg-down font-bold text-white" aria-label={`Vote ${s.name}`}>
                        ✓
                      </button>
                      <button type="button" onClick={(e) => (e.stopPropagation(), setPicked(null))} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 font-bold" aria-label="Cancel">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={!voting} onClick={() => vote(SKIP)} className="ghost-btn px-5 py-2 text-sm">
              Skip vote
            </button>
            {myVote && (
              <span className="text-xs text-muted">
                You voted: <b className="text-ink">{myVote === SKIP ? "skip" : seat(myVote)?.name}</b>
              </span>
            )}
            {verdict && (
              <div className="flex items-center gap-1 text-xs text-muted">
                Skipped:
                {votersFor(SKIP).map((v) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={v.id} src={`/chogs/${v.chogId}.webp`} alt={v.name} title={v.name} className="vote-chip h-4 w-4 rounded-sm object-cover" />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Chat */}
        <section className={`meeting-panel flex flex-col rounded-2xl md:w-[340px] ${chatOpen ? "min-h-[300px]" : ""}`}>
          <button type="button" onClick={() => setChatOpen((o) => !o)} className="flex items-center justify-between px-4 py-3 md:pointer-events-none">
            <span className="display text-xs font-bold uppercase tracking-widest text-muted">Chat</span>
            <span className="text-xs text-muted md:hidden">
              {lines.length} {chatOpen ? "▾" : "▸"}
            </span>
          </button>
          {chatOpen && (
            <>
              <div ref={log} className="max-h-[38vh] flex-1 space-y-2 overflow-y-auto px-4 md:max-h-none">
                {lines.length === 0 && <p className="text-xs text-muted">No one has said anything yet.</p>}
                {lines.map((l) => {
                  const s = seat(l.from);
                  return (
                    <div key={l.key} className="chat-in flex items-start gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {s && <img src={`/chogs/${s.chogId}.webp`} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-md object-cover" />}
                      <div className="min-w-0 text-[13px] leading-snug">
                        <b style={{ color: s ? hex(SUITS[s.suit].color) : undefined }}>{s?.name ?? "?"}</b>{" "}
                        <span className="break-words text-ink/90">{l.text}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {canAct && game.meetingStage !== "result" && (
                <div className="border-t border-white/10 p-3">
                  <div className="mb-2 flex flex-wrap gap-1">
                    {QUICK_CHAT.map((q) => {
                      const needsName = q.includes("{name}");
                      if (needsName && !pickedName) return null;
                      const t = q.replace("{name}", pickedName ?? "");
                      return (
                        <button key={q} type="button" onClick={() => send(t)} className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] ring-1 ring-white/10 hover:bg-white/15">
                          {t}
                        </button>
                      );
                    })}
                    {!pickedName && <span className="px-1 py-1 text-[10px] text-muted">Tap a Chog for more phrases</span>}
                  </div>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(text);
                    }}
                  >
                    <input value={text} maxLength={CHAT_MAX} onChange={(e) => setText(e.target.value)} placeholder="Say something…" className="field w-0 flex-1 text-sm" />
                    <button type="submit" className="ghost-btn px-4 py-2 text-sm">
                      Send
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** The firing: the voted-out Chog walks off screen while the verdict types out. */
function Firing({ game, verdict }: { game: GameSnapshot; verdict: Verdict }) {
  const s = game.seats.find((x) => x.id === verdict.fired);
  const line1 = s ? `${s.name} was fired.` : "Nobody was fired.";
  const line2 = s ? `They were ${verdict.wasRugger ? "" : "not "}The Rugger.` : "Skipped.";
  const line3 = `${verdict.ruggersLeft} Rugger${verdict.ruggersLeft === 1 ? "" : "s"} remain${verdict.ruggersLeft === 1 ? "s" : ""}.`;
  const full = `${line1}\n${line2}\n${line3}`;
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((k) => Math.min(full.length, k + 1)), 45);
    return () => clearInterval(t);
  }, [full]);
  useEffect(() => {
    if (s && verdict.wasRugger) sfx.win();
  }, [s, verdict.wasRugger]);
  const shown = full.slice(0, n).split("\n");

  return (
    <div className="firing pointer-events-auto absolute inset-0 z-40 grid place-items-center overflow-hidden">
      <div className="firing-exit display">EXIT</div>
      <div className="firing-floor" />
      {s && (
        <div className="fired-walk absolute top-[30%]">
          <ChogDev chogId={s.chogId} color={SUITS[s.suit].color} className="w-[clamp(90px,14vw,150px)]" />
          <div className="fired-box display mx-auto -mt-4 w-16 rounded-sm px-1 py-0.5 text-center text-[8px] font-bold text-black/70">MY STUFF</div>
        </div>
      )}
      <div className="relative mt-[22vh] px-4 text-center">
        {shown.map((l, i) => (
          <p key={i} className={`display ${i === 0 ? "text-[clamp(22px,4vw,40px)] font-bold text-white" : i === 1 ? `mt-2 text-[clamp(16px,2.6vw,26px)] ${verdict.wasRugger ? "text-down" : "text-white/80"}` : "mt-4 text-sm uppercase tracking-[0.3em] text-muted"}`}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}
