# 16: App bootstrap, full Postgres schema/RLS, heartbeat & Event invite gate

**What to build:** Stand up the Winter Grind 50K web app foundation and backend so an invited friend can open the app root or a shareable Event invite link, automatically unlock the private Event without an account or password (with the invite code immediately stripped from the URL bar), land in the Polar Field Log 4-tab mobile shell with Light/Dark theme support, and rely on a complete Phase 1 Postgres schema with server-enforced access control and automated pause prevention.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Vite + React + TypeScript + Tailwind CSS app is bootstrapped with a unit/integration test runner, SPA fallback routing configured for Cloudflare Pages deep links (`/e/:slug` and `/dashboard/:token`), and public-only Supabase environment configuration (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- [x] Complete 13-table Event-scoped Postgres schema is deployed in a single non-breaking foundation migration (`events`, `event_secrets`, `session_grants`, `courses`, `announcements`, `rounds`, `teams`, `participants`, `legs`, `supply_items`, `supply_claims`, `chip_ins`, `badge_definitions`, `badge_awards`), with all constraints, `supabase_realtime` publication enabled, and `REPLICA IDENTITY FULL` on deletable tables.
- [x] Row-Level Security (`has_grant` against `session_grants`) enforces the full access matrix: `event_secrets` has zero client access, `chip_ins` is Organizer-only, `supply_items` protects wish-list rows from non-Organizer writes, `dashboard` is strictly read-only, and ungranted sessions cannot read any Event data.
- [x] Provisioning helper `create_event(...)` creates an Event with hashed `event_secrets` (bcrypt invite code and Organizer passcode, SHA-256 Dashboard token), 10 pre-seeded hourly `rounds`, and the 5 preset `badge_definitions`.
- [x] `unlock_event(p_slug, p_code)` verifies the invite code via `SECURITY DEFINER`, grants `'participant'` scope to the Anonymous Auth session, and returns `event_id`; a read-only active-slug lookup lets `/` redirect to the active Event (`/e/:slug`) without leaking private Event details before unlock.
- [x] Visiting `/e/:slug?code=<invite_code>` establishes an Anonymous Auth session, unlocks the Event automatically, and immediately strips `?code=` via `history.replaceState`; visiting `/e/:slug` without a grant shows a clean manual invite-code entry screen with clear error feedback on invalid codes.
- [x] Unlocked mobile shell implements the Polar Field Log design tokens (light daytime primary `#F4F8FB`/`#FFFFFF`/`#163A59`/`#0C1E30`/`#C86D09`/`#157A4B` plus high-contrast dark mode honoring `prefers-color-scheme`), a `48px` slim single-line header (Event title, live tabular clock, `44×44px` Light/Dark toggle), a `56px` 4-tab bottom navigation bar (`Home`, `Teams`, `Race Day`, `Supplies`) with `3px` active indicator, and a shared Event data container ready for downstream tabs and Realtime updates.
- [x] `ping_heartbeat()` RPC and a scheduled 3-day GitHub Actions workflow keep the Supabase Free project active against the 7-day inactivity pause.
- [x] Automated tests verify invite-code unlock, URL stripping, invalid-code handling, and RLS isolation for ungranted sessions.

## Comments

- Resolved on integration branch `feat/winter-grind-50k` (merged at `133b579`; post-code-review verified at `ce2ea1e` with `npm run typecheck`, 57/57 test files / 224/224 tests passing, and clean `npm run build`).
