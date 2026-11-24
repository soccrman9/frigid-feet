# Realtime Sync and Offline Check-In Reconciliation Design

Type: grilling
Status: resolved
Blocked by: 13

## Context

Graduated from **Not yet specified** after locking in **Vite + React PWA (`vite-plugin-pwa` + `idb`)** and **Supabase Free Realtime** in [Tech Stack Selection and 6-Week Build Architecture](./12-tech-stack-and-architecture.md), building on the offline/tracking rules in [Race-Day Runner Tracking, Timing, and Notification Strategy](./09-race-day-tracking-and-notifications.md).

## Question

How should **Supabase Realtime** subscriptions, Service Worker read caching, and the IndexedDB offline check-in queue work together so the **Basecamp Dashboard** stays fresh and dropped-signal **Leg** check-ins reconcile cleanly?

Specifically decide:
- Which tables subscribe to Supabase Realtime (`postgres_changes`), how reconnect/resync works after a laptop sleeps or Wi-Fi blips, and how to stay comfortably within Supabase Free's 200 concurrent connection limit.
- Exact Service Worker caching strategy (app shell + latest **Event** read snapshot in IndexedDB) and offline UI indicators (*"Offline — showing last saved view"* / *"Saved locally — syncing..."*).
- Exact IndexedDB mutation queue schema, flush triggers (online event, foreground/visibilitychange, manual retry), idempotency, and conflict-resolution rules (last-write-wins with client tap timestamps vs. **Organizer** overrides, plus how the ~8s Undo toast interacts with queued offline writes).

## Answer

### 1. Supabase Realtime Subscription & Reconnect Strategy

