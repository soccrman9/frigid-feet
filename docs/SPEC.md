# Winter Grind 50K — Product & Technical Specification

> **Status**: Build-Ready Handoff Specification  
> **Target Event Date**: Early January 2027  
> **Budget**: \$0 (free-tier hosting, database, maps, and CI only)  
> **Companion Artifacts**:
> - Product Truth & Principles: [`PRODUCT.md`](../PRODUCT.md)
> - Domain Glossary: [`GLOSSARY.md`](../GLOSSARY.md)
> - Mobile Visual Direction Sketch (**Polar Field Log**): [`.impeccable/mocks/decision/assigned.html`](../.impeccable/mocks/decision/assigned.html)
> - Race-Day & Dashboard Layout Prototype: [`11-race-day-ui-prototype.html`](../.scratch/frigid-feet-50k/prototypes/11-race-day-ui-prototype.html) *(layout reference only — do not promote directly to production)*

---

## 1. Product Vision, Constraints & Scope

**Winter Grind 50K** is a mobile-first web app (PWA) and read-only **Basecamp Dashboard** built for a small friend group (<30 **Participants**) running a non-competitive 50K relay out of a single **Basecamp**. **Teams** run one 5K **Leg** every hour across 10 **Rounds** to reach 50K together.

### Core Principles & Constraints (from [`PRODUCT.md`](../PRODUCT.md))
- **Glanceable in motion, operable in gloves**: Every race-day state and primary action must be readable in harsh winter sunlight/snow glare at arm's length and tappable with cold, gloved thumbs.
- **Encouragement over competition**: Collective distance, 10-Round completion, and playful **Badges** always outrank individual speed; individual 5K times stay private unless explicitly opted in.
- **Calm under chaos**: Over-60-minute runs never trigger red alarms; offline signal drops queue silently with clear, calm sync status; every check-in tap has an ~8-second Undo.
- **Zero-friction inclusion**: Private to invited friends without email sign-ups, passwords, or PINs; every core flow and **Badge** works without Strava, a GPS watch, or any fitness app.
- **Subtle, non-tacky winter identity**: Clean, modern daylight interface with a restrained "cold" winter feel — never heavy-handed or kitschy (no snowflakes, icicles, or low-contrast frost blurs).
- **Hard budget (\$0) & multi-year reuse**: No credit card required (Cloudflare Pages + Supabase Free + OpenStreetMap + GitHub Actions); all data is scoped by **Event** (e.g., `2027`).

### Explicitly Out of Scope (v1)
- In-app payment processing (Stripe, checkout, refunds) — friends chip in off-app via Venmo/Zelle.
- Legal waiver management or commercial RFID chip-timing hardware.
- Multi-tenant / multi-organizer SaaS administration.
- Paid SMS, transactional email, and Web Push (VAPID) notifications.
- Direct third-party fitness-app APIs/OAuth (Strava, Apple HealthKit, Google Fit/Health Connect) and per-Leg `.gpx`/`.tcx`/`.fit` workout file uploads.
- Live background browser GPS tracking or live runner map pins.
- Peer voting on Badges and PNG share-card image generation.

---

## 2. Domain Model & Ubiquitous Language

All UI copy, database tables, and TypeScript symbols must use the canonical terminology defined in [`GLOSSARY.md`](../GLOSSARY.md):

- **Event** *(not edition, year, race)* — A single dated running (e.g., *Winter Grind 50K 2027*).
- **Basecamp** *(not hub, venue, HQ)* — The single shared facility where every hourly 5K starts and finishes.
- **Course** *(not route, loop, track)* — A named 5K route starting/ending at Basecamp (1–3 per Event; one marked primary).
- **Participant** *(not user, guest, attendee)* — Anyone attending an Event (**Runner** or **Supporter**).
- **Runner** / **Supporter** — A Participant who runs ≥1 5K **Leg** for a **Team**, or attends to cheer/help at Basecamp.
- **Organizer** *(not admin, host)* — Event host with elevated permissions unlocked via a shared Organizer passcode.
- **Team** *(not squad, crew, group)* — 1–10 Runners collaborating to complete 10 hourly 5K Legs (50K total).
- **Free Agent** — A `going_runner` not yet on a Team.
- **Round** *(not hour, lap, wave)* — One of the 10 hourly 5K intervals (Round 1 through Round 10).
- **Leg** *(not lap, segment, stint)* — A single Runner's 5K run for their Team within a specific Round.
- **Badge** *(not accolade, trophy, prize)* — A playful superlative or Team/Participant milestone.
- **Supply** *(not potluck item, amenity, donation)* — A bringable Basecamp item (food, drinks, or gear/first-aid).

---

## 3. Access Control, Identity & Privacy Model

- **Private Event Gate**: All Event data is hidden behind an Event invite code. Shareable invite URLs (`/e/:slug?code=<invite_code>`) and scannable QR codes auto-unlock the Event on first visit and immediately strip `?code=` from the browser URL bar (via `history.replaceState`) so screenshots don't leak the code.
- **Honor-System Participant Identity**: Once unlocked, a friend selects their name from the Event's **Participant** list (or creates a new Participant profile for walk-ins). Their selected `participant_id` is stored in `localStorage` per `event_id` — zero PINs, passwords, or email magic links.
- **Two Roles Only (`Participant` + `Organizer`)**:
  - **Participants** can edit their own RSVP/profile, claim/unclaim **Supplies**, collaborate with teammates on their Team's roster and 10-Round schedule, and check in / log **Legs** for themselves or on a teammate's behalf.
  - **Organizers** unlock admin controls via a shared **Organizer passcode** (usable by host and co-hosts) to edit Event/Basecamp/Course details, post Announcements, manage the chip-in ledger, override any Leg/Team/Round, award Badges, rotate secrets, and export Event snapshots.
