// Which version of Among Chogs this site is. Each mode is its own deploy (NEXT_PUBLIC_MODE), like chog-1.
// demo: guest pass, any Chog, AI Chogs fill seats, free.
// live: Monad testnet. Wallet login, only Chogs you own, real players only, everyone stakes test $CHOG,
//       the winning side splits the pot.
export type Mode = "demo" | "live";

const ENV_MODE: Mode = process.env.NEXT_PUBLIC_MODE === "live" ? "live" : "demo";

/** The current mode. Dev builds also take `?mode=live|demo` so one local server can show both. */
export function getMode(): Mode {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("mode");
    if (q === "live" || q === "demo") return q;
  }
  return ENV_MODE;
}

/** Link to the other mode's site (or, in dev, the same site with `?mode=`). */
export function otherModeUrl(mode: Mode) {
  const other = mode === "live" ? "demo" : "live";
  const env = mode === "live" ? process.env.NEXT_PUBLIC_DEMO_URL : process.env.NEXT_PUBLIC_LIVE_URL;
  if (env) return env;
  if (process.env.NODE_ENV !== "production") return `?mode=${other}`;
  return "";
}

export const MODE_LABEL: Record<Mode, string> = { demo: "Demo", live: "Testnet" };