- **Single multiplexed channel per active tab**: Each unlocked client opens **one** Supabase Realtime `postgres_changes` channel filtered by `event_id=eq.<event_id>` covering the Event's live tables (`legs`, `rounds`, `teams`, `participants`, `announcements`, `badge_awards`, `badge_definitions`, `supply_items`, `supply_claims`, `events`, `courses`). Enable the `supabase_realtime` publication for these tables (with `REPLICA IDENTITY FULL` on deletable tables so filtered `DELETE` events include `event_id`).
- **Connection budget (<30 Participants + 1–2 Dashboards)**:
  - **Mobile tabs**: Unsubscribe from Realtime after ~30 seconds hidden (`visibilitychange`), then immediately reconnect and fetch a full **Event** snapshot upon returning to the foreground — preserving phone battery and keeping concurrent connections around ~30–40 (well under Supabase Free's 200-connection limit).
  - **Basecamp Dashboard (`/dashboard/:token`)**: Stay connected continuously; automatically fetch a fresh **Event** snapshot whenever the socket reconnects after laptop sleep or Wi-Fi drops, and run a lightweight **60-second fallback poll** only while the Realtime channel is disconnected. If an Anonymous Auth session expires on the Dashboard, silently re-call `unlock_dashboard(token)` from the URL token before resubscribing.

### 2. Service Worker Caching & IndexedDB Read Snapshot

- **App Shell & Course Map Tiles (`vite-plugin-pwa` / Workbox)**:
  - Precache the static app shell (`CacheFirst` for HTML/JS/CSS/icons/fonts).
  - Best-effort runtime cache (`CacheFirst` with expiration) for previously viewed Leaflet/OpenStreetMap **Course** tiles so a viewed Course map still renders offline without pre-downloading tiles.
  - Safe PWA updates: avoid forced mid-tap reloads while `leg_mutation_queue` is non-empty; show a gentle *"Update available — Reload"* prompt when idle.
- **IndexedDB Read Snapshot (`event_snapshot` store)**:
  - Keyed by `event_id`, storing `{ event_id, data, last_synced_at }` and updated after every full fetch or merged Realtime change.
  - On offline cold launch, React hydrates immediately from `event_snapshot`, overlays any pending items from `leg_mutation_queue` optimistically, and renders a non-blocking banner: *"Offline — showing last saved view (updated Xm ago)"*.

### 3. Offline Write Scope & IndexedDB Mutation Queue

- **Leg-only offline writes**: Only individual **Leg** actions (`start`, `finish`, `mark_completed`, `edit`, `revert`) are queued offline in IndexedDB. Structural and **Organizer**-bulk actions (RSVP, **Team** create/join/leave, **Supply** claims, `Start Round N`, chip-ins, Organizer **Badges**) stay online-only with a clear *"Requires connection"* disabled state when offline.
- **IndexedDB `leg_mutation_queue` schema** (`idb`, ordered FIFO by `queued_at`):
  - `mutation_id` (`uuid`, PK — idempotency key)
  - `event_id` (`uuid`)
  - `leg_id` (`uuid`)
  - `action_type` (`'start' | 'finish' | 'mark_completed' | 'edit' | 'revert'`)
  - `payload` (`{ status, started_at, finished_at, duration_seconds, course_id, external_activity_url }`)
  - `is_explicit_revert` (`boolean`)
  - `client_updated_at` (`timestamptz` — exact client tap time)
  - `previous_leg_snapshot` (prior `legs` row fields for Undo)
  - `queued_at` (`timestamptz`)
  - `retry_count` (`int`)
  - `sync_state` (`'pending' | 'syncing'`)
- **Flush triggers & UI indicator**:
  - Auto-flush FIFO on `online`, `visibilitychange` (`visible`), `focus`, and a 15-second exponential backoff timer whenever pending items exist (never trusting `navigator.onLine` alone).
  - Display a tappable **"Saved locally (N) — Sync now"** pill in the UI whenever the queue is non-empty for manual retry.
  - If a Participant's session grant is revoked/expired while offline, keep `leg_mutation_queue` intact until they re-unlock the Event.

### 4. Idempotency & Conflict Resolution (`apply_leg_mutation` RPC)

Route all individual **Leg** writes (online and offline-flushed) through a single Postgres RPC `apply_leg_mutation(p_mutation_id uuid, p_leg_id uuid, p_status text, p_started_at timestamptz, p_finished_at timestamptz, p_duration_seconds int, p_course_id uuid, p_external_activity_url text, p_client_updated_at timestamptz, p_is_explicit_revert boolean)` *(enforcing `'participant'` or `'organizer'` grant via `session_grants`)*:

1. **Idempotency**: If `legs.last_mutation_id = p_mutation_id`, return `{ applied: true, reason: 'duplicate', leg }` immediately (no-op).
2. **Organizer precedence**: Determine `v_is_organizer` from `session_grants`. An **Organizer** write wins over a non-Organizer write (including ties on `client_updated_at`). A non-Organizer write cannot overwrite an Organizer-updated Leg (`updated_by_organizer = true`) if `p_client_updated_at <= legs.client_updated_at`; however, a strictly newer non-Organizer tap (e.g., a **Runner** finishing a **Leg** 30 minutes after an Organizer mass-started the **Round**) succeeds normally.
3. **Participant vs. Participant**: Newest `client_updated_at` wins (`p_client_updated_at >= legs.client_updated_at`), with one guard: a delayed offline `out_on_course` (`Start`) never regresses an already-`completed` Leg unless `p_is_explicit_revert = true`.
4. **Stale conflict UX**: When `apply_leg_mutation` returns `{ applied: false, reason: 'stale_or_overridden', leg }`, drop the stale entry from `leg_mutation_queue`, update local state + `event_snapshot` with the authoritative server `leg`, and show a brief neutral toast (*"Updated to latest Basecamp status"*).

### 5. Interaction with the ~8-Second Undo Toast

- Every **Leg** tap writes immediately to `leg_mutation_queue` (with `previous_leg_snapshot`) and updates the UI optimistically while showing the ~8-second **Undo** toast.
- **If Undo is tapped before flush (still offline/pending)**: Delete the entry directly from `leg_mutation_queue` and restore `previous_leg_snapshot` locally — zero server round-trip.
- **If Undo is tapped after flush (already synced)**: Enqueue/send a compensating `apply_leg_mutation` call restoring `previous_leg_snapshot` with `action_type = 'revert'` and `is_explicit_revert = true`.
