# 17: Honor-system Participant picker, RSVP & profile editor

**What to build:** After unlocking an Event, let friends identify themselves with zero friction—tapping their name from the Event's Participant list or creating a walk-in Participant profile—and manage their RSVP status, Round availability, optional rough 5K pace, *"First 5K!"* tag, dietary notes, and private-by-default Speed Leaderboard opt-in from `Home`.

**Blocked by:** 16: App bootstrap, full Postgres schema/RLS, heartbeat & Event invite gate

**Status:** resolved

- [x] When an unlocked session has no `participant_id` saved in `localStorage` for the current `event_id`, `/e/:slug` presents a friendly honor-system Participant picker listing existing Participants for the Event alongside a walk-in **"I'm new — add my name"** flow (zero PINs, passwords, or email prompts).
- [x] Selecting or creating a Participant persists `participant_id` in `localStorage` scoped by `event_id` and enters the 4-tab app; if a saved `participant_id` no longer exists on the server, the app falls back gracefully to the picker.
- [x] On `Home`, the active Participant can see who they are signed in as, switch to another Participant at any time, and edit their own profile fields: display name, RSVP status (`Going (Runner)`, `Going (Supporter)`, `Maybe`, `Can't make it`), optional Round attendance window (`available_from_round` to `available_to_round`, defaulting to Rounds 1–10 and validating `from <= to`), optional rough 5K pace in minutes, *"First 5K!"* toggle, dietary notes, and **Show my 5K times & join Speed Leaderboard** toggle (explicitly defaulting to **OFF** with clear reassuring copy).
- [x] Honor-system UI guardrails scope profile edits to the currently selected Participant; all controls meet the `44px` minimum touch target and outdoor sunlight contrast guidelines.
- [x] Automated tests cover selecting an existing Participant, creating a walk-in Participant, persisting/restoring per-Event selection, validating Round window bounds, and saving RSVP/profile updates with time visibility defaulted to OFF.

## Comments

- Resolved on integration branch `feat/winter-grind-50k` (merged at `4cdfc55`; post-code-review verified at `ce2ea1e` with `npm run typecheck`, 57/57 test files / 224/224 tests passing, and clean `npm run build`).
