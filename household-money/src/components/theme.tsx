"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const KEY = "hm_theme";

/** Runs before paint (inline, with CSP nonce) to avoid a light/dark flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

function apply(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    let t: Theme = "system";
    try {
      t = (localStorage.getItem(KEY) as Theme) || "system";
    } catch {}
    setTheme(t);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let cur: Theme = "system";
      try {
        cur = (localStorage.getItem(KEY) as Theme) || "system";
      } catch {}
      if (cur === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const label: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };
  return (
    <button
      type="button"
      className="tap inline-flex items-center justify-center rounded-lg px-2 text-sm font-medium text-text-2 hover:bg-surface-2"
      aria-label={`Theme: ${label[theme]}. Switch to ${label[next[theme]]}`}
      onClick={() => {
        const t = next[theme];
        setTheme(t);
        try {
          localStorage.setItem(KEY, t);
        } catch {}
        apply(t);
      }}
    >
      <ThemeIcon theme={theme} />
      <span className="ml-1 hidden sm:inline">{label[theme]}</span>
    </button>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const d =
    theme === "dark"
      ? "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
      : theme === "light"
        ? "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
        : "M12 3a9 9 0 1 0 0 18V3zM12 3a9 9 0 0 1 0 18";
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
