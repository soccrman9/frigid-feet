# Zero-Cost Hosting and Realtime Backend Options

Type: research
Status: resolved

## Question

For a <30-Participant event needing a **mobile-first web app**, a **realtime Basecamp Dashboard**, lightweight auth, and optional scheduled push notifications — with a **\$0 budget** and a **~6-week build window** (early January 2027) — compare official current free-tier limits, realtime features, scheduled-job support, and gotchas across leading zero-cost stacks:

1. **Supabase Free + Vercel Hobby or Cloudflare Pages** (Postgres, Realtime broadcasts/changes, Auth, Edge Functions, pg_cron / scheduled jobs, project pausing after inactivity).
2. **Firebase Spark Plan** (Firestore realtime listeners, Auth, Hosting — noting whether Cloud Functions / scheduled jobs require upgrading to Blaze pay-as-you-go!).
3. **Cloudflare Pages + Workers + D1 / Durable Objects** (free-tier limits for realtime WebSockets/SSE, cron triggers, SQLite storage).

Highlight any free-tier cliffs, credit-card requirements, cold-start/inactivity pausing risks around January race day, and which option minimizes build time.

## Answer

- **Supabase Free + Cloudflare Pages (or Vercel Hobby)** minimizes 6-week build time on a strict `\$0` / no-credit-card budget: Postgres (500 MB), Auth (50k MAU), Realtime (200 concurrent connections, 2M messages/mo), Edge Functions (500k invocations/mo), and in-DB scheduled jobs (`pg_cron` + `pg_net` -> Edge Functions) are all free. **Two critical gotchas:** (1) Supabase Free **pauses projects after 7 days of low DB activity** (internal `pg_cron` does not prevent pausing—requires an external heartbeat or pre-Edition manual wake-up), and (2) Supabase's built-in Auth SMTP is capped at **2 emails/hour** (avoid magic-link spam or attach free custom SMTP / OAuth). Prefer **Cloudflare Pages** (unlimited static bandwidth/requests, no non-commercial clause) over Vercel Hobby (strictly non-commercial, 100 GB/mo bandwidth, and cron jobs capped at **once/day**).
- **Firebase Spark Plan** requires no credit card and never pauses for inactivity (Firestore: 1 GiB, 50k reads/20k writes per day, `onSnapshot` realtime; Auth: 50k MAU without SMS; Hosting: 360 MB/day transfer), **but Cloud Functions and Cloud Scheduler require upgrading to the Blaze pay-as-you-go plan** (credit card + no hard spend cap), blocking built-in scheduled Web Push reminders on pure Spark.
- **Cloudflare Pages + Workers + D1 + SQLite Durable Objects (Free)** now includes **SQLite-backed Durable Objects on the Free plan** with no credit card (100k req/day, 13,000 GB-s/day, WebSocket Hibernation, Alarms, plus 5 Cron Triggers/account and 5 GB D1 with 7-day Time Travel backups) and **zero inactivity pausing**, but adds build time because you must wire DIY end-user auth, WebSocket sync, and Web Crypto push signing within the 10 ms CPU / 50 subrequest per-invocation limits.

See [Full research report](../research/03-zero-cost-stack-options.md).
