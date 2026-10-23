import { createPublicClient, createWalletClient, getAddress, http, keccak256, toHex, verifyMessage, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad, monadTestnet } from "viem/chains";
import { CHOG_NFT, ENTRY_FEE, LOGIN_TTL_MS, POT_ADDRESS, loginMessage, nftAbi, potAbi } from "../../web/src/shared/chain";

// Chain access for testnet rooms: wallet logins, Chog ownership (Monad mainnet), and the stake pot (Monad testnet).

const mainnet = createPublicClient({ chain: monad, transport: http(process.env.MONAD_RPC) });
const testnet = createPublicClient({ chain: monadTestnet, transport: http(process.env.MONAD_TESTNET_RPC) });

const settlerKey = process.env.SETTLER_KEY as `0x${string}` | undefined;
const settler = settlerKey
  ? createWalletClient({ account: privateKeyToAccount(settlerKey), chain: monadTestnet, transport: http(process.env.MONAD_TESTNET_RPC) })
  : null;

/** Checks a login signature and that it's recent. Returns the checksummed wallet, or an error message. */
export async function verifyLogin(wallet: unknown, issuedAt: unknown, signature: unknown): Promise<Address | string> {
  if (typeof wallet !== "string" || typeof signature !== "string" || typeof issuedAt !== "number") return "Connect your wallet first";
  if (Date.now() - issuedAt > LOGIN_TTL_MS || issuedAt > Date.now() + 60_000) return "Login expired, sign in again";
  try {
    const address = getAddress(wallet);
    const ok = await verifyMessage({ address, message: loginMessage(address, issuedAt), signature: signature as `0x${string}` });
    return ok ? address : "Bad wallet signature";
  } catch {
    return "Bad wallet signature";
  }
}

/** Fresh ownerOf read on Monad mainnet. */
export async function ownsChog(wallet: string, chogId: number) {
  try {
    const owner = await mainnet.readContract({ address: CHOG_NFT, abi: nftAbi, functionName: "ownerOf", args: [BigInt(chogId)] });
    return owner.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

/** A fresh, unique match id for the pot contract. */
export function newMatchId(roomId: string) {
  return keccak256(toHex(`${roomId}:${Date.now()}:${Math.random()}`));
}

/** Who staked this Chog in this match (zero address if nobody). */
export async function stakedBy(matchId: string, chogId: number) {
  return testnet.readContract({ address: POT_ADDRESS, abi: potAbi, functionName: "entrant", args: [matchId as `0x${string}`, BigInt(chogId)] });
}

export const canPay = () => !!settler;

/** Pays the pot to the winners. Returns the tx hash and what each got (whole test $CHOG). */
export async function settle(matchId: string, winners: Address[]) {
  if (!settler) throw new Error("No settler key on the game server");
  const pot = await testnet.readContract({ address: POT_ADDRESS, abi: potAbi, functionName: "pot", args: [matchId as `0x${string}`] });
  const hash = await settler.writeContract({ address: POT_ADDRESS, abi: potAbi, functionName: "settle", args: [matchId as `0x${string}`, winners] });
  await testnet.waitForTransactionReceipt({ hash });
  return { txHash: hash, each: Number(pot / BigInt(winners.length)) / 1e18 };
}

/** Gives a Chog's stake back. */
export async function refund(matchId: string, chogId: number) {
  if (!settler) return;
  const hash = await settler.writeContract({ address: POT_ADDRESS, abi: potAbi, functionName: "refund", args: [matchId as `0x${string}`, BigInt(chogId)] });
  await testnet.waitForTransactionReceipt({ hash });
}

export { ENTRY_FEE };
