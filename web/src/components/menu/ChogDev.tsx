import { useId } from "react";
import { hex } from "@/shared/suits";

/** Mix a 0xRRGGBB color toward black (k < 1) or white (k > 1). */
function tone(c: number, k: number) {
  const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1)));
  return `rgb(${ch.join(",")})`;
}

/**
 * Vector Chog dev, same design as the in-game sprite (game/textures.ts makeCharacter): the NFT as a round head,
 * headphones, a hoodie in the suit color with a lanyard badge, jeans and sneakers. Faces right; flip with CSS.
 */
export function ChogDev({ chogId, color, className, style }: { chogId: number; color: number; className?: string; style?: React.CSSProperties }) {
  const id = useId().replace(/:/g, "");
  const ink = "#0b0716";
  return (
    <svg viewBox="0 0 128 156" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={tone(color, 1.18)} />
          <stop offset="0.55" stopColor={hex(color)} />
          <stop offset="1" stopColor={tone(color, 0.6)} />
        </linearGradient>
        <radialGradient id={`s${id}`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#0a001e" stopOpacity="0.35" />
        </radialGradient>
        <clipPath id={`h${id}`}>
          <circle cx="64" cy="46" r="38" />
        </clipPath>
      </defs>
      <g stroke={ink} strokeWidth="4" strokeLinejoin="round">
        {/* Legs + sneakers */}
        {[44, 68].map((x) => (
          <g key={x}>
            <rect x={x} y="120" width="17" height="26" rx="6" fill="#2b3a66" />
            <rect x={x - 2} y="140" width="25" height="12" rx="6" fill="#f2f0f8" />
          </g>
        ))}
        {/* Back arm, hoodie, pocket, hood */}
        <rect x="24" y="88" width="16" height="34" rx="8" fill={tone(color, 0.6)} />
        <rect x="30" y="80" width="68" height="50" rx="18" fill={`url(#b${id})`} />
        <rect x="44" y="108" width="40" height="14" rx="6" fill={tone(color, 0.75)} stroke="none" />
        <ellipse cx="64" cy="84" rx="30" ry="10" fill={tone(color, 0.7)} />
      </g>
      {/* Drawstrings, lanyard, badge */}
      <path d="M56 90l-1 14M72 90l1 14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="M52 88l18 16 10-16" stroke="#836ef9" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="64" y="102" width="14" height="17" rx="3" fill="#fff" stroke={ink} strokeWidth="2" />
      <rect x="66" y="104" width="10" height="4" fill="#836ef9" />
      {/* Front arm + hand */}
      <rect x="88" y="88" width="16" height="32" rx="8" fill={tone(color, 0.9)} stroke={ink} strokeWidth="4" />
      <circle cx="96" cy="122" r="7" fill="#f4ead9" stroke={ink} strokeWidth="4" />
      {/* Head: the Chog NFT */}
      <circle cx="64" cy="46" r="38" fill="#1b1433" />
      <image href={`/chogs/${chogId}.webp`} x="17" y="-1" width="94" height="94" preserveAspectRatio="xMidYMid slice" clipPath={`url(#h${id})`} />
      <circle cx="64" cy="46" r="38" fill={`url(#s${id})`} />
      <circle cx="64" cy="46" r="38" fill="none" stroke={ink} strokeWidth="4" />
      {/* Headphones */}
      <path d="M24.6 37a43 43 0 0 1 78.8 0" fill="none" stroke={ink} strokeWidth="7" strokeLinecap="round" />
      <path d="M26 35a43 43 0 0 1 76 0" fill="none" stroke={tone(color, 1.15)} strokeWidth="3.5" strokeLinecap="round" />
      {[22, 106].map((x) => (
        <g key={x}>
          <rect x={x - 8} y="34" width="16" height="28" rx="7" fill="#2a2340" stroke={ink} strokeWidth="3" />
          <rect x={x - 4} y="40" width="8" height="16" rx="4" fill={hex(color)} />
        </g>
      ))}
    </svg>
  );
}
