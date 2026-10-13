"use client";

import { useEffect, useRef } from "react";

export const IDLE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;

/**
 * Client half of auto-lock: after 5 minutes without interaction, lock the session and go to /lock.
 * The server enforces the same rule independently (session-state.ts), so closing the tab or
 * suspending the phone can't bypass it.
 */
export function IdleLock() {
  const last = useRef(Date.now());
  const lastBeat = useRef(Date.now());

  useEffect(() => {
    let locked = false;
    const lock = () => {
      if (locked) return;
      locked = true;
      void fetch("/api/auth/lock", { method: "POST", keepalive: true }).finally(() => {
        window.location.href = "/lock";
      });
    };
    const onActivity = () => {
      const now = Date.now();
      if (now - last.current > IDLE_MS) return lock();
      last.current = now;
      if (now - lastBeat.current > HEARTBEAT_MS) {
        lastBeat.current = now;
        void fetch("/api/auth/activity", { method: "POST" }).then((r) => {
          if (r.status === 401) window.location.href = "/lock";
        });
      }
    };
    const check = () => {
      if (Date.now() - last.current > IDLE_MS) lock();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, 15_000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
