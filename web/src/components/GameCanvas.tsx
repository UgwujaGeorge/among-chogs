"use client";

import { useEffect, useRef } from "react";
import type { SceneConfig } from "@/game/MainScene";

/** Mounts the Phaser game full-screen. The canvas renders at device resolution for crisp art. */
export function GameCanvas({ config }: { config: SceneConfig | null }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!config || !host.current) return;
    let cancelled = false;
    let game: import("phaser").Game | null = null;
    let onResize: (() => void) | null = null;

    (async () => {
      const Phaser = await import("phaser");
      const { MainScene } = await import("@/game/MainScene");
      const font = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
      // Canvas text needs the web font loaded first. A failed load just falls back.
      const family = font.split(",")[0];
      await Promise.all([document.fonts.load(`700 20px ${family}`), document.fonts.load(`500 20px ${family}`)]).catch(() => {});
      if (cancelled || !host.current) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current,
        width: window.innerWidth * dpr,
        height: window.innerHeight * dpr,
        backgroundColor: "#06040d",
        scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
        render: { antialias: true, powerPreference: "high-performance" },
        input: { activePointers: 3 },
        banner: false,
      });
      game.registry.set("cfg", { ...config, font, dpr });
      game.scene.add("main", MainScene, true);
      if (process.env.NODE_ENV !== "production") Object.assign(window, { __game: game });

      onResize = () => {
        game?.scale.resize(window.innerWidth * dpr, window.innerHeight * dpr);
        game?.scale.setZoom(1 / dpr);
      };
      window.addEventListener("resize", onResize);
    })();

    return () => {
      cancelled = true;
      if (onResize) window.removeEventListener("resize", onResize);
      game?.destroy(true);
    };
  }, [config]);

  return <div ref={host} className="absolute inset-0" />;
}
