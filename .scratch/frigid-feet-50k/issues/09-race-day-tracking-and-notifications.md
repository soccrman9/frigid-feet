# Race-Day Runner Tracking, Timing, and Notification Strategy

Type: grilling
Status: resolved
Blocked by: 02, 04

## Context

Depends on browser/PWA capability findings in [Mobile Web Push, Live Location, and Offline Capabilities](./02-web-push-gps-offline-capabilities.md) and the Round/Leg rules in [Relay Rules, Hourly Round Schedule, and Leg Mechanics](./04-relay-rules-and-round-mechanics.md).

## Question

How will we track **Runners** during each hourly **Round**, handle spotty connectivity, and notify Runners when their upcoming **Leg** approaches?

Specifically decide:
- Who records Leg start and finish times (Runner self-tap "Start/Finish Leg", a designated Basecamp timekeeper button, automatic start on the hour, or hybrid with organizer override).
- Whether live GPS map tracking is worth pursuing given browser background-location limits, or if simple status + elapsed time + estimated return ETA at Basecamp is the right scope for early January.
- What offline / poor-signal fallback is needed at Basecamp and on course.
- Whether **Web Push notifications** for upcoming-Leg reminders earn their complexity (accounting for iOS "Add to Home Screen" onboarding friction), or if on-screen countdowns + Basecamp Dashboard cues are sufficient.

## Answer

- **Hybrid Leg Start/Finish & Lifecycle (`Scheduled` → `Out on Course` → `Completed`)**:
  - **Mass-start + individual start**: At the top of each **Round**, an **Organizer** can tap **"Start Round N"** to mark all scheduled **Runners** for that Round as *Out on Course* at once (with a quick-uncheck list for late starters). Any Runner, teammate, or Organizer can also individually tap **"Start Leg"** (for late starts or walk-ins).
  - **Finish & retroactive logging**: When returning to **Basecamp**, the Runner, a teammate, or an Organizer taps **"Finish Leg"** (via their own card or an **"Active Runners"** quick-finish list on the **Race Day** tab — keeping Finish taps scoped to Runner + teammates + Organizers, not general **Supporters**). Elapsed time auto-calculates if started, with optional manual/watch-time editing or blank time when opted out of the Speed Leaderboard. Includes a direct **"Mark Completed"** shortcut for retroactive logging.
  - **Course selection**: Defaults to the **Event**'s primary **Course**, editable anytime pre-race, on Start, or on Finish.
- **Forgiving Undo & Status Reverts**: Tapping Start or Finish shows an **~8-second Undo toast**, and the Runner, teammates, or Organizers can edit a Leg's Course/time or revert its status (back to *Out on Course* or *Scheduled*) anytime.
- **No Live Browser GPS — Status + Elapsed Time + Rough ETA**: Skip live GPS tracking (and location pins) completely; display `Out on Course`, elapsed time, chosen Course, and a pace-based return ETA (from optional RSVP pace, defaulting to ~35 min).
- **Calm 60+ Minute Check-In Cue**: Keep the **Basecamp Dashboard** calm and non-judgmental past 60 minutes (no red warning), while showing a gentle, neutral *"Forgot to check in?"* prompt on the mobile **Race Day** view for the Runner, teammates, and Organizers after 60 minutes.
- **Skip Web Push for v1 (Countdowns + Basecamp Cues)**: Defer Web Push (VAPID) to post-MVP; rely on the in-app **"Your Next Leg"** countdown, the **Basecamp Dashboard** **"On Deck"** visual banner, and an optional **muted-by-default Basecamp Dashboard chime** (5 minutes before Round start and at Round start).
- **Pragmatic Offline-Tolerant Check-Ins**: Cache the app shell and latest read snapshot (Event info, Courses, schedule) so the app opens if signal dips; queue Leg Start/Finish taps locally in IndexedDB with the client tap timestamp (showing *"Saved locally — syncing..."*) and auto-flush on reconnect/foreground using last-write-wins + Organizer override.
