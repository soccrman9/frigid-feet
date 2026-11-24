# Canonical Data Model, Postgres Schema, and RLS Access Rules

Type: grilling
Status: resolved
Blocked by: 12

## Context

Graduated from **Not yet specified** after locking in **Supabase Free** (Postgres + Anonymous Auth + `SECURITY DEFINER` unlock RPCs + `session_grants` RLS) in [Tech Stack Selection and 6-Week Build Architecture](./12-tech-stack-and-architecture.md).

## Question

What is the exact canonical Postgres schema, RPC surface, and Row-Level Security (RLS) policy design for **Frigid Feet 50K Relay** so Phase 1 can deploy the complete schema once with zero breaking migrations in Phase 2?

Specifically decide:
- Exact tables, key columns, constraints, and relationships for **Events**, **Courses** (including `gpx_xml`), Announcements, **Participants**, **Teams**, **Rounds**, **Legs**, **Supplies**, Chip-Ins, **Badges** (auto-calculated vs. Organizer-awarded), and `session_grants`.
- Exact `SECURITY DEFINER` RPCs for unlocking **Event** invite codes, **Organizer** passcode, and **Basecamp Dashboard** tokens, rotating secrets, and returning aggregate chip-in totals without leaking individual chip-in rows.
- Exact RLS rules enforcing: (a) private **Event** gate, (b) honor-system **Participant** & teammate **Leg**/roster collaboration, (c) **Organizer**-only chip-in ledger and overrides, and (d) read-only **Basecamp Dashboard** access.
- Validation and guardrails (e.g., safe `https://` external activity URLs, soft/safe deletes when leaving a Team, idempotency keys / client timestamps for offline **Leg** writes).

## Answer

### 1. Canonical Postgres Tables (13 Tables, Deployed Complete in Phase 1)

All domain tables are scoped by `event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE` for multi-year reuse.

