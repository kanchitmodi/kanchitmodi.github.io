# Household Money — Setup Guide

This guide matches the in-app wizard at **Settings › Setup**. The wizard has checkboxes, links and a
**Test** button for each step, and it saves your progress for the household.

> **Do steps 0–4 before Stage 5 (Plaid).** Steps 0–4 are accounts only you can create. The app
> can't create them for you.

**Secrets rule:** API keys go **only** into environment variables: Vercel › Project Settings ›
Environment Variables, or `.env` on your laptop. Never put a key in code, in GitHub, in chat, or in
an email.

Links were checked on 2026-10-13. If a link has moved, search the provider's official docs for the
page name given here.

---

## Step 0 — Base accounts (Kanchit)

| ✓   | What                                                                                  | Link                           |
| --- | ------------------------------------------------------------------------------------- | ------------------------------ |
| ☐   | GitHub account and a **private** repo for this app                                    | https://github.com/signup      |
| ☐   | Vercel (hosting)                                                                      | https://vercel.com/signup      |
| ☐   | Supabase (Postgres)                                                                   | https://supabase.com/dashboard |
| ☐   | A password manager, with 2FA on GitHub, Vercel, Supabase, Plaid, Google and Anthropic | —                              |

> ⚠ This code currently lives in `kanchitmodi/kanchitmodi.github.io`, which is your GitHub Pages
> site and is probably **public**. The code holds no secrets, but the spec asks for a private repo.
> Before you connect real accounts, move `household-money/` into a new private repo, or make this
> repo private (GitHub Pages on a private repo needs a paid plan).

**Test:** "Check database connection" runs `SELECT 1`.

## Step 1 — Plaid (banks and cards)

1. Sign up and verify your email: https://dashboard.plaid.com/signup
2. Apply for the **free Trial plan** at https://dashboard.plaid.com/trial-plan, using the use case
   _"personal finance app for my household"_.
   - The Trial plan is for US/Canada teams created on or after 2026-04-15. It gives **10
     Production Items**.
   - **Don't** submit a full Production application first. Once you do, you can't get the Trial.
   - On the Trial, removing an Item (`/item/remove`) **does not free up a slot**. That's why the
     app never re-links a bank: it always re-authenticates with update mode, and it keeps 2
     Items in reserve.
