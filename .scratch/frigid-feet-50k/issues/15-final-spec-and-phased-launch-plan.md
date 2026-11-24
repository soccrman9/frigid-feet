# Final Build-Ready Specification and Phased Launch Plan

Type: grilling
Status: resolved
Assignee: Antigravity
Blocked by: 13, 14

## Context

Final consolidation ticket leading directly to the map's Destination once [Canonical Data Model, Postgres Schema, and RLS Access Rules](./13-canonical-data-model-and-rls.md) and [Realtime Sync and Offline Check-In Reconciliation Design](./14-realtime-sync-and-offline-reconciliation.md) settle.

## Question

Consolidate every resolved decision across the map into a single build-ready product and technical specification and confirm the phased implementation plan through early January 2027.

Specifically confirm:
- Final structure and location of the handoff specification (covering UX flows, domain model, Postgres schema & RLS, Realtime/offline design, and UI prototype references).
- Week-by-week Phase 1 (Pre-Race Live ASAP) vs. Phase 2 (Race-Day & Recap) implementation milestones, acceptance criteria, and pre-race dry-run checklist.
- Any final edge-case gaps or contradictions across tickets before handoff to implementation.

## Answer

- **Canonical Handoff Specification**: Consolidated all 15 resolved decisions into a single build-ready specification at [`docs/SPEC.md`](../../../docs/SPEC.md), paired with [`GLOSSARY.md`](../../../GLOSSARY.md) for ubiquitous domain language and [`11-race-day-ui-prototype.html`](../prototypes/11-race-day-ui-prototype.html) for Race-Day / Basecamp Dashboard visual reference. Key architecture trade-offs are documented inline (no separate `docs/adr/` files for this 6-week build).
- **URL Routing & 4-Tab Navigation Placement**:
  - `/` redirects to the active **Event** (`/e/:slug`); invite links (`/e/:slug?code=<invite_code>`) auto-unlock and strip `?code=` via `history.replaceState`; **Basecamp Dashboard** lives at `/dashboard/:token`.
  - Mobile 4-tab layout: `Home` (Event Info, Announcements, **Courses**, Chip-In card, **Participant** profile/RSVP switcher, plus entry points to **Event Recap** and **Organizer Mode**), `Teams` (Teams list, **Free Agents**, Team creation, 10-Round schedule builder), `Race Day` (Variant B timeline + sticky thumb-zone action dock + sub-views for **Badges** and the opt-in **Speed Leaderboard**), and `Supplies` (dietary banner, Organizer wish list, volunteered **Supplies**).
- **Cross-Ticket Edge Cases Tightened**:
  - `start_round(...)` explicitly sets `legs.client_updated_at = p_started_at` alongside `started_at = p_started_at` and `updated_by_organizer = true` for clean LWW reconciliation with `apply_leg_mutation`.
  - **"Start Round N"** is guarded by the quick-uncheck confirmation sheet (no bulk-undo RPC; accidental single-Runner starts are reverted individually).
  - Auto-Badge rules finalized: **Full Squad** requires ≥1 Runner currently on the Team with every current Runner having completed ≥1 Leg; **Course Explorer** requires completed Legs across ≥2 distinct `course_id`s.
- **Six-Week Phased Launch Plan (Nov 24, 2026 → Early Jan 2027)**:
  - **Phase 1 Go-Live (End of Week 2 — Dec 7)**: Repo/Cloudflare/Supabase bootstrap, complete 13-table schema + RLS + RPCs, 3-day heartbeat, Event gate, Event Info + Courses, Announcements, RSVP, Supplies, Teams/10-Round schedule, and Organizer panel + JSON/CSV export.
  - **Phase 2 Go-Live (End of Week 5 — Dec 28)**: Mobile Race Day (Variant B) + `apply_leg_mutation`/Undo/mass-start (Week 3), Basecamp Dashboard (Variant A) + single-channel Realtime (Week 4), Service Worker + IndexedDB offline queue + live Badges + Speed Leaderboard + Event Recap & Copy buttons (Week 5).
  - **Week 6 (Dec 29 – Race Week)**: Polish and 6-point Pre-Race Dry-Run Checklist (offline iOS/Android test, 30-min Dashboard soak/sleep-wake test, 48-hr Supabase health/heartbeat check, Course `.gpx` verification, Organizer JSON/CSV backup + clean-slate check, and invite QR code / Dashboard bookmark access kit).