- **`events`**: `id (uuid PK)`, `slug (text UNIQUE NOT NULL, e.g. '2027')`, `name (text)`, `event_date (date)`, `start_time (timestamptz)`, `timezone (text)`, `is_active (boolean DEFAULT false)`, `basecamp_name (text)`, `basecamp_address (text)`, `basecamp_maps_url (text)`, `parking_amenities_notes (text)`, `cold_weather_tips (text)`, `safety_first_aid_notes (text)`, `strava_club_url (text)`, `recap_note (text)`, `chip_in_target_cents (int DEFAULT 0)`, `chip_in_suggested_cents (int)`, `chip_in_breakdown (jsonb DEFAULT '[]')`, `venmo_handle (text)`, `zelle_handle (text)`, `created_at (timestamptz)`.
- **`event_secrets`** *(strictly zero client RLS access; `SECURITY DEFINER` RPCs only)*: `event_id (uuid PK REFERENCES events(id) ON DELETE CASCADE)`, `invite_code_hash (text NOT NULL — pgcrypto bcrypt)`, `organizer_passcode_hash (text NOT NULL — pgcrypto bcrypt)`, `dashboard_token_hash (text UNIQUE NOT NULL — SHA-256 hex of high-entropy random token)`, `updated_at (timestamptz)`.
- **`session_grants`**: `auth_uid (uuid NOT NULL)`, `event_id (uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE)`, `scope (text NOT NULL CHECK (scope IN ('participant', 'organizer', 'dashboard')))`, `granted_at (timestamptz DEFAULT now())`, `PRIMARY KEY (auth_uid, event_id, scope)`.
- **`courses`**: `id (uuid PK)`, `event_id`, `name (text NOT NULL)`, `description (text)`, `distance_km (numeric(4,2) DEFAULT 5.00)`, `is_primary (boolean DEFAULT false)`, `gpx_xml (text)`, `external_route_url (text CHECK (external_route_url IS NULL OR (external_route_url ~ '^https://' AND length(external_route_url) <= 500)))`, `sort_order (int DEFAULT 0)`.
- **`announcements`**: `id (uuid PK)`, `event_id`, `title (text)`, `body (text NOT NULL)`, `is_pinned (boolean DEFAULT false)`, `created_at (timestamptz DEFAULT now())`.
- **`rounds`**: `id (uuid PK)`, `event_id`, `round_number (int NOT NULL CHECK (round_number BETWEEN 1 AND 10))`, `scheduled_start_at (timestamptz NOT NULL)`, `started_at (timestamptz)`, `UNIQUE (event_id, round_number)`. *(10 rows pre-seeded per Event.)*
- **`teams`**: `id (uuid PK)`, `event_id`, `name (text NOT NULL)`, `tagline (text)`, `color_hex (text)`, `emoji (text)`, `is_open (boolean DEFAULT true)`, `looking_note (text)`, `created_at (timestamptz DEFAULT now())`.
- **`participants`**: `id (uuid PK)`, `event_id`, `display_name (text NOT NULL)`, `rsvp_status (text NOT NULL CHECK (rsvp_status IN ('going_runner', 'going_supporter', 'maybe', 'cant_make_it')))`, `team_id (uuid REFERENCES teams(id) ON DELETE SET NULL)`, `available_from_round (int DEFAULT 1 CHECK (available_from_round BETWEEN 1 AND 10))`, `available_to_round (int DEFAULT 10 CHECK (available_to_round BETWEEN 1 AND 10))`, `rough_5k_minutes (int)`, `is_first_5k (boolean DEFAULT false)`, `dietary_notes (text)`, `show_times_on_leaderboard (boolean DEFAULT false)`, `created_at (timestamptz DEFAULT now())`, `CHECK (available_from_round <= available_to_round)`.
- **`legs`**: `id (uuid PK)`, `event_id`, `team_id (uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE)`, `round_number (int NOT NULL CHECK (round_number BETWEEN 1 AND 10))`, `runner_id (uuid REFERENCES participants(id) ON DELETE SET NULL)`, `course_id (uuid REFERENCES courses(id) ON DELETE SET NULL)`, `status (text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'out_on_course', 'completed')))`, `started_at (timestamptz)`, `finished_at (timestamptz)`, `duration_seconds (int CHECK (duration_seconds IS NULL OR duration_seconds > 0))`, `external_activity_url (text CHECK (external_activity_url IS NULL OR (external_activity_url ~ '^https://' AND length(external_activity_url) <= 500)))`, `client_updated_at (timestamptz DEFAULT now())`, `last_mutation_id (uuid)`, `updated_by_organizer (boolean DEFAULT false)`, `UNIQUE (team_id, round_number)`. *(10 placeholder rows pre-seeded automatically whenever a Team is created.)*
- **`supply_items`**: `id (uuid PK)`, `event_id`, `category (text NOT NULL CHECK (category IN ('food', 'drinks', 'gear_first_aid')))`, `name (text NOT NULL)`, `is_wishlist (boolean NOT NULL DEFAULT false)`, `target_slots (int CHECK (target_slots IS NULL OR target_slots >= 1))`, `created_by_participant_id (uuid REFERENCES participants(id) ON DELETE SET NULL)`, `created_at (timestamptz DEFAULT now())`.
- **`supply_claims`**: `id (uuid PK)`, `event_id`, `supply_item_id (uuid NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE)`, `participant_id (uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE)`, `note (text)`, `created_at (timestamptz DEFAULT now())`.
- **`chip_ins`** *(strictly Organizer-only RLS)*: `id (uuid PK)`, `event_id`, `participant_id (uuid REFERENCES participants(id) ON DELETE SET NULL)` *(nullable for anonymous/unlisted contributions)*, `amount_cents (int NOT NULL CHECK (amount_cents > 0))`, `note (text)`, `recorded_at (timestamptz DEFAULT now())`.
- **`badge_definitions` & `badge_awards`** *(Organizer-awarded superlatives only; the 10 auto-calculated Badges are computed client-side from live state so reverts/edits never drift)*:
  - `badge_definitions`: `id (uuid PK)`, `event_id`, `name (text NOT NULL)`, `emoji (text NOT NULL)`, `description (text)`, `is_preset (boolean DEFAULT false)`. *(5 preset superlatives pre-seeded per Event.)*
  - `badge_awards`: `id (uuid PK)`, `event_id`, `badge_definition_id (uuid NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE)`, `participant_id (uuid REFERENCES participants(id) ON DELETE CASCADE)`, `team_id (uuid REFERENCES teams(id) ON DELETE CASCADE)`, `note (text)`, `awarded_at (timestamptz DEFAULT now())`, `CHECK ((participant_id IS NOT NULL) <> (team_id IS NOT NULL))`.

### 2. `SECURITY DEFINER` RPCs & Provisioning Helpers