- **Privacy Boundaries**:
  - **Server-enforced (Postgres RLS)**: Private Event gate, read-only Basecamp Dashboard, Organizer-only controls, wish-list Supply protection, and **individual chip-in amounts** (`chip_ins` table is strictly Organizer-only; friends see only the aggregate total via RPC).
  - **Honor-system UI guardrails**: Non-Organizer taps are scoped to the Participant's own profile, own Team's Legs, and own Supply claims; `duration_seconds` is hidden in the UI for Runners with `show_times_on_leaderboard = false` (visible only to that Runner when viewing their own Leg).
- **Basecamp Dashboard**: Unlisted, read-only Event-specific URL (`/dashboard/:token`) with a rotatable high-entropy token for one-click display on a shared laptop or TV without exposing Organizer privileges.

---

## 4. Information Architecture, Routing & UX Flows

### 4.1 Route Map
| Route | Purpose |
| --- | --- |
| `/` | Redirects to the active Event (`/e/:slug`) |
| `/e/:slug` | Event invite gate (if locked) → Participant picker (if unselected) → 4-tab Mobile App |
| `/e/:slug?code=<invite_code>` | Auto-calls `unlock_event(slug, code)`, strips `?code=` from URL, enters `/e/:slug` |
| `/dashboard/:token` | Auto-calls `unlock_dashboard(token)`, renders full-screen read-only **Basecamp Dashboard** |

### 4.2 Mobile 4-Tab Navigation (`Home` / `Teams` / `Race Day` / `Supplies`)
- **`Home`**:
  - **Event Info Hub**: Basecamp address + Google/Apple Maps link, parking & facility notes, hourly **Round** schedule (default 8:00 AM–5:00 PM, finishing 6:00 PM), cold-weather gear tips, first-aid/safety notes, and a low-key optional **Strava Club** link.
  - **Announcements Feed**: Chronological Organizer updates (pinned weather/ice/logistics alerts at top).
  - **Courses (1–3 named 5K routes)**: Name, notes, interactive **Leaflet + OpenStreetMap** preview parsed client-side from `courses.gpx_xml`, one-tap `.gpx` download, collapsible **"How to load this Course on your watch or phone"** help accordion (Garmin, Apple Watch / Strava, *"No watch? Just use the map preview above!"*), and optional external route link.
  - **Chip-In Progress Card**: Zero-pressure aggregate bar (`$X of $Y event costs covered`), optional suggested amount + cost breakdown, and one-tap copyable Venmo/Zelle handles.
  - **Participant Profile & RSVP Switcher**: Switch active Participant or edit RSVP (`Going (Runner)`, `Going (Supporter)`, `Maybe`, `Can't make it`), optional Round attendance window (default Rounds 1–10), optional rough 5K pace (minutes), *"First 5K!"* tag, dietary notes, and the **opt-in Speed Leaderboard & time visibility toggle** (default **OFF**).
  - **Secondary Entry Points**: Links/cards to **Event Recap** and **Organizer Mode** (passcode prompt → Organizer drawer/panel for Event/Course/Announcement editing, Chip-In ledger, Organizer Badge awarding, secret rotation, and **Export Event Snapshot (JSON / CSV)**).
- **`Teams`**:
  - Alphabetical **Teams** overview showing Team name/color/emoji, tagline, Open/Closed badge, `X of 10 Rounds covered`, and explicit uncovered Round chips (e.g., `Rounds 4 & 7 open`).
  - **Self-Service Team Creation**: Name, optional tagline/color/emoji, Open/Closed toggle, optional looking-for note (zero invite codes).
  - **One-Tap Join & Free Agents List**: Any `Going (Runner)` can one-tap join an Open Team. Visible **Free Agents** list shows unmatched `Going (Runner)` Participants with their availability window and optional pace. **Organizers** can assign/move any Runner or create Teams for Free Agents.
  - **One Team per Runner & Empty-Team Cleanup**: Teams are Runner-only. Leaving a Team (or switching RSVP away from `Going (Runner)`, with confirmation) returns the Runner to Free Agent status, resets their `'scheduled'` Legs on the old Team to unassigned placeholders (`runner_id = NULL`), preserves `'completed'` and `'out_on_course'` Legs, and auto-deletes the Team if it has 0 Participants and 0 `'completed'` Legs.
  - **10-Row Round Schedule Builder**: Every Team view has Round 1–10 rows where any teammate or Organizer can assign, claim, swap, or unassign a Runner (unlimited / back-to-back Legs allowed; no hard roster lock through race day). Displays **non-blocking gentle warnings** when assigning a Runner outside their RSVP attendance window or to back-to-back Rounds.
- **`Race Day`** *(Mobile Variant B — High-Density Active-Sun Polar Field Log, see Section 4.4)*:
  - Slim single-line top bar (`48px`) with Event title, current Round badge (`R4`), live clock, a `44×44px` Light/Dark toggle, and offline/sync pill (no permanent collective-km banner eating vertical space — collective distance updates surface as a tap-anywhere-to-dismiss / auto-fading celebration toast on Leg completions & milestones, while staying visible on `Home`, **Event Recap**, and the **Basecamp Dashboard**).
  - Full-width `44px`-tall segmented sub-view bar (`Timeline` · `Badges` · `Speed Board`) directly beneath the header for effortless gloved tapping.
  - **Timeline**: Horizontally scrollable **10-Round pill rail** (`R1`–`R10`, each pill `48×44px` minimum, auto-centered on the active Round), high-density hairline-divided Round lineup (showing Runner, Team, Course, status chip, right-aligned `16px` tabular elapsed time + `12px` ETA, flush `4px` bottom ETA progress bar, real `44px`-tall `Start`/`Finish` action buttons for role-scoped actions, Organizer **"Start Round N"** button, and gentle 60+ min *"Forgot to check in?"* prompt), and compact hairline-divided alphabetical **Team** 50K 10-segment progress rows.
  - **Sticky Bottom Thumb-Zone Action Dock**: High-salience dark-navy dock pinning the signed-in Runner's current or next Leg (1-line countdown/elapsed timer + **`56px`** gloved-thumb primary Start/Finish CTA) directly above the `56px` 4-tab nav bar.
  - **Badges Sub-View**: Live auto-calculated Team & Participant Badges + Organizer-awarded superlatives.
  - **Speed Leaderboard Sub-View**: Viewable by all signed-in Participants; ranks **only** Runners with `show_times_on_leaderboard = true` individually (fastest single 5K Leg + average 5K time across their Legs — no Team speed rankings).
