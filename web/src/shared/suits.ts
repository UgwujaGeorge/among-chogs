// Suit colors. Each seat in a match gets one, so players can say "I saw Pink at the red lever".

export const SUITS = [
  { name: "Purple", color: 0x836ef9 },
  { name: "Pink", color: 0xff4fb8 },
  { name: "Cyan", color: 0x3fd8ff },
  { name: "Lime", color: 0x8bf74a },
  { name: "Gold", color: 0xffc23d },
  { name: "Orange", color: 0xff7a3d },
  { name: "Red", color: 0xf2384f },
  { name: "White", color: 0xe8e6f5 },
  { name: "Black", color: 0x34304a },
  { name: "Teal", color: 0x1fc9a6 },
  { name: "Blue", color: 0x3d6bff },
  { name: "Brown", color: 0x9a6a45 },
  { name: "Mint", color: 0xa8ffd8 },
  { name: "Maroon", color: 0x8c1d42 },
  { name: "Olive", color: 0x9a9a30 },
] as const;

export const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
