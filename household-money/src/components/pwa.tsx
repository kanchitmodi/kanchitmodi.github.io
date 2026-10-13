"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((e) => console.warn("SW registration failed", e));
  }, []);
  return null;
}

/** Clears the offline cache (call on logout so cached financial data doesn't outlive the session). */
export async function clearOfflineCache() {
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHE" });
}

const DISMISS_KEY = "hm_install_dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** Add-to-Home-Screen prompt: native prompt where supported, instructions on iOS Safari. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (dismissed || isStandalone()) return;
    if (isIosSafari()) {
      setIos(true);
      setHidden(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  return (
    <div
      role="region"
      aria-label="Install app"
      className="card mb-4 flex items-center gap-3 p-3 text-sm"
      data-testid="install-prompt"
    >
      <div className="flex-1">
        <div className="font-semibold">Install Household Money</div>
        <div className="text-text-2">
          {ios ? (
            <>
              Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> for Face ID and
              notifications.
            </>
          ) : (
            "Add it to your home screen for one-tap access."
          )}
        </div>
      </div>
      {deferred && (
        <button
          className="btn btn-primary"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            dismiss();
          }}
        >
          Install
        </button>
      )}
      <button
        className="tap rounded-lg text-text-3"
        aria-label="Dismiss install prompt"
        onClick={dismiss}
      >
        ✕
      </button>
    </div>
  );
}

/** Banner shown when the device is offline: data is from the last sync. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="status"
      className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-2"
    >
      ⚠ Offline — showing data from your last sync.
    </div>
  );
}
