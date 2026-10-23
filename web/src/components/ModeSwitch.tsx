"use client";

import { MODE_LABEL, otherModeUrl, type Mode } from "@/net/mode";

const HINT: Record<Mode, string> = {
  demo: "Solo-friendly demo: any Chog, AI Chogs fill seats, free",
  live: "The real game on Monad testnet: your own Chog, real players, stake test $CHOG, winners split the pot",
};

/** Demo / Testnet toggle. Each mode is its own site, so the other side is a link to it. */
export function ModeSwitch({ mode, className = "" }: { mode: Mode; className?: string }) {
  const other: Mode = mode === "live" ? "demo" : "live";
  const url = otherModeUrl(mode);
  return (
    <div className={`display flex items-center rounded-full bg-black/60 p-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-white/15 backdrop-blur ${className}`}>
      {(["demo", "live"] as const).map((m) =>
        m === mode ? (
          <span key={m} title={HINT[m]} className={`rounded-full px-3 py-1 ${m === "live" ? "bg-up text-black" : "bg-gold text-black"}`}>
            {MODE_LABEL[m]}
          </span>
        ) : url ? (
          <a key={m} href={url} title={HINT[m]} className="rounded-full px-3 py-1 text-muted transition hover:text-ink">
            {MODE_LABEL[other]}
          </a>
        ) : (
          <span key={m} title={`${HINT[m]} (not linked yet)`} className="cursor-not-allowed rounded-full px-3 py-1 text-white/25">
            {MODE_LABEL[m]}
          </span>
        ),
      )}
    </div>
  );
}
