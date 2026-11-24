# Fitness App Integration Scope and User Flows

Type: grilling
Status: resolved
Blocked by: 01, 09

## Context

Depends on API feasibility findings in [Fitness App API Feasibility for a Zero-Cost Web App](./01-fitness-app-api-feasibility.md) and timing/tracking decisions in [Race-Day Runner Tracking, Timing, and Notification Strategy](./09-race-day-tracking-and-notifications.md).

## Question

Given the real-world API constraints for **Strava**, **Apple Health**, and **Google Fit / Health Connect** in a \$0 web app (and our early-January deadline), which fitness-app interactions should we build vs. defer?

Specifically decide:
- **Pre-race course prep**: Downloadable GPX route file and/or direct Strava Route link so Runners can load the 5K loop onto Apple Watch, Garmin, or phone apps.
- **Leg data capture / sync**: Whether to integrate Strava OAuth (to pull completed 5K activities/times/fun stats automatically or on-tap), rely on GPX file upload, use Strava as a bridge for Apple Health / Android users, or keep fitness-app sync optional alongside 1-tap manual check-in.
- **Post-race sharing**: Whether to generate shareable recap images/text for Strava/group chat rather than attempting API write-backs.
- Clear fallback UX for Participants who don't use any fitness app at all.

## Answer

- **Zero Direct Fitness-App APIs / OAuth for v1**: Skip Strava OAuth, Apple HealthKit, and Google Fit / Health Connect / Google Health API entirely for v1. This keeps hosting and developer costs at \$0, avoids Strava API Section 2.3 ToS violations and App Review delays before early January, and eliminates all third-party OAuth app registration/credential setup.
- **No Workout File Uploads on Legs for v1**: Skip client-side `.gpx` / `.tcx` / `.fit` file uploads on completed **Legs** for v1; rely on the manual/timer check-in and optional watch-time entry defined in [Race-Day Runner Tracking, Timing, and Notification Strategy](./09-race-day-tracking-and-notifications.md).
- **Optional External Activity Link per Leg**: Allow a **Runner** (or teammate/**Organizer** editing the Leg) to optionally paste a safe `https://` external workout URL (e.g., a Strava activity link) on a completed Leg. Treated as an explicit opt-in whenever pasted and rendered as a subtle outbound link pill (*"View activity"* / Strava link) for signed-in friends to view splits/maps and give kudos.
- **Pre-Race Course Prep + Collapsible GPX How-To**: Keep each **Course**'s in-app interactive `.gpx` map preview, one-tap `.gpx` download, and optional external route link (from [Pre-Race Info, RSVP, Amenities Sign-Up, and Chip-In Flow](./06-pre-race-info-rsvp-amenities.md)), and add a short, static collapsible **"How to load this Course on your watch or phone"** help accordion next to the `.gpx` download (covering Garmin, Apple Watch / Strava, and *"No watch? Just use the map preview above!"*).
- **First-Class Fitness-App-Free Experience & Neutral Copy**:
  - No core flow or **Badge** ever requires Strava, a GPS watch, or any fitness app.
  - Keep the optional Event-level **Strava Club** link tucked quietly in the Event Info hub (never pushed during onboarding).
  - Use neutral copy for the personal post-race share button from [Encouraging Results, Simple Team Milestones, and Playful Badges](./08-results-and-playful-badges.md): label it **"Copy My Run Summary"** with a subtle *"Great for Strava or group chat"* hint so non-Strava **Participants** feel equally included.
