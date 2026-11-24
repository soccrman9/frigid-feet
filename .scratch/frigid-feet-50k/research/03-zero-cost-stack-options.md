# Zero-Cost Hosting and Realtime Backend Options

Research for **Frigid Feet 50K Relay** (`<30` Participants, mobile-first web app, realtime Basecamp Dashboard, lightweight auth, optional scheduled Web Push reminders for upcoming Rounds/Legs, `\$0` budget, ~6-week build window ahead of early January 2027 Edition).

---

## Executive Comparison Matrix

| Dimension | **Option 1: Supabase Free + Vercel Hobby or Cloudflare Pages** | **Option 2: Firebase Spark Plan** | **Option 3: Cloudflare Pages + Workers + D1 / Durable Objects (Free)** |
| :--- | :--- | :--- | :--- |
| **Credit Card Required?** | **No** (Supabase Free, Vercel Hobby, and Cloudflare Pages Free all require no card) | **No for Spark**, **Yes (Blaze)** if you need Cloud Functions or Cloud Scheduler | **No** (Workers, Pages, D1, and SQLite-backed Durable Objects Free require no card) |
| **Database & Free Storage** | Managed Postgres: **500 MB** DB size, 2 GB disk cap (read-only at 95%), unlimited API requests | Cloud Firestore: **1 GiB** stored, **50,000 reads/day**, **20,000 writes/day**, **20,000 deletes/day** | **D1** (SQLite): **5 GB** total (500 MB/DB, 10 DBs), **5M rows read/day**, **100k rows written/day**; **DO SQLite**: **5 GB** total |
| **Realtime Capability** | Built-in **Supabase Realtime** (Postgres Changes, Broadcast, Presence): **200** peak concurrent connections, **2M** messages/mo, **100** msg/s | Built-in **Firestore `onSnapshot`** (no fixed connection cliff; billed per document read) or **RTDB** (**100** concurrent connections) | DIY WebSockets via **SQLite-backed Durable Objects** (with WebSocket Hibernation): **100k** req/day, **13,000 GB-s/day** |
| **Auth Included?** | **Yes** — Supabase Auth (**50,000 MAU**); **critical caveat:** built-in SMTP capped at **2 emails/hour** | **Yes** — Firebase Auth (**50,000 MAU** for email/password, OAuth, anonymous; SMS/Phone requires Blaze) | **No built-in end-user auth** (must roll DIY sessions/magic links/OAuth in Workers + D1, or add external auth) |
| **Scheduled Jobs (Web Push Reminders)** | **`pg_cron` + `pg_net` -> Edge Functions** (all included on Free; **500k** invocations/mo); *not* Vercel Hobby crons (1x/day max) | **Blocked on Spark** — Cloud Functions (`onSchedule`) & Cloud Scheduler **require upgrading to Blaze** (linked billing account) | **Cron Triggers** (**5** triggers/account on Free) or **Durable Objects Alarms** (counted in 100k req/day; **10 ms CPU** limit/invocation) |
| **Frontend Hosting Free Tier** | **Vercel Hobby:** 100 GB bandwidth/mo, 1M edge req/mo (non-commercial only). **CF Pages:** **unlimited** static bandwidth & requests, 500 builds/mo | **Firebase Hosting:** 10 GB storage, **360 MB/day** (~10 GB/mo) data transfer | **Cloudflare Pages:** **unlimited** static bandwidth & requests, 500 builds/mo, 100k Pages Functions req/day |
| **Inactivity Pausing / Cold-Start Risk** | **HIGH:** Supabase Free **pauses after 7 days of DB inactivity** (`pg_cron` does not prevent pausing!) | **None** (no inactivity pausing on Firestore/Hosting) | **None** (no inactivity pausing; Workers/DO have sub-10ms cold starts) |
| **6-Week Build Velocity** | **Fastest** — SQL schema + Row-Level Security + Auth + Realtime + Edge Functions + `pg_cron` out of the box | **Fast** for CRUD + live UI, **but** no free server-side cron/push sender without Blaze or an external worker | **Slowest** — must build auth, WebSocket protocol/reconnection, and Web Push signing on 10 ms CPU limit |

---

## Option 1: Supabase Free + Vercel Hobby or Cloudflare Pages

