"use client";

import { useEffect, useState } from "react";
import { CODE_LENGTH, normalizeCode, type JoinOptions } from "@/shared/protocol";
import { createPrivate, friendlyError, joinCode, quickPlay, type GameRoom } from "@/net/net";
import { getMode } from "@/net/mode";
import { forgetLogin, ownedChogs, savedLogin, signIn, type Login } from "@/net/wallet";

export const TOTAL_CHOGS = 1969;
export const randomChog = () => 1 + Math.floor(Math.random() * TOTAL_CHOGS);

export type Busy = "quick" | "create" | "join" | "wallet" | null;

export type MenuProps = {
  initial: { name: string; chogId: number; code: string; suit: number };
  error: string | null;
  onJoined: (room: GameRoom, me: JoinOptions) => void;
};

/**
 * Everything the title screen does, independent of how it looks.
 * Demo: pick any Chog. Testnet: sign in with a wallet and pick from the Chogs it holds.
 */
export function useMenu({ initial, error: initialError, onJoined }: MenuProps) {
  const [mode] = useState(getMode);
  const live = mode === "live";
  const [name, setName] = useState(initial.name);
  const [chogId, setChog] = useState(initial.chogId);
  const [suit, setSuit] = useState(initial.suit);
  const [code, setCodeRaw] = useState(initial.code);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState(initialError);
  const [login, setLogin] = useState<Login | null>(() => (live ? savedLogin() : null));
  /** Testnet: the wallet's Chogs. null = not loaded yet. */
  const [owned, setOwned] = useState<number[] | null>(null);

  // Testnet: load the signed-in wallet's Chogs and start on one of them.
  useEffect(() => {
    if (!live || !login) return;
    let cancelled = false;
    ownedChogs(login.wallet)
      .then((ids) => {
        if (cancelled) return;
        setOwned(ids);
        setChog((c) => (ids.includes(c) ? c : ids[0] ?? c));
      })
      .catch(() => !cancelled && setError("Couldn't read your Chogs from Monad. Try again."));
    return () => {
      cancelled = true;
    };
  }, [live, login]);

  const setChogId = (n: number) => {
    if (!Number.isInteger(n) || n < 1 || n > TOTAL_CHOGS) return;
    if (live && owned && !owned.includes(n)) return;
    setChog(n);
  };

  /** Next/previous Chog: any of the 1,969 in demo, only yours on testnet. */
  const step = (dir: 1 | -1) => {
    if (live) {
      if (!owned?.length) return;
      const i = owned.indexOf(chogId);
      setChog(owned[(i + dir + owned.length) % owned.length]);
    } else setChog((id) => ((id - 1 + dir + TOTAL_CHOGS) % TOTAL_CHOGS) + 1);
  };

  async function connectWallet() {
    if (busy) return;
    setBusy("wallet");
    setError(null);
    try {
      setOwned(null);
      setLogin(await signIn());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  function disconnect() {
    forgetLogin();
    setLogin(null);
    setOwned(null);
  }

  async function go(kind: "quick" | "create" | "join") {
    if (busy) return;
    if (kind === "join" && normalizeCode(code).length !== CODE_LENGTH) {
      setError(`Room codes are ${CODE_LENGTH} letters.`);
      return;
    }
    if (live && (!login || !owned?.includes(chogId))) {
      setError(login ? "Pick one of your Chogs." : "Connect your wallet to play on testnet.");
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const o: JoinOptions = { name: name.trim() || `Chog #${chogId}`, chogId, suit, ...(live && login ? login : {}) };
      const room = kind === "quick" ? await quickPlay(o) : kind === "create" ? await createPrivate(o) : await joinCode(code, o);
      onJoined(room, o);
    } catch (e) {
      const msg = friendlyError(e);
      // A stale or rejected login: make them sign again.
      if (/login|signature/i.test(msg)) disconnect();
      setError(msg);
      setBusy(null);
    }
  }

  return {
    mode,
    live,
    login,
    owned,
    connectWallet,
    disconnect,
    name,
    setName,
    chogId,
    setChogId,
    prev: () => step(-1),
    next: () => step(1),
    shuffle: () => (live ? owned?.length && setChog(owned[Math.floor(Math.random() * owned.length)]) : setChog(randomChog())),
    suit,
    setSuit,
    code,
    setCode: (s: string) => setCodeRaw(normalizeCode(s)),
    busy,
    error,
    go,
  };
}

export type MenuApi = ReturnType<typeof useMenu>;
