# Among Chogs

**There are Ruggers among us.**

A social deduction party game for Chogathon 2026. Among Us in a crypto office: the devs build and launch a
memecoin, and a few secret **Ruggers** try to rug it before it ships. Your **Chog NFT** is your dev.

- **Play the demo (free, no wallet):** https://among-chogs-demo.vercel.app
- **Play on Monad testnet (wallet + Chog + test $CHOG stake):** https://among-chogs.vercel.app

## How it plays

- 4 to 15 Chogs in Chog Labs HQ, an office at night. 1 to 3 of them are secretly **Ruggers**. Ruggers know each
  other. Nobody else knows anything.
- Every task station has two levers. **Green** is the real dev task and fills the **Launch Meter**. **Red** is the rug:
  it marks the station as tampered and fills a hidden Rug Meter. A red pull looks and sounds different, so anyone
  who sees it knows.
- Devs can **fix** tampered stations. Ruggers fake green pulls to blend in, use **vents**, and call **sabotage**:
  Blackout (devs' vision shrinks) or Server meltdown (two devs must hold two consoles at once).
- Enough tampering unlocks the **Liquidity Room**. Only Ruggers can walk in. Holding the big lever for 15 seconds
  drains the liquidity. Any dev can hit the **alarm** by the door to stop it.
- **Meetings:** hit the emergency button or the alarm, discuss in chat (with one-tap phrases for phones), then vote.
  The Chog with the most votes is **fired** and carries their box out of the office. No kills, no ghosts: fired
  players spectate.
- **Devs win** when the Launch Meter hits 100% or every Rugger is fired.
  **Ruggers win** when the liquidity is drained, the launch deadline passes, or they match the devs in number.

## Why the Chog NFT matters

Your Chog is your seat at the table. On testnet you sign in with your wallet, and the server checks `ownerOf` on
Chog Genesis (Monad mainnet) before you can join. No Chog, no seat. One Chog can only be in a match once. Your Chog's
art is your character's face, your card in meetings, and your face on the firing screen, so the whole social game
(who did you see, who do you trust) is played through the NFTs.

## $CHOG

On testnet every player stakes **100 test $CHOG** into the **ChogPot** contract before the match. When the match
ends, the server settles the pot and the winning side (devs or Ruggers) splits it equally on-chain. Players who leave
the lobby after staking are refunded.

| | Address (Monad testnet) |
|---|---|
| ChogPot | `0x6ca76a4143915A6A92edd2Fb7B49dBDeB3662e08` |
| Test $CHOG (faucet 1,000/hour) | `0x6b9C05ff1dDA77454D3C5F2A0136D2BE71b2fFc9` |
| Chog Genesis (Monad **mainnet**, ownership check) | `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` |

## Testing it

**Demo (fastest):** open https://among-chogs-demo.vercel.app, pick any Chog, choose **Host private**, open
**Lobby settings**, add AI Chogs, then **Launch**. The AI Chogs play both sides: they do tasks, pull red levers,
sabotage, call meetings, accuse and vote. The game server sleeps when idle, so the first join can take about a minute.

**Testnet:** open https://among-chogs.vercel.app with a wallet that holds a Chog, sign the free login message, and
pick your Chog. In the lobby, tap **Stake 100 test $CHOG** (it handles faucet, approve and enter). You need a little testnet MON for gas
(https://faucet.monad.xyz). The match starts when 4+ players have staked.

**Controls:** WASD or arrows to move, `E` task / fix / use, `Q` red lever (Ruggers), `F` sabotage (Ruggers).
On phones: drag on the left side to move, buttons for the rest.

## Tech stack

| Part | Tech |
|---|---|
| Game client | Phaser 3 + TypeScript inside Next.js 16 (App Router), Tailwind |
| Multiplayer | Colyseus 0.18, server-authoritative (movement replayed through shared physics, roles sent privately) |
| Vision | Raycast fog of war with a visibility polygon |
| Wallet / NFT | wagmi + viem on Monad: signed login, mainnet `ownerOf` |
| Contracts | Solidity + Foundry (`contracts/`), ChogPot with tests |
| AI Chogs | Server-side bots with pathfinding, memory of what they saw, and voting heuristics |
| Hosting | Vercel (two sites from one codebase via `NEXT_PUBLIC_MODE`), Render (game server) |

```
web/        Next.js + Phaser client (web/src/shared is also used by the server)
server/     Colyseus game server
contracts/  ChogPot (Foundry)
```

## Running locally

```bash
cd server && pnpm install && pnpm dev          # game server on :2567
cd web && pnpm install && pnpm dev --port 3004 # open http://localhost:3004
```

The server needs `SETTLER_KEY` and `MONAD_TESTNET_RPC` in `server/.env` for testnet matches. The web app reads
`NEXT_PUBLIC_MODE` (`demo` or `live`) and `NEXT_PUBLIC_SERVER_URL`.

## Pre-existing work

All game code was written during Chogathon 2026. Reused: the Chog Genesis art and trait data (mirrored from IPFS), the
TestChog test token on Monad testnet (also used by Chog Verse), OpenZeppelin contracts, forge-std, and the open-source
libraries above.