### Official Free-Tier Quotas & Capabilities
- **Supabase Free Plan** ([Supabase Pricing](https://supabase.com/pricing)):
  - **Credit card:** Not required. Up to **2 active projects** per organization.
  - **Postgres Database:** **500 MB** database size (shared compute, 500 MB RAM; 2 GB disk ceiling where 95% utilization triggers read-only mode), **unlimited** REST/GraphQL API requests, **5 GB** monthly egress. Automated backups and Point-in-Time Recovery (PITR) are **not** included on Free ([Supabase Pricing](https://supabase.com/pricing)).
  - **Auth:** **50,000 Monthly Active Users (MAU)** included ([Supabase Pricing](https://supabase.com/pricing)).
  - **Realtime** ([Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)):
    - **200** peak concurrent connections (ample for `<30` Participants + multiple Basecamp Dashboard screens).
    - **2 million** messages/month, **100** messages/second, **100** channel joins/second, **100** channels per connection, **20** Presence messages/second, **256 KB** Broadcast payload, **1 MB** Postgres Changes payload.
    - *Fan-out note:* Every Postgres Change (`INSERT`/`UPDATE`/`DELETE`) delivered to `N` subscribed clients counts as `N` messages. For 30 Participants across 10 Rounds (~30–100 Leg updates total), total Edition volume is well under 10,000 messages (<0.5% of the 2M monthly quota).
  - **Edge Functions** ([Supabase Edge Function Limits](https://supabase.com/docs/guides/functions/limits)): **500,000 invocations/month**, up to **100 functions**, **256 MB** memory, **2 s** CPU time per request, **150 s** wall-clock timeout.
  - **Scheduled Jobs (`pg_cron` + `pg_net`)** ([Supabase Cron Docs](https://supabase.com/docs/guides/cron), [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)): Both `pg_cron` and `pg_net` are available on the **Free plan**. A scheduled Postgres job can invoke a Supabase Edge Function via `net.http_post()` (e.g., every 5 minutes on Edition day to dispatch Web Push reminders for upcoming Rounds/Legs). Note that `pg_cron` writes run history to `cron.job_run_details`, which should be pruned periodically on high-frequency schedules to stay within 500 MB.

- **Frontend Pair A — Vercel Hobby** ([Vercel Hobby Plan](https://vercel.com/docs/plans/hobby), [Vercel Limits](https://vercel.com/docs/limits)):
  - **Credit card:** Not required; exceeding limits pauses features/deployments rather than billing overages.
  - **Quotas:** **100 GB/month** Fast Data Transfer, **10 GB/month** Fast Origin Transfer, **1,000,000** Edge/CDN requests/month, **1,000,000** Function invocations/month, **4 hours** Active CPU/month, **360 GB-hours** provisioned memory, **6,000** build minutes.
  - **Non-commercial restriction:** Strictly for **personal, non-commercial use** ([Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)). Acceptable for a friendly, non-monetized 50K relay among friends, provided no paid entry fees/commercial sponsorships run through the app.
  - **Cron Jobs cliff:** Vercel Hobby limits Cron Jobs to **once per day** maximum (sub-daily cron expressions fail deployment) with up to 1-hour timing jitter ([Vercel Cron Jobs Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)). Do **not** rely on Vercel Hobby crons for hourly Round reminders—use Supabase `pg_cron` instead.

- **Frontend Pair B — Cloudflare Pages Free** ([Cloudflare Pages Limits](https://developers.cloudflare.com/pages/platform/limits/)):
  - **Credit card:** Not required. No non-commercial restriction.
  - **Quotas:** **Unlimited** static bandwidth and static asset requests, **500 builds/month** (1 concurrent, 20-minute timeout), up to **20,000 files** (25 MiB max/file), plus **100,000 Pages Functions requests/day** (10 ms CPU/invocation).
  - *Why CF Pages pairs nicely with Supabase:* Eliminates Vercel's non-commercial terms ambiguity and monthly bandwidth/edge-request caps when hosting a static SPA/PWA frontend (e.g., Vite + React/Svelte) that talks directly to Supabase.

### Critical Gotchas & Race-Day Cliffs (Option 1)
1. **7-Day Inactivity Pausing (Major January Edition Risk):** Supabase automatically pauses Free projects after **7 days of low/no Postgres database activity** ([Supabase Pricing](https://supabase.com/pricing), [Supabase Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)).
   - **Trap:** Internal `pg_cron` jobs and dashboard logins do **not** reliably keep the database active; Supabase checks external PostgREST/database queries. If the app sits idle between holiday prep (late Dec) and Edition day (early Jan), the backend could be paused right as Participants arrive at Basecamp!
   - **Mitigation:** (a) Manually check/resume the project 24 hours before Edition day (resuming takes a couple minutes; data is preserved for up to 1 year), and/or (b) run a simple external keepalive heartbeat (e.g., a scheduled GitHub Actions workflow hitting a lightweight read endpoint every 3 days) during the pre-Edition window.
2. **Built-in Auth Email Rate Limit (2 emails/hour):** Supabase's default built-in SMTP provider caps outbound auth emails (sign-up confirmations, magic links, OTPs, password resets) at **2 emails per hour globally** and restricts recipients to authorized org members ([Supabase Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)).
   - **Impact:** Magic-link or email-confirmation onboarding for ~30 Participants will immediately hit `429 over_email_send_rate_limit` unless you either (a) disable email confirmation / use shared Edition invite code + lightweight sign-in / Google OAuth, **or** (b) connect a free Custom SMTP provider (e.g., Resend free tier).
3. **No Automatic Backups:** Free projects lack automated daily backups; export a quick SQL dump before and after the Edition.

---

## Option 2: Firebase Spark Plan

### Official Free-Tier Quotas & Capabilities
- **Firebase Spark Plan** ([Firebase Pricing](https://firebase.google.com/pricing), [Firebase Pricing Plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)):
  - **Credit card:** **Not required** on Spark. Hard cap behavior: if a daily/monthly quota is exceeded, requests fail (`ResourceExhausted`) until reset—zero surprise billing.
  - **Cloud Firestore** ([Firestore Quotas](https://firebase.google.com/docs/firestore/quotas)):
    - **1 GiB** stored data, **10 GiB/month** outbound network egress.
    - **50,000 document reads/day**, **20,000 document writes/day**, **20,000 document deletes/day**.
    - **Realtime Listeners (`onSnapshot`):** Works seamlessly on Spark with offline persistence built into the Web SDK. However, every initial snapshot document and every subsequent document update delivered to each listener counts as a billable **read**. (For 30 Participants watching ~50 documents updated ~100 times during an Edition, that is ~30 × (50 + 100) ≈ 4,500 reads—safely under 50k/day, though an accidental listener on an unbounded collection could burn through 50k reads quickly.)
  - **Realtime Database (RTDB):** Available on Spark with **100 concurrent connections**, 1 GB storage, 10 GB/month download ([Firebase Pricing](https://firebase.google.com/pricing)).
  - **Firebase Auth:** Standard providers (Email/Password, Google, Apple, Anonymous) are free on Spark (up to **50,000 MAU** under Identity Platform tiers). **Phone/SMS Auth is unavailable on Spark** and requires Blaze ([Firebase Pricing](https://firebase.google.com/pricing)).
  - **Firebase Hosting:** **10 GB** storage, **360 MB/day** (~10 GB/month) data transfer ([Firebase Pricing](https://firebase.google.com/pricing)).
  - **No Inactivity Pausing:** Unlike Supabase Free, Spark projects do **not** pause after 7 days of inactivity—zero risk of waking up on January Edition morning to a sleeping database.

### Critical Gotchas & Race-Day Cliffs (Option 2)
1. **Cloud Functions & Scheduled Jobs Require Upgrading to Blaze (Credit Card Required):**
   - Cloud Functions for Firebase cannot be deployed on the Spark plan; deploying functions or using scheduled triggers (`onSchedule` / Cloud Scheduler + Pub/Sub) **requires upgrading to the Blaze (pay-as-you-go) plan** with a linked Google Cloud Billing account ([Firebase Pricing Plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Schedule Functions](https://firebase.google.com/docs/functions/schedule-functions)).
   - Even though Blaze retains free monthly allowances (**2M** Cloud Function invocations/month; **3 free Cloud Scheduler jobs/month** per billing account, then `$0.10/job/month` per [Cloud Scheduler Pricing](https://cloud.google.com/scheduler/pricing)), Blaze has **no automatic hard spend cap**—Google Cloud budget alerts only notify you, they do not stop traffic ([Firebase Pricing Plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)).
   - **Impact on `\$0` / No-Card Requirement:** Staying strictly on Spark means **zero server-side compute inside Firebase**, so you cannot run scheduled Web Push notification jobs or server-side push signing without introducing a second backend (like a Cloudflare Worker or GitHub Action) or attaching a credit card for Blaze.
2. **Firebase Hosting Daily Transfer Cap (360 MB/day):** A heavy unoptimized PWA bundle or large Basecamp photos reloaded repeatedly by 30 phones on Edition day can approach 360 MB/day (hard cutoff until next day on Spark). Easily avoided by optimizing assets or hosting the frontend on Cloudflare Pages instead.
3. **NoSQL Relational Friction:** Modeling Editions -> Teams -> Rounds -> Legs -> Participants -> Free Agents -> Badges requires denormalization and carefully written `firestore.rules`, whereas relational SQL fits the relay domain naturally.

---

## Option 3: Cloudflare Pages + Workers + D1 / Durable Objects (Free)

### Official Free-Tier Quotas & Capabilities
- **Credit card:** **Not required** for the Workers Free / Pages Free tier (including D1 and SQLite-backed Durable Objects). Exceeding daily quotas returns hard errors (e.g., 1027/1102) until 00:00 UTC reset—zero surprise charges ([Workers Limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)).
- **Cloudflare Pages (Frontend):** **Unlimited** static bandwidth & requests, **500 builds/month**, **100,000** Pages Functions requests/day (shared with Workers Free pool) ([Cloudflare Pages Limits](https://developers.cloudflare.com/pages/platform/limits/)).
- **Cloudflare Workers & Cron Triggers** ([Workers Limits](https://developers.cloudflare.com/workers/platform/limits/), [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)):
  - **100,000 requests/day** across all scripts, **10 ms CPU time** per invocation (wall-clock wait on I/O does not count toward CPU time, only JS execution), **128 MB** memory, **50 subrequests** per invocation.
  - **Cron Triggers:** Up to **5 Cron Triggers per account** on Free (typically up to 3 per Worker), counting toward the 100k/day request cap and subject to the **10 ms CPU** limit.
- **Cloudflare D1 (Serverless SQLite)** ([D1 Limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)):
  - **10 databases** per account, **500 MB** max per database, **5 GB** total storage.
  - **5 million rows read/day**, **100,000 rows written/day**, **50 queries/invocation**, **7-day Time Travel** (point-in-time recovery included free!).
- **Cloudflare Durable Objects (SQLite-Backed — Now Available on Free Plan!)** ([Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/)):
  - **Available on Workers Free** using the **SQLite storage backend** (legacy KV-backed DOs are not needed).
  - **100,000 requests/day** (covering HTTP requests, RPC, WebSocket messages, and Alarms), **13,000 GB-seconds/day** compute duration, **5 GB** total storage per account (up to 100 DO classes).
  - **WebSocket Hibernation API:** Keeps WebSockets open to all `<30` Participants and the Basecamp Dashboard while hibernating idle DO memory so duration does **not** burn the 13,000 GB-s/day budget.
  - **Alarms API:** Built-in per-DO scheduled alarms (e.g., schedule exact reminders 10 minutes before each Round start), counted toward the 100k req/day pool.
  - **No Inactivity Pausing:** Never sleeps for 7-day inactivity; zero cold-start headache on Edition morning.

### Critical Gotchas & 6-Week Build Risks (Option 3)
1. **No Built-In End-User Auth:** Unlike Supabase Auth or Firebase Auth, Cloudflare does not ship a turnkey consumer Auth SDK (magic links, OAuth, passwordless, session refresh). You must wire up an auth library (e.g., Better Auth, Lucia-style sessions, or simple invite-code + signed cookie) against D1 yourself.
2. **DIY Realtime Wiring:** Durable Objects give you raw WebSockets + SQLite, not a prebuilt reactive client subscription layer (`useEffect` -> `onSnapshot` / `supabase.channel().on('postgres_changes')`). You must design and maintain your own WebSocket message protocol, auth handshake, reconnect/resync logic, and broadcast fan-out.
3. **10 ms CPU Limit on Workers Free (Web Push Crypto Risk):** VAPID JWT signing + Web Push payload encryption (`aes128gcm` / ECDH P-256) in JavaScript via Web Crypto is fast (typically `<1–2 ms` per push using native `crypto.subtle`), so fanning out to `<30` Participants in a single Cron/Alarm invocation is usually feasible—**if** using native Web Crypto rather than pure-JS polyfills. However, any heavy pure-JS crypto or JSON processing risks hitting the **10 ms CPU** ceiling (returning Error 1102), and the **50 subrequest limit** per invocation caps a single batch to `<50` push endpoint fetches (safe for `<30` Participants, tight if Participants register multiple devices each).

---

## Recommendation for a ~6-Week Build Window

1. **Fastest Time-to-Ship & Best Zero-Cost Feature Completeness: Supabase Free + Cloudflare Pages Free (or Vercel Hobby).**
   - Gives you relational Postgres (ideal for Edition / Team / Round / Leg / Free Agent / Badge queries), turnkey Auth, zero-boilerplate Realtime for the Basecamp Dashboard, **and** genuinely free server-side scheduled jobs (`pg_cron` + `pg_net` -> Edge Functions) for optional Web Push reminders—all with **no credit card required**.
   - **Prefer Cloudflare Pages over Vercel Hobby** for the static frontend to avoid Vercel's strict non-commercial clause and monthly bandwidth caps (though Vercel Hobby is equally fast if using Next.js SSR and the event is strictly non-commercial).
   - **Two mandatory mitigations if choosing Supabase Free:**
     1. **Prevent the 7-day inactivity pause** before January Edition day (add a free GitHub Actions keepalive query every 3 days + manual check 24 hours pre-Edition).
     2. **Avoid the 2-email/hour built-in SMTP cliff** (either connect a free Custom SMTP like Resend, use Google OAuth, or use a frictionless invite-code / passwordless flow that doesn't depend on Supabase's built-in mailer).

2. **Runner-Up for Maximum Reliability / Zero Pausing Risk: Cloudflare Pages + Workers + D1 + SQLite Durable Objects (Free).**
   - Technically the cleanest architecture on a strict `\$0` no-card budget: **zero inactivity pausing**, **7-day Time Travel backups free**, native **Cron Triggers / DO Alarms**, and **SQLite-backed Durable Objects** for realtime WebSockets—all under one vendor.
   - Only choose this if the team is comfortable spending ~1–1.5 weeks of the 6-week budget building lightweight auth + WebSocket state sync (or using a simple shared-passcode + signed-cookie auth model suitable for a `<30`-friend event).

3. **Why Firebase Spark Ranks Third Here:**
   - Firestore `onSnapshot` + Firebase Auth + zero inactivity pausing is great for the live UI, **but** Spark blocks Cloud Functions and Cloud Scheduler. If optional scheduled Web Push reminders are in scope, you are forced either to **attach a credit card for Blaze** (introducing uncapped pay-as-you-go risk) or bolt on a second platform (like Cloudflare Workers) anyway.

---

## Primary Sources

- **Supabase:**
  - [Supabase Pricing](https://supabase.com/pricing)
  - [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
  - [Supabase Edge Functions Limits](https://supabase.com/docs/guides/functions/limits)
  - [Supabase Cron (`pg_cron`)](https://supabase.com/docs/guides/cron)
  - [Supabase Scheduling Edge Functions (`pg_cron` + `pg_net`)](https://supabase.com/docs/guides/functions/schedule-functions)
  - [Supabase Auth Rate Limits (Built-in SMTP)](https://supabase.com/docs/guides/auth/rate-limits)
  - [Supabase Billing FAQ & Project Pausing](https://supabase.com/docs/guides/platform/billing-faq)
- **Vercel:**
  - [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)
  - [Vercel Limits](https://vercel.com/docs/limits)
  - [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
  - [Vercel Cron Jobs Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- **Firebase / Google Cloud:**
  - [Firebase Pricing](https://firebase.google.com/pricing)
  - [Firebase Pricing Plans (Spark vs. Blaze)](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
  - [Cloud Firestore Quotas & Limits](https://firebase.google.com/docs/firestore/quotas)
  - [Cloud Functions for Firebase: Schedule Functions](https://firebase.google.com/docs/functions/schedule-functions)
  - [Google Cloud Scheduler Pricing](https://cloud.google.com/scheduler/pricing)
- **Cloudflare:**
  - [Cloudflare Pages Limits](https://developers.cloudflare.com/pages/platform/limits/)
  - [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
  - [Cloudflare Workers Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
  - [Cloudflare D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
  - [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
  - [Cloudflare Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
  - [Cloudflare Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
