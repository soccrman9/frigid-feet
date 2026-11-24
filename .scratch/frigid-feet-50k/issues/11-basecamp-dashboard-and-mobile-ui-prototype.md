# Basecamp Dashboard and Mobile Race-Day UI Prototype

Type: prototype
Status: resolved
Blocked by: 08, 09

## Context

Depends on the encouraging results/Badges model in [Encouraging Results, Simple Team Milestones, and Playful Badges](./08-results-and-playful-badges.md) and the tracking/notification flows in [Race-Day Runner Tracking, Timing, and Notification Strategy](./09-race-day-tracking-and-notifications.md).

## Question

What should the two core race-day surfaces look and feel like so they are effortless to read in cold weather on a phone and from across the room on a TV/laptop at **Basecamp**?

Build a quick, throwaway interactive HTML prototype covering:
1. **Mobile Race-Day View**: Current Round status, "Your Next Leg" countdown/prep card, 1-tap Leg check-in/finish flow, Team progress toward 50K, and encouraging micro-copy.
2. **Basecamp Dashboard (TV/Laptop)**: High-contrast big-screen live board showing active Runners currently on the 5K course, next Round's upcoming Runners on deck, Team progress bars toward 50K, and a toggleable **Badges** / celebration ticker.

## Answer

- **Primary Source Prototype**: [11-race-day-ui-prototype.html](../prototypes/11-race-day-ui-prototype.html) (throwaway HTML prototype preserved for reference; do not promote directly to production).
- **Mobile Race-Day View — Variant B (`Timeline + Sticky Thumb Action Dock`) + Light/Dark Theme Toggle**:
  - Top header with Event title, live clock, and Event-wide collective km celebration banner (*"Friends ran X km together today!"*).
  - Horizontal scrollable **10-Round pill rail** (`R1`–`R10`) above a chronological Round lineup feed showing active/scheduled/completed **Runners**, chosen **Courses**, elapsed time, pace-based return ETAs, and role-scoped quick **Start**/**Finish** buttons (plus Organizer mass-start and gentle 60+ min *"Forgot to check in?"* nudge).
  - Compact alphabetical **Team** 50K 10-segment progress cards below the lineup.
  - **Sticky bottom thumb-zone action dock** pinning the signed-in Runner's current/next **Leg** (countdown or active status + 48px+ primary Start/Finish CTA) directly above the 4-tab navigation (`Home` / `Teams` / `Race Day` / `Supplies`).
  - **Light & Dark theme options**: Support both a bright outdoor-readable light palette (for snow glare) and a high-contrast dark palette (for early-morning Round 1 / dusk Round 10), honoring system preference with an in-app manual toggle.
- **Basecamp Dashboard (TV/Laptop) — Variant A (`Split Airport Board`) + Light/Dark Theme Toggle**:
  - Full-width header with Event title, collective km counter, current **Round** pill, clock, **Badges** ticker toggle, muted-by-default **Chime** (T-5 / T-0) toggle, and **Light/Dark** theme toggle (dark chalet default for indoor TVs; high-contrast daylight option for sunny rooms/projectors).
  - **50/50 two-column split**: Left column stacks high-contrast **Out on Course** Runner cards (name, Team, Course, elapsed time, calm ETA — no red stress alerts past 60 min) above an amber **On Deck** next-Round countdown banner listing upcoming Runners; right column lists all **Teams** in alphabetical order with large 10-segment 50K progress bars and milestone callouts (*Halfway There 25K!*, *50K Finisher!*).
  - Optional toggleable **Live Badges** celebration ticker pinned across the bottom.
- **Shared UX Guardrails**: Gloved-finger 44px+ touch targets on mobile, non-color-only state cues (icons + labels), and an accessible ~8-second **Undo toast** (`popover="manual"`) on Leg Start/Finish actions.
