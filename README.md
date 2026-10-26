# Vibe96

A working local software marketplace MVP built with **Next.js 16, React 19, TypeScript, Tailwind CSS 4 and PostgreSQL**. English and Bengali interface, responsive marketplace, server-side permissions and persistent workflows.

## Quick start

Install **Node.js 22.9+**, npm, and Docker Desktop (or supply an existing PostgreSQL 17 server).

```sh
npm ci
```

Copy `.env.example` to `.env` without overwriting an existing configuration:

```sh
# macOS / Linux
cp -n .env.example .env
# Windows PowerShell: Copy-Item .env.example .env (only if .env does not exist)
```

Then:

```sh
npm run db:local
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. Do not open an HTML file directly. Use `localhost`, not `127.0.0.1`, because mutation requests are checked against `APP_URL`. Set `APP_URL` to the exact origin if you change the hostname or port. If port 3000 is occupied, stop the old app or run `npm run dev -- --port 3001` and update `APP_URL`.

`db:local` creates or starts the local `vibe96-postgres` container, waits for readiness and retains existing data. It skips container changes for custom database URLs. `compose.yaml` is provided as an alternative for new installs (`docker compose up -d --wait`). Do not run Compose against an existing container created by `db:local`; use one method consistently. Never use `docker compose down -v` unless you intend to delete the database.

The demo seed is opt-in (`SEED_DEMO=true`) and idempotent. It creates local demo accounts and six clearly marked sample listings. It does **not** create paid orders, attach fake product source archives, or claim independent audits. Do not seed a public or production database.

### Local demo accounts

The password is the local `SEED_PASSWORD` from `.env` (example: `Vibe96-demo-2026!`). Set your own value **before the first seed**. Re-seeding does not reset existing passwords.

| Role    | Email                | Capabilities                                                                 |
| ------- | -------------------- | ---------------------------------------------------------------------------- |
| Buyer   | buyer@vibe96.local   | Purchases, licensed downloads, expert/customization requests                 |
| Builder | builder@vibe96.local | Project submission, editing, private source uploads, review tracking         |
| Admin   | admin@vibe96.local   | Review findings/approval, enable/disable users, request triage, activity log |

New registrations can choose buyer or builder. Admin cannot be self-assigned. Sign out to switch accounts. This MVP does not implement email verification, password recovery, seller payouts or tax calculation.

## Main workflows

1. **Discover:** search descriptions, names, categories and technology; filter by category, budget and technology; sort by recency or price. Detail dialogs show the seller, repository, screenshots, features, license and recorded review status. Click the builder’s name for a public profile and their published projects; emails and pending submissions remain private. Sample screenshot illustrations are labeled, and no customer ratings are fabricated.
2. **Submit:** sign in as builder; create a listing, then attach a ZIP (10 MB maximum). The project remains pending. Editing a listing or replacing its archive resets approval and review findings. Source archives stay outside `public/`. Classic single-disk ZIPs (stored or deflate, no encryption/ZIP64) are supported, with up to 2,000 entries and 100 MiB declared expanded size. Structural checks do not extract code, scan for malware or certify file contents.
3. **Review:** sign in as admin; inspect the submitted repository, then record a listing decision and note. “Human review recorded” requires specific findings; it is not a security certification. Reviewers can download the exact private submitted archive using its current revision. Review decisions require that same revision: a builder edit, source replacement or another review makes an older form stale and returns a conflict instead of approving unseen code. Actions are logged. Approval without an attached archive does not enable checkout.
4. **Purchase:** sign in as buyer; buy an approved, source-attached project through Stripe **test mode** after connecting the integration below. A browser redirect never marks an order paid.
5. **Download:** the buyer workspace enables source download only after the signed webhook confirms the expected session, order, amount, currency and payment status. Archives and license terms are snapshotted per order so later builder edits cannot silently replace purchased source. Integrity hashes are checked on every download. Other users, pending payments and refunded orders cannot access it.
6. **Expert help:** submit development, design, infrastructure, deployment or customization requests; admins record progress and notes. Requests tied to a purchased product require confirmed ownership. No expert is automatically booked.

Vi, Remi, Axel and Nova provide guided actions for discovery, submission, deployment planning and customization briefs. **Live AI, automated code editing, infrastructure provisioning and expert booking are Not connected.** No AI API key is required for the local MVP.

## Stripe test mode

Checkout is explicitly **Not connected** until both server-only values are set in `.env`:

```dotenv
STRIPE_SECRET_KEY=  # Your sk_test_ key, entered privately
STRIPE_WEBHOOK_SECRET=  # The signing secret from Stripe CLI / your test endpoint
```

Do not commit keys. Live-mode keys/events are deliberately rejected. Set up a local webhook listener using the Stripe CLI:

```sh
stripe login
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,charge.refunded --forward-to localhost:3000/api/stripe/webhook
```

Enter the listener's signing secret privately in `.env`, then restart Next.js. Create and approve a non-sample project with an actual source ZIP, sign in as a buyer, and use Stripe's documented test payment details. Successful checkout redirects to the workspace, where “Refresh” fetches the webhook-confirmed order. A pending order never grants access.

Raw webhook bytes are signature-verified. Events are deduplicated in PostgreSQL, and purchases are transactionally serialized per buyer. Fully refunded Stripe charges revoke access; partial refunds do not revoke the license. Duplicate successful payments for the same project are rejected for manual refund review rather than silently granted. Real PostgreSQL tests cover the outgoing checkout parameters, server-calculated price and order snapshots using an isolated SDK boundary stub, alongside signed webhook fixtures and refund ordering; an actual Stripe-hosted checkout and live refund callback require your test credentials and were not exercised without them.

## Validation

```sh
npm run typecheck
npm run build
```

For integration tests, create a **separate** PostgreSQL database ending in `_test`:

```sh
docker exec vibe96-postgres createdb -U vibe96 vibe96_test
# macOS / Linux
TEST_DATABASE_URL=postgresql://vibe96:vibe96_local_only@127.0.0.1:5432/vibe96_test npm test
# Windows PowerShell:
# $env:TEST_DATABASE_URL='postgresql://vibe96:vibe96_local_only@127.0.0.1:5432/vibe96_test'; npm test
```

The tests truncate only the explicitly selected test database and reject application database URLs. Coverage includes registration/roles, session authentication, CSRF origin checks, builder ownership, review gates, search filters, private archive validation, checkout authorization, signed webhook fulfillment/idempotency, amount mismatches, unpaid access denial, cross-buyer access denial, integrity failures, refunded access denial, immutable purchase archives, request ownership, admin actions and session revocation.

Public browser checks are included in the repository and never change account or application data. Start the seeded app in another terminal, then run:

```sh
# Install the browser once on machines without a system Chromium.
npx playwright install chromium
npm run test:browser
```

The config automatically uses `/usr/bin/chromium` when present; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select another installed Chromium. `BASE_URL` defaults to `http://localhost:3000`. Checks cover English/Bengali controls and persistence, search/category/budget/technology filters, price sorting, project details, honest disconnected states, keyboard access to license terms, seller signup intent, public seller profiles and mobile navigation/layout. Every test also fails on browser runtime exceptions.

