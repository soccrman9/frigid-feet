# 23: Organizer Supply wish-list, Team overrides & Event Snapshot export

**What to build:** Complete the remaining Phase 1 Organizer workflows so hosts can manage the Basecamp Supply wish list, help match Free Agents or adjust any Team's roster/schedule, and download a one-tap JSON or CSV Event Snapshot backup (including chip-ins, never secrets).

**Blocked by:** 19: Supplies tab: dietary banner, wish-list claiming & volunteered Supplies; 20: Teams tab: Team creation, Free Agents & 10-Round schedule builder; 21: Organizer Mode: passcode unlock, Event/Course/Announcement management & secret rotation

**Status:** ready-for-agent

- [ ] When Organizer Mode is unlocked, `Supplies` exposes Organizer controls to create, edit, and delete wish-list Supply items (`is_wishlist = true`, category, name, `target_slots >= 1`), and also remove any inappropriate/stale volunteered Supply entry or claim if needed.
- [ ] When Organizer Mode is unlocked, `Teams` exposes Organizer overrides to assign any **Free Agent** onto any Team (even Closed Teams), move a Runner between Teams (using `leave_team` semantics for old scheduled Legs), create a new Team on behalf of Free Agents, and edit any Team's 10-Round schedule regardless of Team membership.
- [ ] Inside Organizer Mode, one-tap **Export Event Snapshot (JSON)** and **Export Event Snapshot (CSV)** actions query only standard RLS-protected tables (`events`, `courses`, `announcements`, `rounds`, `teams`, `participants`, `legs`, `supply_items`, `supply_claims`, `chip_ins`, `badge_definitions`, `badge_awards`)—explicitly excluding `event_secrets`—and trigger clean client-side file downloads with valid UTF-8 JSON and properly escaped CSV output.
- [ ] Automated tests cover Organizer wish-list CRUD, Organizer Team/Free Agent assignment overrides, JSON/CSV serialization and escaping (commas, quotes, newlines), and assertions that `event_secrets` fields are never included in exports.
