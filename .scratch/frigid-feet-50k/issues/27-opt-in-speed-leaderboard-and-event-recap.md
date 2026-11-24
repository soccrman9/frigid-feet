# 27: Opt-in Speed Leaderboard & Event Recap with copy summaries

**What to build:** Give opted-in Runners a respectful individual **Speed Board** without ever pressuring or exposing non-opted-in friends, and give everyone a celebratory **Event Recap** screen with one-tap copyable summaries for chats or fitness apps.

**Blocked by:** 24: Mobile Race Day timeline, individual Leg check-ins, thumb dock & Undo; 26: Live auto-calculated Badges & Organizer superlatives

**Status:** ready-for-agent

- [ ] `Race Day` → `Speed Board` sub-view is viewable by all signed-in Participants and ranks **only** Runners with `show_times_on_leaderboard = true` individually by fastest single timed 5K Leg and average 5K time across their timed completed Legs (strictly zero Team speed rankings).
- [ ] Runners with `show_times_on_leaderboard = false` (or timed-blank Legs) never appear on the Speed Leaderboard and their durations are never exposed; a gentle note explains that joining is completely optional via the Participant profile toggle.
- [ ] **Event Recap** view is reachable both from a card/link on `Home` and from the `Race Day` Thumb-Zone Action Dock's *"All Done Today — View Event Recap"* button.
- [ ] **Event Recap** displays the Organizer's optional `events.recap_note`, Event-wide total km completed, alphabetical Team 50K completions/progress, and the full showcase of auto-calculated Badges and Organizer-awarded superlatives.
- [ ] One-tap **Copy Event Recap** (`>=44px` target) copies a clean, emoji-friendly recap summary formatted for iMessage/WhatsApp chats to the clipboard with visual confirmation.
- [ ] One-tap **Copy My Run Summary** (`>=44px` target, labeled with neutral copy and a *"Great for Strava or group chat"* hint so non-fitness-app friends feel equally included) copies the active Participant's completed Legs/km, Team, Courses run, and earned Badges (omitting individual times unless the Participant opted in or explicitly has their own times).
- [ ] Automated tests verify Speed Leaderboard filtering/sorting/privacy boundaries, Event Recap rendering, and clipboard formatter outputs for both copy buttons (including Supporters and Runners with zero or multiple Legs).
