# 29: Basecamp Dashboard (/dashboard/:token) with 50/50 board, chime & resilient sync

**What to build:** Deliver the unlisted, read-only **Basecamp Dashboard** designed for a shared laptop or TV at Basecamp so friends warming up between Rounds can watch who is out on Course, see the next Round countdown with an optional gentle chime, celebrate alphabetical Team 50K progress, and stay reliably synced even across laptop sleep or Wi-Fi blips.

**Blocked by:** 26: Live auto-calculated Badges & Organizer superlatives; 28: Single-channel Realtime sync & mobile background resync

**Status:** resolved

- [x] `unlock_dashboard(p_token)` `SECURITY DEFINER` RPC hashes `p_token` with SHA-256 hex, matches `event_secrets.dashboard_token_hash`, upserts `(auth.uid(), event_id, 'dashboard')` into `session_grants`, and returns `event_id` (displaying a clean invalid-token screen if unmatched).
- [x] `/dashboard/:token` renders the full-screen Variant A airport-board layout:
  - **Full-width header**: Event title, Event-wide collective km counter, active Round pill, live tabular clock, **Badges** ticker toggle, muted-by-default **Chime** toggle, and **Light/Dark** theme toggle (defaulting to dark chalet mode for indoor TVs, with a high-contrast daylight option for sunny rooms).
  - **Left 50% column**: High-contrast **Out on Course** Runner cards showing Runner name, Team, Course, live tabular elapsed time, and calm rough-pace ETA (never turning red or alarming past 60 minutes), stacked above an amber **On Deck** next-Round countdown banner listing who is scheduled next.
  - **Right 50% column**: Alphabetical **Teams** list with large 10-Round 50K progress bars and celebratory milestone callouts (Halfway / 50K Finisher).
  - **Optional bottom ticker**: Toggleable **Live Badges** ticker streaming live auto-calculated Badges and Organizer-awarded superlatives.
- [x] When the user unmutes the **Chime** toggle, a gentle synthesized Web Audio chime fires at T-5 minutes and T-0 before each scheduled Round start without triggering duplicate chimes on re-render.
- [x] The Dashboard stays continuously subscribed to the Event's Realtime channel (never background-pausing after 30s), fetches a fresh full Event snapshot on socket reconnect after laptop sleep or Wi-Fi drops, runs a lightweight **60-second fallback poll** strictly while disconnected, and silently re-calls `unlock_dashboard(token)` before resubscribing if the Anonymous Auth session expires.
- [x] Automated tests verify `unlock_dashboard` token verification and read-only RLS enforcement (all writes rejected under `'dashboard'` scope), 50/50 board rendering without red >60-min alerts, T-5/T-0 chime scheduling while muted by default, and degraded-mode 60-second fallback polling + reconnect resync.

## Comments

- Resolved on integration branch `feat/winter-grind-50k` (merged at `953f6d6`; post-code-review verified at `ce2ea1e` with `npm run typecheck`, 57/57 test files / 224/224 tests passing, and clean `npm run build`).
