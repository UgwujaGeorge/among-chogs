// On-chain bits shared by the web client and the game server: the Chog NFT (Monad mainnet) and the stake pot
// (Monad testnet). Addresses are public; env vars can override them for a redeploy.

import { parseAbi } from "viem";

/** Chog Genesis on Monad mainnet. Not ERC-721 Enumerable: find a wallet's Chogs by reading ownerOf. */
export const CHOG_NFT = "0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763" as const;
export const CHOG_SUPPLY = 1969;

/** chog-1's test $CHOG (faucet: 1,000 per hour), shared so one faucet works for both games. */
export const TCHOG_ADDRESS = (process.env.NEXT_PUBLIC_TCHOG_ADDRESS ?? "0x6b9C05ff1dDA77454D3C5F2A0136D2BE71b2fFc9") as `0x${string}`;
/** ChogPot: holds each match's stakes and pays the winning side. */
export const POT_ADDRESS = (process.env.NEXT_PUBLIC_POT_ADDRESS ?? "0x6ca76a4143915A6A92edd2Fb7B49dBDeB3662e08") as `0x${string}`;
/** Stake per Chog per match, in whole test $CHOG. */
export const ENTRY_FEE = 100;

export const nftAbi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);

export const potAbi = parseAbi([
  "function enter(bytes32 matchId, uint256 chogId)",
  "function entryFee() view returns (uint256)",
  "function pot(bytes32 matchId) view returns (uint256)",
  "function entrant(bytes32 matchId, uint256 chogId) view returns (address)",
  "function settled(bytes32 matchId) view returns (bool)",
  "function settle(bytes32 matchId, address[] winners)",
  "function refund(bytes32 matchId, uint256 chogId)",
]);

export const tchogAbi = parseAbi([
  "function faucet()",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/** What a player signs to prove the wallet is theirs. The server checks the signature and that it's recent. */
export function loginMessage(wallet: string, issuedAt: number) {
  return `Among Chogs login\n\nWallet: ${wallet.toLowerCase()}\nIssued: ${new Date(issuedAt).toISOString()}\n\nSigning is free and does not send a transaction.`;
}

/** Logins older than this need a fresh signature. */
export const LOGIN_TTL_MS = 12 * 60 * 60 * 1000;