- **`Supplies`**:
  - **Dietary Summary Banner** aggregating all non-empty Participant `dietary_notes`.
  - **Organizer Wish List**: Categorized (`Food`, `Drinks`, `Gear / First Aid`) items with target slot counts (e.g., `2 of 3 claimed`) and one-tap claim/unclaim with optional note.
  - **Volunteered Supplies**: Any Participant can add free-form items they're bringing (and edit/delete their own volunteered items).

### 4.3 Race-Day Mechanics, Badges & Post-Race Recap
- **Hourly Mass Starts (No Rolling Baton)**: 10 independent hourly Rounds (default 8:00 AM–5:00 PM, ending 6:00 PM). Zero penalty for >60-minute finishes; the next Round starts on the hour regardless, and slower Runners receive full 5K credit. Missed Legs stay open as unassigned placeholders for make-up runs.
- **Hybrid Leg Tracking (`scheduled` → `out_on_course` → `completed`)**:
  - **Organizer Mass-Start**: **"Start Round N"** opens a quick-uncheck confirmation sheet listing scheduled Runners for that Round (so late starters can be unchecked), then calls `start_round(...)`. No bulk-undo RPC — accidental single-Runner starts are reverted individually.
  - **Individual Start / Finish / Mark Completed**: Scoped to the Runner, teammates, and Organizers (never general Supporters). Course defaults to the Event's primary Course (editable pre-race, on Start, or on Finish). Finish auto-calculates elapsed time (editable with watch time, or left blank when opted out of times). Direct **"Mark Completed"** supports retroactive logging.
  - **Optional External Activity Link**: On any completed Leg, the Runner (or teammate/Organizer) may paste a safe `https://` URL (e.g., Strava activity), rendered as a subtle outbound *"View activity"* pill.
  - **Forgiving Undo & Reverts**: Every Start/Finish tap triggers an accessible **~8-second Undo toast** (`popover="manual"`). Status, Course, or time can also be edited or reverted anytime.
- **10 Auto-Calculated Badges (Computed Client-Side from Live State)**:
  - **Team Badges**:
    1. *Halfway There* — Team has ≥5 completed Legs (25K).
    2. *50K Finisher* — Team has 10/10 completed Legs (50K).
    3. *Full Squad* — Team has ≥1 current Runner and **every Runner currently on the Team** has completed ≥1 Leg.
  - **Participant Badges**:
    4. *First 5K Club* — `is_first_5k = true` and completed ≥1 Leg.
    5. *Dawn Patrol* — Completed a Round 1 Leg.
    6. *Anchor Leg* — Completed a Round 10 Leg.
    7. *Back-to-Back* — Completed Legs in 2 consecutive Rounds (e.g., Round `N` and `N+1`).
    8. *Distance Machine* — Completed ≥3 Legs.
    9. *Course Explorer* — Completed Legs across ≥2 distinct `course_id`s.
    10. *Basecamp Hero* — Has ≥1 active row in `supply_claims` or created a volunteered `supply_items` entry.