The database integration suite includes separate payment and public-profile tests. Checkout tests use an internal SDK boundary stub and an isolated PostgreSQL schema, not an external payment processor. Further browser smoke validation exercised builder login, source submission/upload, admin review, user/activity screens and help-request creation.

## Build and storage

```sh
npm run build
npm start
```

Use a persistent writable disk for `ARTIFACT_DIR` and a persistent PostgreSQL instance. The local container uses the named volume `vibe96-postgres-data`. Container and application restarts retain data; restoring Docker volumes across cloud snapshots is platform-dependent and is not claimed here. Back up the database and private archives together. Previous archive versions remain on disk because existing orders may refer to them.

This is a single-instance local MVP, not a hardened public marketplace. Before public operation, replace demo credentials, use HTTPS with `COOKIE_SECURE=true`, provide verified email/account recovery and operational monitoring, establish seller verification and licensing policies, and review archive malware scanning, data retention, payments/refunds, taxes and payouts. Secure cookies are explicit so local HTTP development remains usable. External HTTPS screenshot URLs load in the user's browser with no referrer; source code is never made public by the app.

## Project map

- `components/Marketplace.tsx`: bilingual marketplace, dialogs and role-specific dashboards.
- `app/api/[...path]/route.ts` + `lib/api.ts`: validated API and authorization boundaries.
- `lib/auth.ts`: salted scrypt password hashing, random database-backed sessions, origin protection and login throttling.
- `lib/payments.ts`: Stripe test checkout, signed-event fulfillment and refunds.
- `scripts/schema.sql`: idempotent PostgreSQL schema; `scripts/seed.ts`: local sample data.
- `tests/*.test.ts`: isolated database integration tests for permissions, reviews, delivery, checkout, refunds and public profile privacy.
- `tests/browser/marketplace.spec.ts`: public-only Chromium workflow checks.
