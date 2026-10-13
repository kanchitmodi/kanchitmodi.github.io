# Household Money

A private, AI-integrated finance dashboard for a two-person household in Ontario. It works as a
responsive website and as an installable iPhone app (PWA).

**Setup:** see [docs/SETUP.md](docs/SETUP.md), which is also available in the app at
**Settings › Setup**.

## Build status

| Stage | Scope                                                                                                           | Status                |
| ----- | --------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1     | App shell, PWA, auth (password + TOTP + passkeys, auto-lock), household & invites, privacy model, demo data, CI | ✅ done               |
| 2     | CSV/PDF import (all institutions), transactions, categorization                                                 | ✅ done               |
| 3     | Dashboard, budgets, monthly report                                                                              |                       |
| 4     | Rogers Gmail alert ingestion                                                                                    | needs Setup step 4    |
| 5     | Plaid                                                                                                           | needs Setup steps 0–4 |
| 6     | SnapTrade + Questrade/IBKR fallbacks, FX                                                                        |                       |
| 7     | Data QA, Health dashboard, scheduled QA                                                                         |                       |
| 8     | Pro visuals                                                                                                     |                       |
| 9     | Credit card database + optimizer                                                                                |                       |
| 10    | AI advisor + "Ask your money"                                                                                   |                       |
| 11    | Investment analysis                                                                                             |                       |
| 12    | Push notifications, PDF/email reports, polish                                                                   |                       |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict, `noUncheckedIndexedAccess`) · Tailwind 4 ·
PostgreSQL + Prisma 6 · SimpleWebAuthn (passkeys) · otplib (TOTP) · Anthropic SDK · Vitest ·
Playwright + axe · Lighthouse. Charts (Recharts and D3) arrive in Stage 3/8.

## Architecture (Stage 1)

```
config/connections.ts      Config-driven bank/card/broker plan (Plaid Items budget, flaky flags)
config/setup-steps.ts      Setup wizard steps (mirrors docs/SETUP.md)
src/lib/permissions.ts     THE visibility rules: account access, scope, joint split (pure)
src/lib/data.ts            The only place accounts/transactions are read (enforces permissions)
src/lib/finance.ts         Deterministic money math (net worth, cash flow, savings rate)
src/lib/session*.ts        DB sessions, MFA state, 5-minute idle lock
src/lib/crypto.ts          AES-256-GCM (ENCRYPTION_KEY), token hashing
src/lib/demo/              Deterministic demo generator + seeder (golden dataset)
src/lib/integrations/      Connection tests: Plaid, SnapTrade, Claude, Gmail, Bank of Canada
src/middleware.ts          Per-request CSP nonce, auth gate
public/sw.js               Service worker: offline cache of last-synced data
```

### Import & categorization (Stage 2)

- **Import** (`/import`): CSV auto-detection for Wealthsimple (cash + credit card), TD, CIBC,
  Scotiabank (current + legacy), PC Financial, Rogers, Questrade, IBKR (activity statement + Flex),
  plus a header-guessing fallback; PDF statements via text extraction with a row-by-row preview.
  Files are parsed in memory and never stored; parsed preview rows are deleted on commit.
- **Dedupe** on (account, date, amount, normalized merchant) with multiset semantics (two
  identical coffees on the same day are both kept) against rows from every source; re-importing
  a file is idempotent.
- **Transfers**: card payments and moves between your own accounts (including joint) are paired
  and excluded from spending; one-sided legs are flagged until the other side arrives.
- **Categorization**: your corrections (rules) → built-in Canadian merchant rules
  (`config/category-rules.ts`) → statement hints → Claude fallback (merchant names only,
  cached, monthly cap) → review queue for anything below 70% confidence. Rules learned from a
  private account are private to their creator.
- **Transactions**: search (merchant, statement text, notes), filters, review queue, splits,
  notes, comments, transfer toggle, and per-field history with who changed what.

### Privacy model

- Each account has an owner (Kanchit, Wife or Joint) and a visibility. **Shared** is the default.
  **Private** comes in two modes: _balance only_, where the other person sees only a redacted
  "Private account" balance, or _hidden_, where it doesn't exist for them, including in net worth
  totals. Only the account's owner can change this. Joint accounts are always shared.
- Every read of accounts or transactions goes through `src/lib/data.ts`. Requests for a private
  account's transactions return nothing, and search can't surface private merchants. Hidden IDs
  return 404, not 403. Permission tests cover this at the unit, integration (real Postgres) and
  E2E (UI + API) levels.
- Being household **owner** doesn't override a member's privacy.

### Security

- Login is email + password (bcrypt), then **TOTP** (required). A **passkey (Face ID)** can sign
  in or unlock on its own.
- Sessions are DB-backed and the cookie holds only an opaque, hashed token. Sessions lock after
  **5 minutes idle**; the client timer and the server check enforce this independently.
- Rate limits: 5 failed logins per email or 30 per IP in 15 minutes, plus a separate TOTP
  attempt limit.
- TOTP secrets (and, later, provider tokens) are encrypted with AES-256-GCM.
- Strict CSP with per-request nonces, HSTS, `X-Frame-Options: DENY`, no third-party scripts or
  analytics.
- An audit log of sign-ins, invites, visibility changes, setup tests and data export/delete is
  visible to both members.
- Secrets live only in environment variables.

### PWA

The PWA has a manifest, maskable icons and an Apple touch icon. Its service worker serves pages
and `/api/{summary,accounts,transactions}` network-first, with the last-synced copy as an offline
fallback, and the cache is cleared on sign-out. It also includes an Add-to-Home-Screen prompt
(native, plus iOS Safari instructions), safe-area insets, a bottom tab bar on phones, 44px+ tap
targets, light/dark/auto themes, and no hover-only UI.

## Demo data

`DEMO_MODE=true npm run db:seed` creates the "Modi Household": 16 accounts mirroring the real
plan and about 700 transactions over 12 months. It includes one _balance-only_ private card
(Wife's PC Mastercard) and one _hidden_ card (Kanchit's CIBC). The generator is deterministic.
`tests/unit/golden-demo.test.ts` pins the exact totals, so CI fails if the money math drifts.

Logins: `kanchit@demo.local` / `wife@demo.local`, password `demo-password-123`. TOTP secrets are
`JBSWY3DPEHPK3PXP` and `KRSXG5CTMVRXEZLU`.

## Tests

| Command                    | What                                                                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run qa`               | typecheck + ESLint + Prettier + unit tests (crypto, TOTP, sessions, permissions, money math, config, golden dataset, mocked Plaid/SnapTrade/Claude/FX)                                                         |
| `npm run test:integration` | real Postgres: sign-up/invite flows, rate limiting, privacy through the data layer                                                                                                                             |
| `npm run test:e2e`         | Playwright on desktop Chrome and iPhone (WebKit in CI): login/2FA, auto-lock, switcher, privacy (UI + API), visibility changes, invite onboarding, passkeys, PWA/offline, security headers, axe (light + dark) |
| `npm run lighthouse`       | Lighthouse (mobile) ≥ 90 for performance, accessibility and best practices                                                                                                                                     |

Lighthouse 12+ no longer has a "PWA" category, so installability (manifest, icons, service
worker, offline) is asserted by `tests/e2e/pwa.spec.ts` instead.
