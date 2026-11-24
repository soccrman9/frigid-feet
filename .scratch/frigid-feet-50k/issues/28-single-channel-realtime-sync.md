# 28: Single-channel Realtime sync & mobile background resync

**What to build:** Keep every friend's phone live throughout the Event—updating Leg check-ins, Round mass-starts, Team rosters, Supplies, Announcements, Courses, and Badges automatically—while staying comfortably within Supabase Free's 200 concurrent connection cap and conserving phone battery in the cold.

**Blocked by:** 18: Home Event info, Announcements & interactive Course maps; 19: Supplies tab: dietary banner, wish-list claiming & volunteered Supplies; 24: Mobile Race Day timeline, individual Leg check-ins, thumb dock & Undo

**Status:** ready-for-agent

- [ ] Each active unlocked mobile tab opens **one** multiplexed Supabase Realtime `postgres_changes` channel filtered by `event_id=eq.<event_id>` subscribing to `INSERT`, `UPDATE`, and `DELETE` events across all 11 live tables (`legs`, `rounds`, `teams`, `participants`, `announcements`, `badge_awards`, `badge_definitions`, `supply_items`, `supply_claims`, `events`, `courses`).
- [ ] Incoming Realtime mutations merge cleanly into the shared Event state so all 4 mobile tabs (`Home`, `Teams`, `Race Day`, `Supplies`)—plus derived Badges, collective km toasts, and Speed Board—reflect live changes without manual refreshes.
- [ ] Mobile tabs monitor `visibilitychange`: after ~30 seconds hidden in the background, the tab unsubscribes from the Realtime channel; immediately upon returning to the foreground, it resubscribes and fetches a full Event snapshot so zero updates are missed while paused.
- [ ] If the Realtime socket drops unexpectedly while foregrounded, the client surfaces calm connection status and triggers a full Event snapshot resync upon reconnection.
- [ ] Automated tests verify single-channel event merging for `INSERT`/`UPDATE`/`DELETE` payloads, the ~30-second background unsubscribe timer (cancelled cleanly if foregrounded early), and foreground full-snapshot resync behavior.
