/**
 * Lighthouse gate for public pages (login, offline). Lighthouse 12+ removed the "PWA" category, so
 * installability (manifest, icons, service worker, offline) is asserted by tests/e2e/pwa.spec.ts;
 * here we gate Performance, Accessibility, Best Practices and SEO-free basics at >= 90.
 * Usage: node scripts/lighthouse.mjs http://localhost:3100
 */
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const base = process.argv[2] ?? "http://localhost:3100";
const PAGES = ["/login", "/offline"];
const MIN = { performance: 0.9, accessibility: 0.9, "best-practices": 0.9 };

const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME_PATH,
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
});
let failed = false;
try {
  for (const path of PAGES) {
    const r = await lighthouse(`${base}${path}`, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: Object.keys(MIN),
      formFactor: "mobile",
      screenEmulation: {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        disabled: false,
      },
    });
    for (const [cat, min] of Object.entries(MIN)) {
      const score = r.lhr.categories[cat]?.score ?? 0;
      const ok = score >= min;
      if (!ok) failed = true;
      console.info(
        `${ok ? "✓" : "✗"} ${path} ${cat}: ${Math.round(score * 100)} (min ${min * 100})`,
      );
    }
  }
} finally {
  await chrome.kill();
}
process.exit(failed ? 1 : 0);
