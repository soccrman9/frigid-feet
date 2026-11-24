# Tech Stack Selection and 6-Week Build Architecture

Type: grilling
Status: resolved
Blocked by: 03, 05, 09, 10

## Context

Depends on free-tier findings in [Zero-Cost Hosting and Realtime Backend Options](./03-zero-cost-stack-options.md), the auth model in [Access, Identity, and Privacy Model for Friends](./05-access-identity-and-privacy.md), realtime/push/offline requirements in [Race-Day Runner Tracking, Timing, and Notification Strategy](./09-race-day-tracking-and-notifications.md), and integration needs in [Fitness App Integration Scope and User Flows](./10-fitness-app-integration-scope.md).

## Question

Which **\$0** tech stack and system architecture gives the fastest, lowest-risk path to launching in time for **early January 2027** while supporting our chosen identity model, realtime Basecamp Dashboard, optional Web Push, and fitness-app integration scope?

Specifically decide:
- Frontend framework & hosting (e.g., Next.js / SvelteKit / Vite React / Astro on Vercel Hobby or Cloudflare Pages).
- Backend, database, auth, and realtime layer (e.g., Supabase Free vs. Firebase Spark vs. Cloudflare Workers/D1).
- Deployment, environment/secrets management, and backup/recovery plan so nothing pauses or breaks on race morning.
- Whether the architecture should explicitly support a 2-phase launch (Phase 1: Pre-race info/RSVP/Team formation live ASAP; Phase 2: Race-day tracking, Basecamp Dashboard, and Badges before January).


## Answer

- **Frontend & PWA Architecture**: Single-repo **Vite + React + TypeScript + Tailwind CSS** SPA/PWA serving both the mobile app and the `/dashboard/:token` read-only **Basecamp Dashboard**. Uses `vite-plugin-pwa` for Service Worker app-shell caching, `idb` for the offline **Leg** check-in queue, and **Leaflet + OpenStreetMap** tiles for zero-cost interactive `.gpx` **Course** map previews.
- **Hosting & Repo**: Hosted on **Cloudflare Pages** (free `*.pages.dev` subdomain, unlimited bandwidth, automatic HTTPS and PR preview deploys) deployed from a **private GitHub repository**.
- **Backend, Database, & Realtime**: **Supabase Free** (Postgres + Realtime + SQL RPCs/RLS) — \$0, no credit card, native relational modeling for **Events**, **Courses**, **Participants**, **Teams**, **Rounds**, **Legs**, **Supplies**, Chip-Ins, and **Badges**, and built-in Realtime for the **Basecamp Dashboard**.
- **Zero-Email Access Control & Server-Enforced Privacy**: Use **Supabase Anonymous Auth** (`signInAnonymously()`) paired with `SECURITY DEFINER` Postgres unlock RPCs (`unlock_event`, `unlock_organizer`, `unlock_dashboard`) and a `session_grants(auth_uid, event_id, scope)` table checked by Postgres RLS. This requires **zero Edge Functions**, avoids Supabase's 2-email/hr SMTP limit, enforces **Organizer**-only chip-in privacy on the server, works natively with **Supabase Realtime** RLS, and supports instant revocation when codes/passcodes/tokens rotate.
- **Course `.gpx` Storage & Secrets Hygiene**: Store the 1–3 **Course** `.gpx` files directly in a `TEXT` column on the Postgres `courses` table (so **Organizers** can add/update Courses without redeploying or managing Storage buckets). Only public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` live in Cloudflare Pages environment variables; invite codes and the **Organizer** passcode are stored hashed (`pgcrypto`) in Postgres.
- **Reliability, Pause Prevention, & Backups**:
  - **Pause prevention**: A free **GitHub Actions scheduled workflow** pings a lightweight read-only Supabase RPC every **3 days** to prevent Supabase Free's 7-day inactivity pause, paired with a 48-hour pre-race manual check.
  - **Backups & archiving**: Include an in-app **Organizer "Export Event Snapshot (JSON / CSV)"** button for one-tap pre-race backup and post-**Event** archiving (avoiding storing friend PII in CI artifacts).
- **Two-Phase Launch Architecture**: Deploy the **full canonical database schema in Phase 1** so Phase 2 requires zero breaking migrations:
  - **Phase 1 (Live ASAP)**: Event invite gate + honor-system **Participant** profiles, **Event** Info + **Course** `.gpx` map/download, Announcements, RSVP, **Supplies** sign-up, **Team** formation + **Round** 1–10 schedule builder, and **Organizer** chip-in ledger + aggregate progress card.
  - **Phase 2 (Live before early January 2027)**: Mobile **Race Day** view (Variant B), read-only **Basecamp Dashboard** (Variant A), offline Service Worker + IndexedDB check-in queue, live **Badges**, opt-in **Speed Leaderboard**, and **Event** Recap + copy buttons.
