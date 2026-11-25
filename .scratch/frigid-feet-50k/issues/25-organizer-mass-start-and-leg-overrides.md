# 25: Organizer mass-start (Start Round N) & Race-Day Leg overrides

**What to build:** Give Organizers one-tap hourly mass-start controls with a quick-uncheck sheet for late starters plus cross-Team Leg override controls on `Race Day`, so the whole friend group starts together cleanly on the hour and hosts can fix any check-in mistake instantly.

**Blocked by:** 21: Organizer Mode: passcode unlock, Event/Course/Announcement management & secret rotation; 24: Mobile Race Day timeline, individual Leg check-ins, thumb dock & Undo

**Status:** resolved

- [x] Organizer-only `start_round(p_event_id, p_round_number, p_exclude_leg_ids, p_started_at)` `SECURITY DEFINER` RPC atomically sets `rounds.started_at = p_started_at` and transitions all non-excluded assigned `'scheduled'` Legs in that Round to `status = 'out_on_course'`, `started_at = p_started_at`, `client_updated_at = p_started_at`, and `updated_by_organizer = true` (leaving unassigned placeholders and already started/completed Legs intact).
- [x] When Organizer Mode is unlocked, `Race Day` displays a prominent **"Start Round N"** button (`>=44px` touch target) for the selected Round that opens a quick-uncheck confirmation sheet listing every assigned `'scheduled'` Runner in that Round (checked by default so late starters can be unchecked before confirming).
- [x] Confirming **"Start Round N"** invokes `start_round(...)` with the excluded Leg IDs and current timestamp; there is no bulk-undo button, and any accidental single-Runner start can be reverted individually right from the lineup.
- [x] When Organizer Mode is unlocked, Organizers can Start, Finish, Mark Completed, edit Course/time/external activity URL, respond to the 60+ min *"Forgot to check in?"* prompt, or revert **any** Team's Leg via `apply_leg_mutation` with Organizer precedence (`updated_by_organizer = true`).
- [x] Automated tests verify `start_round` atomicity, exclusion list handling, `client_updated_at`/`updated_by_organizer` synchronization for LWW compatibility, non-Organizer RLS/RPC rejection, and Organizer cross-Team override behavior.

## Comments

- Resolved on integration branch `feat/winter-grind-50k` (merged at `24f1284`; post-code-review verified at `ce2ea1e` with `npm run typecheck`, 57/57 test files / 224/224 tests passing, and clean `npm run build`).