- **`unlock_event(p_slug text, p_code text) → uuid`**: Verifies `crypt(p_code, invite_code_hash) = invite_code_hash` in `event_secrets`, upserts `(auth.uid(), event_id, 'participant')` into `session_grants`, and returns `event_id`.
- **`unlock_organizer(p_event_id uuid, p_passcode text) → boolean`**: Verifies `organizer_passcode_hash`, upserts both `'participant'` and `'organizer'` grants for `auth.uid()`.
- **`unlock_dashboard(p_token text) → uuid`**: Hashes `p_token` with SHA-256 (`encode(digest(p_token, 'sha256'), 'hex')`), matches `event_secrets.dashboard_token_hash`, upserts `(auth.uid(), event_id, 'dashboard')`, and returns `event_id`.
- **`rotate_event_secret(p_event_id uuid, p_secret_type text, p_new_value text)`** *(requires `'organizer'` grant)*: Updates the specified hash in `event_secrets` and deletes existing `session_grants` for the rotated scope (preserving the calling Organizer's own session when rotating `'organizer'`).
- **`get_chip_in_summary(p_event_id uuid) → int`** *(requires `'participant'` or `'organizer'` grant)*: Returns `COALESCE(SUM(amount_cents), 0)` from `chip_ins` only (omitting contributor count and individual rows).
- **`create_team(...)` (or `AFTER INSERT ON teams` trigger)**: Creates the Team and atomically pre-seeds its 10 placeholder `legs` rows (`round_number` 1–10, `status = 'scheduled'`, `runner_id = NULL`, defaulting `course_id` to the Event's primary Course).
- **`leave_team(p_participant_id uuid)`**: Atomically clears `participants.team_id`, resets the Runner's `'scheduled'` Legs on the old Team to `runner_id = NULL` (preserving `'completed'` and `'out_on_course'` Legs), and deletes the old Team if it has 0 Participants and 0 `'completed'` Legs. Also invoked (after UI confirmation) whenever a Runner switches RSVP away from `'going_runner'`.
- **`start_round(p_event_id uuid, p_round_number int, p_exclude_leg_ids uuid[], p_started_at timestamptz)`** *(requires `'organizer'` grant)*: Atomically sets `rounds.started_at = p_started_at` and bulk-transitions all non-excluded assigned `'scheduled'` Legs in that Round to `status = 'out_on_course'`, `started_at = p_started_at`, `updated_by_organizer = true`.
- **`create_event(...)` SQL helper / seed script**: Run once per year in Supabase SQL Editor to provision the `events` row, hashed `event_secrets`, 10 `rounds`, and 5 preset `badge_definitions`.
- **`ping_heartbeat() → boolean`**: Lightweight read-only RPC pinged every 3 days by GitHub Actions to prevent Supabase Free inactivity pause.

### 3. Row-Level Security (RLS) Policy Matrix

Helper predicates: `has_grant(event_id, scopes text[])` checks `EXISTS (SELECT 1 FROM session_grants WHERE auth_uid = auth.uid() AND event_id = $1 AND scope = ANY($2))`.

| Table | `dashboard` | `participant` | `organizer` |
| --- | --- | --- | --- |
| `event_secrets` | None | None | None *(RPCs only)* |
| `session_grants` | Own rows `SELECT` | Own rows `SELECT` | Own rows `SELECT` |
| `events`, `courses`, `announcements`, `rounds`, `badge_definitions`, `badge_awards` | `SELECT` | `SELECT` | `SELECT` + `INSERT`/`UPDATE`/`DELETE` |
| `participants`, `teams`, `legs`, `supply_claims` | `SELECT` | `SELECT` + `INSERT`/`UPDATE`/`DELETE` | `SELECT` + `INSERT`/`UPDATE`/`DELETE` |
| `supply_items` | `SELECT` | `SELECT`; `INSERT`/`UPDATE`/`DELETE` **only where `is_wishlist = false`** | `SELECT` + `INSERT`/`UPDATE`/`DELETE` (all) |
| `chip_ins` | None | None *(aggregate via `get_chip_in_summary` RPC)* | `SELECT` + `INSERT`/`UPDATE`/`DELETE` |

### 4. Guardrails & Privacy Boundaries
- **Server-enforced privacy**: Private Event gate, read-only Basecamp Dashboard, Organizer-only controls, wish-list Supply protection, and individual `chip_ins` privacy are all enforced at the Postgres RLS layer.
- **Honor-system UI boundaries**: Because Participant selection uses zero-PIN tap-your-name, non-Organizer UI guardrails keep taps scoped to a Participant's own profile / own Team's Legs / own Supply claims, and hide `duration_seconds` for Runners with `show_times_on_leaderboard = false`.
- **Snapshot export safety**: Organizer JSON/CSV export queries standard RLS-protected tables (including `chip_ins`) and never touches `event_secrets`.
