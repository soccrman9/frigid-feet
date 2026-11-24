# 19: Supplies tab: dietary banner, wish-list claiming & volunteered Supplies

**What to build:** Let Participants coordinate shared Basecamp food, drinks, and cold-weather/first-aid gear on the `Supplies` tab by viewing dietary needs at a glance, claiming open slots on the Organizer's wish list, and adding or managing their own volunteered Supplies.

**Blocked by:** 17: Honor-system Participant picker, RSVP & profile editor

**Status:** ready-for-agent

- [ ] `Supplies` displays a **Dietary Summary Banner** at the top aggregating all non-empty Participant `dietary_notes` (attributed clearly so friends bringing food know what to accommodate, and tucked away cleanly if none are entered).
- [ ] Organizer wish-list Supplies (`is_wishlist = true`) are grouped by category (`Food`, `Drinks`, `Gear / First Aid`) and show claimed vs. target slots (e.g., `2 of 3 claimed`) with names and optional notes of Participants who claimed them.
- [ ] Any signed-in Participant can one-tap claim an open wish-list Supply with an optional note and unclaim their own claim (`>=44px` tap targets, non-color-only claimed/needed state indicators).
- [ ] Under volunteered Supplies (`is_wishlist = false`), any signed-in Participant can add a free-form Supply item (name and category) and edit or delete items they created.
- [ ] Honor-system UI guardrails restrict edits/deletes of volunteered Supplies and unclaims to the active Participant's own entries, and automated tests verify both the UI flows and Postgres RLS rejecting non-Organizer mutations to `is_wishlist = true` rows.