- **Organizer-Awarded Superlatives**: 5 pre-seeded presets per Event (*Best Cold-Weather Outfit*, *Cheer Squad MVP*, *Best Snack Contributor*, *Most Encouraging*, *Best Vibes at Basecamp*) + UI to create custom Badges (name, emoji, description) and award to any Participant or Team.
- **Event Recap & Copy Buttons**: Displays optional `events.recap_note`, Event-wide total km, Team 50K completions, and full Badge showcase, plus two one-tap clipboard buttons:
  - **Copy Event Recap** (formatted for iMessage/WhatsApp group chats).
  - **Copy My Run Summary** (neutral copy with *"Great for Strava or group chat"* hint; summarizes the Participant's Legs/km, Team, Courses, and Badges).

### 4.4 UI/UX Design System, Components & Prototype Requirements

The mobile app follows the **Polar Field Log** visual direction (`seed:e85c674a9635f864`, **Operate** mode) — anchored on **Race Day** as the primary outdoor-in-motion surface. Reference [`.impeccable/mocks/decision/assigned.html`](../.impeccable/mocks/decision/assigned.html) for the mobile visual language and [`11-race-day-ui-prototype.html`](../.scratch/frigid-feet-50k/prototypes/11-race-day-ui-prototype.html) for Variant B (mobile) and Variant A (Basecamp Dashboard) layout structure.

#### Visual Language & Tokens (Polar Field Log)
- **Atmosphere**: Inspired by arctic field logs and polar hydrographic charts — crisp daylight legibility and a subtle, modern "cold" feeling achieved through glacial-white grounds, cool polar-navy structural ink, and crisp hairline rules. **Explicit anti-goals**: zero cartoonish snowflakes/icicles, zero frosted-glass blurs that wash out in sunlight, zero low-contrast pastel text, and zero red stress alarms for >60-minute Legs.
- **Color Palette (Light Primary for Daytime Winter Sun + High-Contrast Dark Option for R1/R10 Dusk)**:
  - **Ground & Surfaces**: Ice-sheet ground `#F4F8FB`, crisp card surface `#FFFFFF`, pale frost-tint structural rail `#E3EDF5`, hairline structural border `#B8CFE0` / `#8DAAC2`.
  - **Shell & Ink**: Polar-slate header shell `#163A59`, deep polar-navy primary ink & thumb dock `#0C1E30`, secondary slate ink `#3B556E` (WCAG AAA-aimed outdoor contrast).
  - **Semantic State Colors (always paired with non-color cues)**:
    - *Out on Course / Primary Action*: High-vis signal-amber `#C86D09` / `#E08A1E` (dark-navy `#0C1E30` label text on amber CTA for crisp glare contrast).
    - *Completed / Milestone*: Deep spruce `#157A4B` (border `#0F5936`).
    - *Collective Progress Fill*: Glacier-sky `#7CC4FA` on dark polar-navy transect track.
  - **Theme Toggle**: Honor `prefers-color-scheme` with a manual Light/Dark toggle in the header (Light optimized for bright snow/sun glare; Dark optimized for 8:00 AM Round 1 and 5:00 PM Round 10).
- **Typography**: Clean geometric/neo-grotesque UI sans (e.g., `IBM Plex Sans` or crisp system sans) paired with tabular numerals (`font-variant-numeric: tabular-nums` / `JetBrains Mono` for telemetry) so live clocks, elapsed timers, ETAs, and km totals align vertically for effortless mid-stride scanning.

#### Core Mobile UI Components & Signature Patterns (High-Density + Active-Sun Ergonomics)
Density is achieved by removing non-interactive chrome and bulky card margins — **never** by shrinking interactive controls below gloved-thumb touch targets (`44px` minimum everywhere; `56px` primary CTA).

- **Slim Single-Line Header (`48px`)**: Polar-navy top bar carrying only Event name (`Winter Grind 50K`), active Round badge (`R4`), live `14px` tabular clock, a full `44×44px` Light/Dark toggle, and offline/sync status — reclaiming ~80px of vertical space for live data.
- **Transient Collective Distance Notification (Toast)**: Instead of a permanent header bar, collective distance milestones (*"Friends hit 95 km together!"* / *"100 km reached!"*) appear as a tap-anywhere-to-dismiss, auto-fading (~5s) polar-navy toast (no tiny close button to hunt for while moving). Full collective distance remains permanently visible on `Home`, **Event Recap**, and the **Basecamp Dashboard**.
- **Gloved-Thumb Sub-View Switcher (`44px`)**: 3-column segmented control (`Timeline` · `Badges` · `Speed Board`) with a full `44px` tap height and crisp white/navy active state.
- **Gloved-Thumb 10-Round Pill Rail (`R1`–`R10`)**: Horizontally scrollable frost-tint rail with **`48×44px`** minimum pill targets (auto-scrolled to center the active Round) using crisp 1px geometric state detents rather than soft drop shadows: outline = upcoming, solid spruce = completed, deep polar-navy with `4px` amber bottom indicator = active Round.
- **High-Density Hairline-Divided Runner Lineup**: Unified white container with `1px` hairline row dividers (`#C6D9E8`) and high-glare contrast (`#0C1E30` primary / `#243B53` secondary — >10:1 on white):
  - *Out on Course*: Subtle warm-tinted row (`#FFFBF0`), inline `OUT` chip, `15px` bold Runner name + `13px` Team/Course on the left, right-aligned `16px` tabular elapsed time + `12px` ETA on the right, and a flush `4px` proportional ETA progress bar along the row's bottom edge (no heavy colored left borders).
  - *Inline Row Actions (`Start` / `Finish`)*: Whenever a Runner row exposes a quick action (e.g., starting a late Runner or finishing a teammate), render a real **`44px`-tall high-contrast button** (`min-width: 82px`, `#163A59` fill with white `14px` bold text) rather than a small text link.
- **Compact Team 50K Progress List (Signature Pattern)**: Single hairline-divided alphabetical list pairing `14px` Team name, `13px` tabular `X / 50 km` counter, and a crisp hairline-ruled 10-segment progress strip (`done` = spruce, `active` = amber, `open` = ice-sheet outline) so multiple Teams stay visible alongside the active Round lineup.
- **High-Vis Sticky Bottom Thumb-Zone Action Dock**: Dark polar-navy dock pinned directly above the 4-tab bar, featuring a 1-line `12px` Leg meta strip (`YOUR LEG · R4 BOARDWALK 5K · OUT 24:18`) and a **`56px`** gloved-thumb primary CTA (`18px` bold `#0C1E30` text on `#E08A1E` amber). Adapts cleanly by state:
  - *Next Leg upcoming*: Countdown + *"Start Early"* CTA.
  - *Out on Course*: Live elapsed timer + *"Finish My 5K Leg"* CTA.
  - *All Legs completed*: *"All Done Today — View Event Recap"*.
  - *Supporter*: Dock hidden to maximize vertical reading space.
- **Persistent 4-Tab Bottom Navigation (`Home` / `Teams` / `Race Day` / `Supplies`)**: `56px` tall (~97×56px per tab) with a crisp `3px` top-edge active indicator bar on the selected tab.
- **Feedback, Offline & Nudge Components**:
  - **~8-Second Undo Toast**: Accessible `popover="manual"` toast with a `44px`-tall **Undo** button rising cleanly above the thumb dock after any Start/Finish tap (takes priority over collective-distance toasts).
  - **60+ Minute Calm Nudge**: Neutral inline *"Forgot to check in?"* prompt on mobile (scoped to Runner/teammates/Organizer) — never red or alarming.
  - **Offline & Sync Chrome**: Non-blocking top banner (*"Offline — showing last saved view (updated Xm ago)"*) + tappable `44px`-tall *"Saved locally (N) — Sync now"* pill; structural non-Leg actions show a clear *"Requires connection"* disabled state; stale offline overrides show a brief neutral *"Updated to latest Basecamp status"* toast.

#### Basecamp Dashboard (TV/Laptop — Variant A)
- **Full-width header**: Event title, collective km counter, current Round pill, live clock, **Badges** ticker toggle, muted-by-default **Chime** toggle (gentle Web Audio chime at T-5 min and T-0), and **Light/Dark** theme toggle (dark chalet default for indoor TVs; high-contrast daylight option for sunny rooms).
- **50/50 split**: Left column stacks high-contrast **Out on Course** Runner cards (name, Team, Course, elapsed time, calm ETA — **no red stress alerts past 60 min**) above an amber **On Deck** next-Round countdown banner; right column lists all **Teams** alphabetically with large 10-segment 50K bars and milestone callouts.
- Optional toggleable **Live Badges** ticker pinned across the bottom.

#### Accessibility & Cold-Weather Ergonomics (from [`PRODUCT.md`](../PRODUCT.md))
- Minimum `44px` touch targets across all interactive elements (`52px` primary dock CTA for gloved thumbs).
- Non-color-only state cues everywhere (icons, pattern/border weight, and explicit text labels paired with every semantic color).
- Accessible `popover="manual"` Undo toast and clear focus states without nested/complex mid-run modals.

---

## 5. System Architecture & \$0 Tech Stack

| Layer | Technology | Key Rationale |
| --- | --- | --- |
| **Frontend / PWA** | **Vite + React + TypeScript + Tailwind CSS** (`vite-plugin-pwa`, `idb`, **Leaflet + OpenStreetMap**) | Single repo serves both mobile app and `/dashboard/:token`; fast 6-week build; zero map API keys. |
| **Hosting** | **Cloudflare Pages** (`*.pages.dev`, private GitHub repo) | \$0 unlimited bandwidth, automatic HTTPS, PR preview deploys. |
| **Backend & DB** | **Supabase Free** (Postgres + Realtime + Anonymous Auth + SQL RPCs/RLS) | \$0, no credit card, relational schema, 200 concurrent Realtime connections, **zero Edge Functions**. |
| **Auth / Grants** | `signInAnonymously()` + `SECURITY DEFINER` unlock RPCs + `session_grants` RLS | Avoids Supabase's 2-email/hr SMTP cap; enforces server-side privacy and instant secret rotation. |
| **Course `.gpx`** | Stored directly in Postgres `courses.gpx_xml` (`TEXT`) | Organizers add/edit Courses without redeploying or managing Storage buckets. |
| **Pause Prevention** | **GitHub Actions** cron every **3 days** calling `ping_heartbeat()` | Prevents Supabase Free's 7-day inactivity pause. |
| **Backups** | In-app **Organizer "Export Event Snapshot (JSON / CSV)"** | One-tap pre-race backup and post-Event archive without storing friend PII in CI artifacts. |

**Environment Variables (Cloudflare Pages)**: Only public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Invite codes, Organizer passcodes, and Dashboard tokens live hashed in `event_secrets` inside Postgres.

---

## 6. Canonical Postgres Schema, RPCs & RLS Matrix

Deploy the **complete 13-table schema in Phase 1** so Phase 2 requires zero breaking migrations. All domain tables include `event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE`.

### 6.1 Tables (13)
1. **`events`**: `id (uuid PK)`, `slug (text UNIQUE NOT NULL)`, `name (text NOT NULL)`, `event_date (date)`, `start_time (timestamptz)`, `timezone (text)`, `is_active (boolean DEFAULT false)`, `basecamp_name (text)`, `basecamp_address (text)`, `basecamp_maps_url (text)`, `parking_amenities_notes (text)`, `cold_weather_tips (text)`, `safety_first_aid_notes (text)`, `strava_club_url (text)`, `recap_note (text)`, `chip_in_target_cents (int DEFAULT 0)`, `chip_in_suggested_cents (int)`, `chip_in_breakdown (jsonb DEFAULT '[]')`, `venmo_handle (text)`, `zelle_handle (text)`, `created_at (timestamptz DEFAULT now())`.
2. **`event_secrets`** *(zero client RLS access; `SECURITY DEFINER` RPCs only)*: `event_id (uuid PK REFERENCES events(id) ON DELETE CASCADE)`, `invite_code_hash (text NOT NULL)` *(pgcrypto bcrypt)*, `organizer_passcode_hash (text NOT NULL)` *(pgcrypto bcrypt)*, `dashboard_token_hash (text UNIQUE NOT NULL)` *(SHA-256 hex)*, `updated_at (timestamptz DEFAULT now())`.
3. **`session_grants`**: `auth_uid (uuid NOT NULL)`, `event_id (uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE)`, `scope (text NOT NULL CHECK (scope IN ('participant', 'organizer', 'dashboard')))`, `granted_at (timestamptz DEFAULT now())`, `PRIMARY KEY (auth_uid, event_id, scope)`.
4. **`courses`**: `id (uuid PK)`, `event_id`, `name (text NOT NULL)`, `description (text)`, `distance_km (numeric(4,2) DEFAULT 5.00)`, `is_primary (boolean DEFAULT false)`, `gpx_xml (text)`, `external_route_url (text CHECK (external_route_url IS NULL OR (external_route_url ~ '^https://' AND length(external_route_url) <= 500)))`, `sort_order (int DEFAULT 0)`.
5. **`announcements`**: `id (uuid PK)`, `event_id`, `title (text)`, `body (text NOT NULL)`, `is_pinned (boolean DEFAULT false)`, `created_at (timestamptz DEFAULT now())`.
6. **`rounds`**: `id (uuid PK)`, `event_id`, `round_number (int NOT NULL CHECK (round_number BETWEEN 1 AND 10))`, `scheduled_start_at (timestamptz NOT NULL)`, `started_at (timestamptz)`, `UNIQUE (event_id, round_number)`. *(10 rows pre-seeded per Event.)*
7. **`teams`**: `id (uuid PK)`, `event_id`, `name (text NOT NULL)`, `tagline (text)`, `color_hex (text)`, `emoji (text)`, `is_open (boolean DEFAULT true)`, `looking_note (text)`, `created_at (timestamptz DEFAULT now())`.
8. **`participants`**: `id (uuid PK)`, `event_id`, `display_name (text NOT NULL)`, `rsvp_status (text NOT NULL CHECK (rsvp_status IN ('going_runner', 'going_supporter', 'maybe', 'cant_make_it')))`, `team_id (uuid REFERENCES teams(id) ON DELETE SET NULL)`, `available_from_round (int DEFAULT 1 CHECK (available_from_round BETWEEN 1 AND 10))`, `available_to_round (int DEFAULT 10 CHECK (available_to_round BETWEEN 1 AND 10))`, `rough_5k_minutes (int)`, `is_first_5k (boolean DEFAULT false)`, `dietary_notes (text)`, `show_times_on_leaderboard (boolean DEFAULT false)`, `created_at (timestamptz DEFAULT now())`, `CHECK (available_from_round <= available_to_round)`.
9. **`legs`**: `id (uuid PK)`, `event_id`, `team_id (uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE)`, `round_number (int NOT NULL CHECK (round_number BETWEEN 1 AND 10))`, `runner_id (uuid REFERENCES participants(id) ON DELETE SET NULL)`, `course_id (uuid REFERENCES courses(id) ON DELETE SET NULL)`, `status (text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'out_on_course', 'completed')))`, `started_at (timestamptz)`, `finished_at (timestamptz)`, `duration_seconds (int CHECK (duration_seconds IS NULL OR duration_seconds > 0))`, `external_activity_url (text CHECK (external_activity_url IS NULL OR (external_activity_url ~ '^https://' AND length(external_activity_url) <= 500)))`, `client_updated_at (timestamptz DEFAULT now())`, `last_mutation_id (uuid)`, `updated_by_organizer (boolean DEFAULT false)`, `UNIQUE (team_id, round_number)`. *(10 placeholder rows pre-seeded automatically whenever a Team is created.)*
10. **`supply_items`**: `id (uuid PK)`, `event_id`, `category (text NOT NULL CHECK (category IN ('food', 'drinks', 'gear_first_aid')))`, `name (text NOT NULL)`, `is_wishlist (boolean NOT NULL DEFAULT false)`, `target_slots (int CHECK (target_slots IS NULL OR target_slots >= 1))`, `created_by_participant_id (uuid REFERENCES participants(id) ON DELETE SET NULL)`, `created_at (timestamptz DEFAULT now())`.
11. **`supply_claims`**: `id (uuid PK)`, `event_id`, `supply_item_id (uuid NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE)`, `participant_id (uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE)`, `note (text)`, `created_at (timestamptz DEFAULT now())`.
12. **`chip_ins`** *(strictly Organizer-only RLS)*: `id (uuid PK)`, `event_id`, `participant_id (uuid REFERENCES participants(id) ON DELETE SET NULL)`, `amount_cents (int NOT NULL CHECK (amount_cents > 0))`, `note (text)`, `recorded_at (timestamptz DEFAULT now())`.
13. **`badge_definitions` & `badge_awards`** *(Organizer-awarded superlatives only)*:
    - `badge_definitions`: `id (uuid PK)`, `event_id`, `name (text NOT NULL)`, `emoji (text NOT NULL)`, `description (text)`, `is_preset (boolean DEFAULT false)`. *(5 presets pre-seeded per Event.)*
    - `badge_awards`: `id (uuid PK)`, `event_id`, `badge_definition_id (uuid NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE)`, `participant_id (uuid REFERENCES participants(id) ON DELETE CASCADE)`, `team_id (uuid REFERENCES teams(id) ON DELETE CASCADE)`, `note (text)`, `awarded_at (timestamptz DEFAULT now())`, `CHECK ((participant_id IS NOT NULL) <> (team_id IS NOT NULL))`.

### 6.2 `SECURITY DEFINER` RPC Surface
- `unlock_event(p_slug text, p_code text) → uuid` — Verifies `invite_code_hash`, upserts `(auth.uid(), event_id, 'participant')` into `session_grants`.
- `unlock_organizer(p_event_id uuid, p_passcode text) → boolean` — Verifies `organizer_passcode_hash`, upserts `'participant'` + `'organizer'` grants.
- `unlock_dashboard(p_token text) → uuid` — Matches SHA-256 hex against `dashboard_token_hash`, upserts `'dashboard'` grant.
- `rotate_event_secret(p_event_id uuid, p_secret_type text, p_new_value text)` *(Organizer only)* — Updates hash and deletes existing `session_grants` for the rotated scope (preserving the calling Organizer's own session when rotating `'organizer'`).
- `get_chip_in_summary(p_event_id uuid) → int` *(Participant or Organizer)* — Returns `COALESCE(SUM(amount_cents), 0)` only (no contributor count or rows).
- `AFTER INSERT ON teams` trigger (or `create_team` RPC) — Atomically pre-seeds 10 placeholder `legs` (`round_number` 1–10, `status = 'scheduled'`, `runner_id = NULL`, `course_id` = Event's primary Course).
- `leave_team(p_participant_id uuid)` — Atomically clears `participants.team_id`, resets `'scheduled'` Legs on the old Team to `runner_id = NULL` (preserving `'completed'` and `'out_on_course'` Legs), and deletes the Team if it has 0 Participants and 0 `'completed'` Legs.
- `start_round(p_event_id uuid, p_round_number int, p_exclude_leg_ids uuid[], p_started_at timestamptz)` *(Organizer only)* — Atomically sets `rounds.started_at = p_started_at` and transitions all non-excluded assigned `'scheduled'` Legs in that Round to `status = 'out_on_course'`, `started_at = p_started_at`, `client_updated_at = p_started_at`, `updated_by_organizer = true`.
- `apply_leg_mutation(...)` — Idempotent Leg mutation RPC with conflict resolution (see Section 7.3).
- `create_event(...)` — Provisioning SQL helper run once per year in Supabase SQL Editor (seeds `events`, `event_secrets`, 10 `rounds`, and 5 preset `badge_definitions`).
- `ping_heartbeat() → boolean` — Lightweight read-only RPC pinged every 3 days by GitHub Actions.

### 6.3 Row-Level Security (RLS) Matrix
Helper predicate: `has_grant(event_id, scopes text[])` checks `session_grants` for `auth_uid = auth.uid()`.

| Table | `dashboard` | `participant` | `organizer` |
| --- | --- | --- | --- |
| `event_secrets` | None | None | None *(RPCs only)* |
| `session_grants` | Own `SELECT` | Own `SELECT` | Own `SELECT` |
| `events`, `courses`, `announcements`, `rounds`, `badge_definitions`, `badge_awards` | `SELECT` | `SELECT` | `SELECT` + `INSERT`/`UPDATE`/`DELETE` |
| `participants`, `teams`, `legs`, `supply_claims` | `SELECT` | `SELECT` + `INSERT`/`UPDATE`/`DELETE` | `SELECT` + `INSERT`/`UPDATE`/`DELETE` |
| `supply_items` | `SELECT` | `SELECT`; write **only where `is_wishlist = false`** | `SELECT` + `INSERT`/`UPDATE`/`DELETE` (all) |
| `chip_ins` | None | None *(aggregate via `get_chip_in_summary`)* | `SELECT` + `INSERT`/`UPDATE`/`DELETE` |

*(Snapshot export queries standard RLS-protected tables only and never touches `event_secrets`.)*

---

## 7. Realtime Sync & Offline Check-In Reconciliation

### 7.1 Supabase Realtime Channel & Connection Budget
- **Single multiplexed channel per active tab**: Subscribe to `postgres_changes` filtered by `event_id=eq.<event_id>` across `legs`, `rounds`, `teams`, `participants`, `announcements`, `badge_awards`, `badge_definitions`, `supply_items`, `supply_claims`, `events`, and `courses`. Enable `supabase_realtime` publication and `REPLICA IDENTITY FULL` on deletable tables so filtered `DELETE` events include `event_id`.
- **Mobile tabs**: Unsubscribe after ~30 seconds hidden (`visibilitychange`), then reconnect and fetch a full Event snapshot upon returning to foreground (~30–40 concurrent connections max vs. 200 Free limit).
- **Basecamp Dashboard (`/dashboard/:token`)**: Stay connected continuously; fetch a full snapshot on reconnect after laptop sleep/Wi-Fi drop; run a **60-second fallback poll** only while disconnected. If Anonymous Auth expires, silently re-call `unlock_dashboard(token)` before resubscribing.

### 7.2 Service Worker Caching & IndexedDB Snapshot
- **`vite-plugin-pwa` (Workbox)**: `CacheFirst` precache for the static app shell; best-effort runtime `CacheFirst` (with expiration) for previously viewed Leaflet/OSM tiles. Never force-reload mid-tap while `leg_mutation_queue` is non-empty — show a gentle *"Update available — Reload"* prompt when idle.
- **IndexedDB `event_snapshot` store (`idb`)**: Keyed by `event_id` (`{ event_id, data, last_synced_at }`). On offline cold launch, hydrate immediately from `event_snapshot`, overlay pending `leg_mutation_queue` items optimistically, and show *"Offline — showing last saved view (updated Xm ago)"*.

### 7.3 Offline Leg Queue, Reconciliation & Undo
- **Leg-only offline writes**: Individual Leg actions (`start`, `finish`, `mark_completed`, `edit`, `revert`) queue in IndexedDB; structural & Organizer-bulk actions (RSVP, Team create/join/leave, Supply claims, `Start Round N`, chip-ins, Organizer Badges) show a disabled *"Requires connection"* state offline.
- **IndexedDB `leg_mutation_queue` store (FIFO by `queued_at`)**: `mutation_id (uuid PK)`, `event_id`, `leg_id`, `action_type`, `payload ({ status, started_at, finished_at, duration_seconds, course_id, external_activity_url })`, `is_explicit_revert (boolean)`, `client_updated_at (timestamptz)`, `previous_leg_snapshot`, `queued_at`, `retry_count`, `sync_state ('pending' | 'syncing')`.
- **Flush triggers & UI**: Auto-flush FIFO on `online`, `visibilitychange` (`visible`), `focus`, and a 15-second exponential backoff timer while non-empty. Display a tappable **"Saved locally (N) — Sync now"** pill whenever queued items exist. Preserve queue across expired sessions until re-unlock.
- **`apply_leg_mutation(...)` Conflict Rules**:
  1. **Idempotency**: If `legs.last_mutation_id = p_mutation_id`, return `{ applied: true, reason: 'duplicate', leg }`.
  2. **Organizer precedence**: Organizer writes win over non-Organizer writes (including ties). Non-Organizer writes cannot overwrite an `updated_by_organizer = true` Leg if `p_client_updated_at <= legs.client_updated_at`, while strictly newer non-Organizer taps (e.g., finishing 30 min after mass-start) succeed normally.
  3. **Participant vs. Participant**: Newest `client_updated_at` wins, with a no-regress guard: a delayed offline `out_on_course` never overwrites `completed` unless `p_is_explicit_revert = true`.
  4. **Stale conflict UX**: On `{ applied: false, reason: 'stale_or_overridden', leg }`, drop the stale queue item, sync local state with the server `leg`, and show a brief neutral toast (*"Updated to latest Basecamp status"*).
- **~8-Second Undo Toast**:
  - If tapped while still pending locally: delete from `leg_mutation_queue` and restore `previous_leg_snapshot` locally (zero network call).
  - If tapped after flush: send a compensating `apply_leg_mutation` restoring `previous_leg_snapshot` with `action_type = 'revert'` and `is_explicit_revert = true`.

---

## 8. Six-Week Phased Launch Plan (Nov 24, 2026 → Early Jan 2027)

### Phase 1 — Pre-Race Live ASAP (Target: Dec 7, 2026)
- **Week 1 (Nov 24–30) — Foundation & Event Info**:
  - Bootstrap private GitHub repo, Vite + React + TypeScript + Tailwind CSS, Cloudflare Pages deploy, and Supabase Free project.
  - Deploy complete 13-table Postgres schema, RLS policies, all `SECURITY DEFINER` RPCs, `create_event` seed for `2027`, and 3-day GitHub Actions `ping_heartbeat` workflow.
  - Build Event invite gate (`/e/:slug?code=...` auto-unlock + URL strip), honor-system Participant picker, and `Home` Event Info + Course Leaflet `.gpx` preview/download + GPX how-to accordion.
- **Week 2 (Dec 1–7) — Pre-Race Collaboration & Phase 1 Go-Live**:
  - Build Announcements feed, RSVP & Participant profile editor, `Supplies` tab (dietary banner + wish list + volunteer items), and `Teams` tab (Team creation, Open/Closed join, Free Agents, 10-Round schedule builder with non-blocking warnings).
  - Build Organizer Mode (passcode unlock, Event/Course/Announcement editor, Chip-In ledger + friend aggregate card, **Export Event Snapshot (JSON / CSV)**).
  - **Acceptance Gate**: Friends can unlock via link/QR, RSVP, view/download Courses, claim Supplies, form Teams, and schedule Rounds 1–10.

### Phase 2 — Race Day, Dashboard & Recap (Target: Dec 28, 2026)
- **Week 3 (Dec 8–14) — Mobile Race Day**:
  - Build Mobile `Race Day` tab (Variant B: 10-Round pill rail, chronological lineup, alphabetical Team 50K bars, sticky thumb-zone action dock, Light/Dark theme toggle).
  - Wire `apply_leg_mutation`, ~8s `popover="manual"` Undo toast, anytime edit/revert, optional `https://` activity URL, gentle 60+ min check-in prompt, and Organizer **"Start Round N"** confirmation sheet.
- **Week 4 (Dec 15–21) — Basecamp Dashboard & Realtime**:
  - Build `/dashboard/:token` (Variant A: 50/50 split airport board, Out on Course cards, On Deck countdown, alphabetical Team 50K bars, toggleable Badges ticker, muted-by-default T-5/T-0 Web Audio chime, Light/Dark toggle).
  - Wire single-channel Supabase Realtime (30s mobile background pause + foreground resync; Dashboard continuous connection + reconnect resync + 60s degraded poll).
- **Week 5 (Dec 22–28) — Offline Queue, Badges, Leaderboard & Recap**:
  - Wire `vite-plugin-pwa` Service Worker caching, IndexedDB `event_snapshot` + `leg_mutation_queue` FIFO reconciliation + manual sync pill.
  - Implement all 10 client-side auto-Badges, Organizer superlatives UI, opt-in **Speed Leaderboard**, and **Event Recap** + **Copy Event Recap** / **Copy My Run Summary** buttons.
  - **Acceptance Gate**: Full end-to-end race simulation works online and offline across mobile + Dashboard.

### Week 6 (Dec 29 – Race Week) — Polish & Dry-Run
- Gloved-finger touch-target audit (44px+ / 48px+ dock CTA), outdoor sunlight readability check, bug fixes, and completion of the Pre-Race Dry-Run Checklist below.

---

## 9. Pre-Race Dry-Run & Go-Live Checklist

1. **Offline check-in test**: Verify airplane-mode Leg Start/Finish, ~8s Undo (both pre-flush and post-flush), and reconnect flush on both iOS Safari and Android Chrome.
2. **Basecamp Dashboard soak test**: Run `/dashboard/:token` for 30+ minutes on the Basecamp laptop/TV, testing laptop sleep/wake, Wi-Fi disconnect/reconnect recovery, and T-5/T-0 chime audio.
3. **48-hour backend health check**: Confirm Supabase Free project is active and the 3-day GitHub Actions `ping_heartbeat` workflow is green.
4. **Course `.gpx` verification**: Verify all 1–3 Courses render cleanly on Leaflet, download valid `.gpx` files, and have the correct primary Course default.
5. **Backup & clean-slate check**: Run Organizer JSON/CSV snapshot export, verify exported files open cleanly, and clear any dry-run test Legs/Participants before race morning.
6. **Race-morning access kit**: Print or save the Event invite QR code for walk-in friends and bookmark `/dashboard/:token` on the Basecamp laptop.