3. Copy `client_id` and the Sandbox `secret` from Dashboard › Developers › Keys
   (https://dashboard.plaid.com/developers/keys).
4. Make sure country **Canada (CA)** and product **Transactions** are enabled.
5. Env: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`. Switch to `production` once
   Stage 5 passes.

Docs: https://plaid.com/docs/ · **Test:** creates a Sandbox Link token (CA, Transactions).

Planned usage is **5/10 Items**: Kanchit uses 3 (Wealthsimple, TD, CIBC) and Wife uses 2
(Scotiabank, PC Financial). Rogers uses email alerts, and investments go through SnapTrade, so
neither uses an Item. Settings › Connections shows the live count.

## Step 2 — SnapTrade Personal (brokerages)

1. Sign up (free, up to 20 connections, no credit card): https://snaptrade.com/personal
2. Turn on 2FA in the SnapTrade dashboard (https://dashboard.snaptrade.com). It's required before
   you can create a Personal API key.
3. Create the **Personal client ID + consumer key** on the API Key page.
4. Env: `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`

Docs: https://docs.snaptrade.com · **Test:** lists supported brokerages and checks that
Wealthsimple, Questrade and IBKR are all there.

> SnapTrade says a Personal key must not be distributed in an app or shared with other people.
> Here the key stays server-side only, and each of you authorizes your own brokerage logins through
> SnapTrade's own connection portal. Nobody ever sees the other's broker password. If you'd like
> extra separation later, SnapTrade also offers Personal OAuth, so each person can sign in to
> SnapTrade separately.

## Step 3 — Claude API (AI advisor)

1. Create a key: Claude Console › API keys (https://platform.claude.com/settings/keys).
   console.anthropic.com redirects here.
2. Set a monthly spend limit in the Console under Settings › Limits
   (https://platform.claude.com/settings/limits), for example $15 USD. The app also enforces its
   own cap (default $10 CAD per month, with an alert at 80%).
3. Env: `ANTHROPIC_API_KEY`

**Test:** generates one sample insight from **aggregated demo data**. Only category totals are
sent; account numbers, names and emails never leave the app.

## Step 4 — Gmail API (Rogers alerts)

1. Google Cloud: create a project, then enable the Gmail API
   (https://console.cloud.google.com/apis/library/gmail.googleapis.com).
2. OAuth consent screen (Google Auth Platform, https://console.cloud.google.com/auth/overview):
   choose **External** and add yourself as a **Test user**.
3. Clients › Create OAuth client ID, type **Web application**
   (https://console.cloud.google.com/auth/clients). Set the redirect URI to
   `https://<your-app-domain>/api/gmail/callback`.
4. Data access: add **only** `https://www.googleapis.com/auth/gmail.readonly`.
5. Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
6. Gmail filter: **From** = the Rogers Bank alert sender, then **Apply label** `rogers-alerts` and
   **Skip the Inbox**.
7. Rogers Bank app: turn on purchase alerts at the lowest threshold.

Docs: https://developers.google.com/gmail/api · **Test:** checks the OAuth configuration now.
Stage 4 adds "parse the last 3 rogers-alerts emails for confirmation". The app reads only that label.

## Step 5 — Backup broker connections (optional, each person)

- Questrade personal API token: https://www.questrade.com/api/documentation/getting-started
- IBKR Flex: Client Portal › Performance & Reports › Flex Queries › create an **Activity** query.
  Then enable **Flex Web Service** and note the token and query ID.

**Test (Stage 6):** fetch positions.

## Step 6 — FX rates

Bank of Canada Valet API needs no key: https://www.bankofcanada.ca/valet/docs.
**Test:** fetches today's USD/CAD.

## Step 7 — Deploy

1. **Supabase:** create a project in region _Canada (Central)_. Under Connect, copy the
   **Transaction pooler** URL into `DATABASE_URL` (add `?pgbouncer=true`) and the **Direct** URL
   into `DIRECT_URL`.
2. **Vercel:** Add New › Project › import the repo. Set **Root Directory = `household-money`**.
   Add all env vars (see the table below) under Project Settings › Environment Variables. Set
   `APP_URL` to your https URL.
3. Generate `ENCRYPTION_KEY` and keep a copy in your password manager. If you lose it, every
   stored token becomes unreadable.
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
4. Run migrations against Supabase from your laptop: `DATABASE_URL=… DIRECT_URL=… npm run db:migrate`.
   Then deploy.
5. Leave `DEMO_MODE` **unset** in production.
6. **Make CI gate deploys:** GitHub › Settings › Branches › add a protection rule on `main` that
   requires the "Household Money CI" checks. Deploy production only from `main`.

**Test:** Settings › Setup › Step 7 checks the DB, Plaid, SnapTrade, Claude, Gmail and FX.
`GET /api/health` is the public liveness probe. It reports only whether each service is
configured, never any values.

## Step 8 — Connect Kanchit's accounts (on his phone)

- ☐ Wealthsimple via Plaid, including the joint account. Within 48 hours, check that the credit
  card and its transactions appear. If they don't, the account switches to CSV automatically and
  is flagged in Health.
- ☐ TD via Plaid, including joint chequing
- ☐ CIBC via Plaid, or CSV if Items are tight
- ☐ Rogers via Gmail alerts
- ☐ Wealthsimple, Questrade and IBKR via SnapTrade
- ☐ Import 6–12 months of CSV history (see the export steps below)

## Step 9 — Invite and connect Wife

1. Kanchit: Settings › Household › Invite. The link expires in 7 days and works once. If email
   isn't configured, the link is shown once so you can text it to her.
2. She signs up on her iPhone, sets up 2FA, then adds a passkey (Face ID) in Settings › Security.
3. She connects Scotiabank and PC Financial via Plaid, and her Wealthsimple, Questrade and IBKR
   via SnapTrade.
4. She imports 6–12 months of CSV history.
5. Check that the joint accounts appear **once**.

## Step 10 — Install on iPhone (both)

Open the app URL in **Safari**, tap **Share**, then **Add to Home Screen**. Open it from the
Home Screen and allow notifications. Web Push needs iOS 16.4+ and only works from the installed
app.

## Step 11 — First QA pass

- Health: every account is green or has a note explaining why not. Plaid Items = 5/10.
- Run the first report on imported history, and spot-check it against 1 statement per card.
- Review the first AI insights and card recommendations.

---

## Environment variables

| Variable                                        | Needed from | Notes                                                                                             |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `DIRECT_URL`                    | Stage 1     | Postgres (Supabase pooled + direct)                                                               |
| `APP_URL`                                       | Stage 1     | Public https URL. Used for invite links, the passkey RP ID, Secure cookies and the Gmail redirect |
| `ENCRYPTION_KEY`                                | Stage 1     | 32 random bytes, base64. AES-256-GCM key for TOTP secrets and provider tokens                     |
| `DEMO_MODE`                                     | dev only    | `true` enables the demo household seed and demo login hints                                       |
| `RESEND_API_KEY`, `EMAIL_FROM`                  | optional    | Invite and report emails. Without them, emails are logged and the invite link is shown in the app |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`  | Stage 5     |                                                                                                   |
| `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` | Stage 6     |                                                                                                   |
| `ANTHROPIC_API_KEY`, `AI_MONTHLY_CAP_USD`       | Stage 10    |                                                                                                   |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`      | Stage 4     |                                                                                                   |
| `TEST_DATABASE_URL`, `E2E_DATABASE_URL`         | tests       | Disposable DBs. The E2E DB name must end in `_e2e` or `_test`                                     |

## CSV export, per institution (for history backfill and fallback)

Bank menus change often. The labels below are what to look for; if one has moved, search your
bank's help centre for "download transactions".

| Institution  | Where                                                                             | Format  |
| ------------ | --------------------------------------------------------------------------------- | ------- |
| Wealthsimple | Web › account › Activity › **Export** (or monthly statements › CSV)               | CSV     |
| TD           | EasyWeb › account › **Download** transactions › choose dates › Spreadsheet (.csv) | CSV     |
| CIBC         | Online Banking › account › **Download transactions** › Spreadsheet (.csv)         | CSV     |
| Scotiabank   | Scotia OnLine › account › **Download** › CSV                                      | CSV     |
| PC Financial | pcfinancial.ca › Statements & transactions › **Download** › CSV                   | CSV     |
| Rogers Bank  | rogersbank.com › Statements › download the statement (PDF; CSV where offered)     | PDF/CSV |
| Questrade    | Reports › Account activity › **Export to Excel/CSV**                              | CSV     |
| IBKR         | Performance & Reports › Statements or Flex Query › CSV                            | CSV     |

Import them at **Import** in the app. The format is detected automatically; if a bank changed its export and detection fails, the app falls back to guessing columns from the header row. Send a redacted sample and the parser can be updated.

## Running locally

```bash
cd household-money
cp .env.example .env            # then fill ENCRYPTION_KEY (command above)
npm install
npx prisma migrate deploy        # or: npm run db:migrate:dev
DEMO_MODE=true npm run db:seed   # demo household (Kanchit + Wife, 12 months)
npm run dev                      # http://localhost:3000
```

Demo logins (DEMO_MODE only): `kanchit@demo.local` / `wife@demo.local`, password
`demo-password-123`. TOTP secrets are `JBSWY3DPEHPK3PXP` (Kanchit) and `KRSXG5CTMVRXEZLU` (Wife);
add them to any authenticator app.

## Running the tests

```bash
npm run qa                 # typecheck + lint + prettier + unit tests
npm run test:integration   # needs TEST_DATABASE_URL (wiped each run)
npm run test:e2e           # Playwright; needs E2E_DATABASE_URL (name ends in _e2e)
npm run lighthouse -- http://localhost:3100   # with the app running
```

CI (`.github/workflows/household-money-ci.yml`) runs all of these on every push and PR. The iPhone
E2E project runs in real WebKit. Locally it falls back to an emulated iPhone in Chromium unless
you set `PW_IPHONE_BROWSER=webkit`.
