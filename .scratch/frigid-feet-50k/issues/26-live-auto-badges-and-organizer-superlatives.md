# 26: Live auto-calculated Badges & Organizer superlatives

**What to build:** Celebrate participation, milestones, and winter vibes by computing all 10 playful Team and Participant Badges live from Event state—automatically staying accurate through any Leg edit or revert—while letting Organizers create and award superlative Badges in the `Race Day` → `Badges` sub-view.

**Blocked by:** 19: Supplies tab: dietary banner, wish-list claiming & volunteered Supplies; 21: Organizer Mode: passcode unlock, Event/Course/Announcement management & secret rotation; 24: Mobile Race Day timeline, individual Leg check-ins, thumb dock & Undo

**Status:** resolved

- [x] A pure client-side Badge evaluator computes all **10 auto-calculated Badges** reactively from live Event state (never stored in Postgres, so Leg edits and reverts never drift):
  - **Team Badges:** *Halfway There* (Team has ≥5 completed Legs), *50K Finisher* (Team has 10/10 completed Legs), and *Full Squad* (Team has ≥1 current Runner and every Runner currently on the Team has completed ≥1 Leg).
  - **Participant Badges:** *First 5K Club* (`is_first_5k = true` and ≥1 completed Leg), *Dawn Patrol* (completed a Round 1 Leg), *Anchor Leg* (completed a Round 10 Leg), *Back-to-Back* (completed Legs in 2 consecutive Rounds), *Distance Machine* (completed ≥3 Legs), *Course Explorer* (completed Legs across ≥2 distinct non-null `course_id`s), and *Basecamp Hero* (≥1 active row in `supply_claims` or created a volunteered `supply_items` entry).
- [x] `Race Day` → `Badges` sub-view showcases earned Team Badges, Participant Badges, and Organizer-awarded superlatives clearly with encouraging empty states before Rounds finish.
- [x] Inside Organizer Mode, Organizers can view the 5 pre-seeded preset superlatives (*Best Cold-Weather Outfit*, *Cheer Squad MVP*, *Best Snack Contributor*, *Most Encouraging*, *Best Vibes at Basecamp*), create custom `badge_definitions` (name, emoji, description), and award or revoke `badge_awards` (with optional note) for any Participant or Team (strictly enforcing recipient XOR constraint).
- [x] Automated unit and integration tests verify every auto-Badge trigger and edge case (including Leg reverts removing a Badge, empty Teams not earning *Full Squad*, null `course_id` excluded from *Course Explorer*, and volunteered Supplies vs. claims earning *Basecamp Hero*) as well as Organizer-only RLS on `badge_definitions` and `badge_awards`.

## Comments

- Resolved on integration branch `feat/winter-grind-50k` (merged at `0876636`; post-code-review verified at `ce2ea1e` with `npm run typecheck`, 57/57 test files / 224/224 tests passing, and clean `npm run build`).
