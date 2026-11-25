# 22: Chip-In progress card & private Organizer ledger

**What to build:** Let Organizers privately track off-app Venmo/Zelle chip-ins in an Organizer-only ledger while showing friends on `Home` a warm, zero-pressure aggregate progress card with cost breakdown and one-tap copyable payment handles—without ever exposing who paid or individual amounts.

**Blocked by:** 21: Organizer Mode: passcode unlock, Event/Course/Announcement management & secret rotation

**Status:** resolved

- [x] `get_chip_in_summary(p_event_id)` `SECURITY DEFINER` RPC requires `'participant'` or `'organizer'` scope and returns only `COALESCE(SUM(amount_cents), 0)` from `chip_ins` (zero contributor counts, zero Participant IDs, and zero individual rows).
- [x] `Home` renders a low-pressure **Chip-In Progress Card** displaying `$X of $Y event costs covered` with a clean progress bar (handling `$0` target gracefully), optional suggested amount and itemized cost breakdown from `events`, reassuring optional copy, and one-tap copy buttons (`>=44px` targets) with visual confirmation for configured Venmo and Zelle handles.
- [x] Inside Organizer Mode, Organizers can view, add, edit, and delete individual `chip_ins` ledger entries (optional linked Participant or anonymous/unlisted entry, positive dollar/cent amount, optional note, timestamp) and see the live aggregate update on `Home`.
- [x] Automated tests verify `get_chip_in_summary` aggregation, copy-handle interactions, Organizer CRUD on `chip_ins`, and server-enforced RLS blocking non-Organizer (`participant` and `dashboard`) sessions from selecting, inserting, updating, or deleting any `chip_ins` row.

## Comments

- Resolved on integration branch `feat/winter-grind-50k` (merged at `fcdb761`; post-code-review verified at `ce2ea1e` with `npm run typecheck`, 57/57 test files / 224/224 tests passing, and clean `npm run build`).
