# Destr

Subscription management for Brightloop Software (seeded demo company).
Live: https://destr.goeltanmay442.workers.dev

## Setup

```bash
pnpm install
pnpm db:up
cp .env.example .env          # fill Clerk + Resend keys
cp .dev.vars.example .dev.vars
pnpm db:migrate
pnpm db:seed                  # core scenes + 2000 bulk subs (flags: --bulk=N, --no-bulk, --force)
pnpm dev                      # http://localhost:3000
```

## Demo accounts

Sign up in Clerk with the email first (dev instance), then run the command.

| Email | Role | Command after signup |
|---|---|---|
| degeneratedestroyer58008@gmail.com | admin | `pnpm db:seed-admin degeneratedestroyer58008@gmail.com` |
| goeltanmay442@gmail.com | customer | `pnpm db:link-customer goeltanmay442@gmail.com` |
| customer-one@brightloop.example | customer | `pnpm db:link-customer customer-one@brightloop.example` |

Seeded catalog: Business Monthly / Business Yearly / Add-on Monthly plans,
GST 18%, Launch 10% + Storage Rs 500 discounts, Standard onboarding template,
subscriptions in every state, paid + claimed + overdue invoices.

## Scripts

`dev` `build` `preview` `deploy` `lint` `typecheck` `test` `test:e2e`
`db:generate` `db:migrate` `db:seed` `db:seed-admin <email>`
`db:link-customer <email>` `db:up` `db:down` `depcruise`

Perf proof: `npx tsx scripts/perf-check.ts` (dashboard + lists < 2s warm).
Billing proof: `npx tsx scripts/billing-proof.ts` (drains due subs, re-run clean).

## Architecture

One monolith, one Worker, one Postgres. TanStack Start (React 19, Vite).
Postgres locally (Docker) and in cloud (Neon behind Hyperdrive), one Drizzle
`pg` schema. Clerk for identity; our DB is the source of truth for roles
(Clerk ⇄ DB mirror in `src/features/users`). Money in minor units, UTC
timestamps, UUID keys. Billing job: same function for Cron Trigger, admin
button, and `POST /api/jobs/run-billing` (secret auth).

Measured perf (bulk seed: 2010 subs, ~1800 invoices, Neon): dashboard 501ms,
subscriptions 524ms, invoices 522ms, payments 263ms. Fixes that got it under
budget: shared `pg` pool instead of per-query connections, SQL pagination for
invoice lists, conditional plan joins + single-scan balance totals on the
dashboard. No cache layer.

## Production notes

- Worker `destr` + Hyperdrive `destr-neon-db` on the Cloudflare account.
  Secrets via `wrangler secret` (never in git): `CLERK_SECRET_KEY`,
  `CLERK_WEBHOOK_SIGNING_SECRET`, `JOB_SECRET`, `APP_URL`.
- Cron triggers are NOT attached: the account hit the free-plan limit of 5.
  Upgrade to Paid or free a slot, then `wrangler deploy` re-attaches
  `0 * * * *` (billing) + `*/5 * * * *` (outbox). Until then, run billing
  from `/admin/billing` or `POST /api/jobs/run-billing`.
- Billing at 190-sub backlog runs ~6s/invoice from the Worker; large
  backlogs need repeated calls (100 subs/call cap).
- Prod hardening (prod Clerk keys, Resend + domain, custom domain) is parked
  in `.local/phases/phase-11-prod-hardening.md` (gitignored).
