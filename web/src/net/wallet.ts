"use client";

import { createPublicClient, http, parseEther, type Address } from "viem";
import { createConfig, http as wagmiHttp } from "wagmi";
import { injected } from "wagmi/connectors";
import { monad, monadTestnet } from "wagmi/chains";
import { connect, getConnection, readContract, signMessage, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { CHOG_NFT, CHOG_SUPPLY, ENTRY_FEE, POT_ADDRESS, TCHOG_ADDRESS, loginMessage, LOGIN_TTL_MS, nftAbi, potAbi, tchogAbi } from "@/shared/chain";

// Wallet side of testnet mode: sign in, find your Chogs on mainnet, stake test $CHOG into the pot.

export const wagmiConfig = createConfig({
  chains: [monad, monadTestnet],
  connectors: [injected()],
  transports: { [monad.id]: wagmiHttp(), [monadTestnet.id]: wagmiHttp() },
  ssr: true,
});

export type Login = { wallet: Address; issuedAt: number; signature: `0x${string}` };

const LOGIN_KEY = "among-chogs:login";

export function savedLogin(): Login | null {
  try {
    const l = JSON.parse(localStorage.getItem(LOGIN_KEY) ?? "null") as Login | null;
    return l && Date.now() - l.issuedAt < LOGIN_TTL_MS ? l : null;
  } catch {
    return null;
  }
}

export function forgetLogin() {
  try {
    localStorage.removeItem(LOGIN_KEY);
  } catch {
    // ignore
  }
}

/** Connect the browser wallet and sign the free login message. */
export async function signIn(): Promise<Login> {
  if (typeof window === "undefined" || !(window as { ethereum?: unknown }).ethereum) {
    throw new Error("No wallet found. Install MetaMask (or another browser wallet), or try the demo.");
  }
  let wallet = getConnection(wagmiConfig).address;
  if (!wallet) wallet = (await connect(wagmiConfig, { connector: wagmiConfig.connectors[0] })).accounts[0];
  const issuedAt = Date.now();
  const signature = await signMessage(wagmiConfig, { account: wallet, message: loginMessage(wallet, issuedAt) });
  const login = { wallet, issuedAt, signature };
  try {
    localStorage.setItem(LOGIN_KEY, JSON.stringify(login));
  } catch {
    // Private mode: they'll sign again next time.
  }
  return login;
}

const mainnet = createPublicClient({ chain: monad, transport: http(), batch: { multicall: { batchSize: 1024 * 64 } } });

/** Every Chog this wallet holds on Monad mainnet (reads ownerOf for all 1,969 in a few multicalls). */
export async function ownedChogs(wallet: string): Promise<number[]> {
  const w = wallet.toLowerCase();
  const out: number[] = [];
  for (let start = 1; start <= CHOG_SUPPLY; start += 500) {
    const ids = Array.from({ length: Math.min(500, CHOG_SUPPLY - start + 1) }, (_, i) => start + i);
    const res = await mainnet.multicall({
      contracts: ids.map((id) => ({ address: CHOG_NFT, abi: nftAbi, functionName: "ownerOf", args: [BigInt(id)] }) as const),
      allowFailure: true,
    });
    res.forEach((r, k) => {
      if (r.status === "success" && (r.result as string).toLowerCase() === w) out.push(ids[k]);
    });
  }
  return out;
}

const FEE = parseEther(String(ENTRY_FEE));

/**
 * Stakes ENTRY_FEE test $CHOG for this Chog in this match: switch to testnet, claim from the faucet if short,
 * approve, enter. `step` reports progress for the button label.
 */
export async function stake(login: Login, matchId: string, chogId: number, step: (s: string) => void) {
  let account = getConnection(wagmiConfig).address;
  if (!account) account = (await connect(wagmiConfig, { connector: wagmiConfig.connectors[0] })).accounts[0];
  if (account.toLowerCase() !== login.wallet.toLowerCase()) throw new Error("Switch your wallet back to the one you signed in with.");
  if (getConnection(wagmiConfig).chainId !== monadTestnet.id) {
    step("Switching to Monad testnet…");
    await switchChain(wagmiConfig, { chainId: monadTestnet.id });
  }
  const opts = { chainId: monadTestnet.id } as const;
  const balance = await readContract(wagmiConfig, { ...opts, address: TCHOG_ADDRESS, abi: tchogAbi, functionName: "balanceOf", args: [account] });
  if (balance < FEE) {
    step("Claiming test $CHOG…");
    const h = await writeContract(wagmiConfig, { ...opts, address: TCHOG_ADDRESS, abi: tchogAbi, functionName: "faucet" });
    await waitForTransactionReceipt(wagmiConfig, { ...opts, hash: h });
  }
  const allowance = await readContract(wagmiConfig, { ...opts, address: TCHOG_ADDRESS, abi: tchogAbi, functionName: "allowance", args: [account, POT_ADDRESS] });
  if (allowance < FEE) {
    step("Approving…");
    const h = await writeContract(wagmiConfig, { ...opts, address: TCHOG_ADDRESS, abi: tchogAbi, functionName: "approve", args: [POT_ADDRESS, FEE * BigInt(10)] });
    await waitForTransactionReceipt(wagmiConfig, { ...opts, hash: h });
  }
  step("Staking…");
  const h = await writeContract(wagmiConfig, { ...opts, address: POT_ADDRESS, abi: potAbi, functionName: "enter", args: [matchId as `0x${string}`, BigInt(chogId)] });
  await waitForTransactionReceipt(wagmiConfig, { ...opts, hash: h });
}

export const txUrl = (hash: string) => `https://testnet.monadexplorer.com/tx/${hash}`;
