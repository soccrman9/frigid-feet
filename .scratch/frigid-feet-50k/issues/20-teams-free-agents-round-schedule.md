# 20: Teams tab: Team creation, Free Agents & 10-Round schedule builder

**What to build:** Enable Runners to form Teams without invite codes, discover open Teams or unmatched Free Agents, join or leave a Team safely without losing completed Leg history, and collaboratively fill out their Team's 10-Round 5K schedule with gentle, non-blocking warnings.

**Blocked by:** 17: Honor-system Participant picker, RSVP & profile editor

**Status:** resolved

- [x] Creating a Team atomically pre-seeds 10 placeholder `legs` rows (`round_number` 1–10, `status = 'scheduled'`, `runner_id = NULL`, `course_id` defaulted to the Event's primary Course) via an `AFTER INSERT ON teams` database trigger or `create_team` RPC.
- [x] Atomic `leave_team(p_participant_id)` RPC clears `participants.team_id`, resets the Runner's `'scheduled'` Legs on the old Team to `runner_id = NULL`, preserves `'completed'` and `'out_on_course'` Legs untouched, and deletes the Team automatically only if it now has 0 Participants and 0 `'completed'` Legs.
- [x] `Teams` lists all Teams alphabetically, showing Team name, optional emoji/color/tagline, Open/Closed badge, `X of 10 Rounds covered` progress, and explicit uncovered Round chips (e.g., `Rounds 4 & 7 open`).
- [x] Any `Going (Runner)` Participant can create a new Team (name, optional tagline/color/emoji, Open/Closed toggle, optional looking-for note—zero invite codes) or one-tap join an Open Team; Supporters and non-Runner RSVPs cannot join Teams and see clear, welcoming explanatory copy.
- [x] `Teams` displays a **Free Agents** section listing every `Going (Runner)` Participant not currently on a Team alongside their Round availability window, optional rough 5K pace, and *"First 5K!"* tag.
- [x] One-Team-per-Runner is enforced: leaving a Team (or switching RSVP away from `Going (Runner)` in the Participant profile editor while on a Team) shows a confirmation prompt explaining that future scheduled Legs will be unassigned while completed Legs stay preserved, then invokes `leave_team`.
- [x] Opening any Team displays a 10-row **Round 1–10 Schedule Builder** where teammates can assign, claim, swap, or unassign Runners and pick a Course per Leg (unlimited and back-to-back Legs allowed; no hard roster lock). Assigning a Runner outside their RSVP attendance window or to back-to-back Rounds displays a calm, non-blocking warning while still permitting the assignment.
- [x] Automated tests cover 10-Leg auto-seeding, `leave_team` preservation/empty-Team cleanup edge cases, RSVP-change confirmation hook, and non-blocking schedule warning logic.

## Comments

- Resolved on integration branch `feat/winter-grind-50k` (merged at `99a0e68`; post-code-review verified at `ce2ea1e` with `npm run typecheck`, 57/57 test files / 224/224 tests passing, and clean `npm run build`).
