# Fitness App API Feasibility for a Zero-Cost Web App

Type: research
Status: resolved

## Question

For a **mobile-first web app** with a **\$0 budget** and **under 30 Participants**, what integrations are realistically possible in late 2026 with **Strava**, **Apple Health**, and **Google Fit / Health Connect** (plus standard GPX/TCX/FIT file workflows and Apple Shortcuts)?

Specifically investigate primary official documentation for:
1. **Strava API**: Current OAuth setup, athlete/app approval limits for small personal/friend-group apps (e.g., Single Player Mode vs. applying for higher athlete limits, approval turnaround time for an early-January deadline), rate limits, reading completed 5K activities/splits, webhooks vs. on-demand sync, sharing/downloading a 5K course route, and whether posting/updating activities is permitted.
2. **Apple Health**: Confirm whether any web API exists (vs. iOS-only HealthKit) and identify zero-cost web-compatible alternatives for iPhone/Apple Watch runners (e.g., syncing Apple Health → Strava, Apple Shortcuts export, or GPX/workout file upload).
3. **Google Fit / Health Connect**: Confirm the current deprecation/shutdown status of the Google Fit REST API and whether Android Health Connect exposes any web API, plus zero-cost web-compatible alternatives for Android runners (e.g., Health Connect → Strava bridge or GPX upload).

## Answer

None of the three ecosystems offers a viable, \$0, policy-compliant direct web API for a shared multi-Runner relay app launching in early January 2027:

- **Strava API v3 (Not viable for shared Team/Edition tracking):**
  - **Legal blocker:** Strava API Agreement Section 2.3 strictly limits displaying API-fetched Strava Data **only to the authenticated user**—even with explicit user opt-in, displaying Runner A's API-pulled 5K time/splits/map to teammates or Supporters on a shared Edition board violates the agreement and triggers App Review rejection. (`GET /clubs/{id}/activities` also lacks timestamps and unique IDs.)
  - **Cost & capacity blockers:** New apps start in Single Player Mode (1 athlete). Effective June 1, 2026, Standard Tier access requires a **paid Strava subscription** on the developer account and self-upgrades only to **10 athletes**; exceeding 10 athletes requires manual App Review with no guaranteed SLA ahead of early January 2027.
  - **What works without the API:** Linking out to a free Strava Club (zero code) and letting Runners freely export their own `.gpx`/`.fit` files from Strava web if desired.
- **Apple Health / HealthKit (No web API):**
  - HealthKit (`HKWorkoutRoute`) is strictly an **on-device native iOS/watchOS SDK**; distributing a native companion app via TestFlight/App Store requires the **\$99/year** Apple Developer Program.
  - Built-in Apple Health export dumps a user's entire multi-GB lifetime history (impractical mid-Edition), and native Apple Shortcuts cannot export `HKWorkoutRoute` GPX tracks. iPhone/Apple Watch Runners can log Legs manually, auto-sync workouts to Strava's free iOS app for personal social sharing, or optionally upload a single-run `.gpx` via a free iOS GPX exporter.
- **Google Fit / Android Health Connect / Google Health API (No practical web fit):**
  - **Google Fit REST API** closed new developer signups on May 1, 2024 and shuts down at the **end of 2026**—completely unusable.
  - **Android Health Connect** is strictly **on-device** via the native Android Jetpack SDK with no web/REST API (and Strava's Android Health Connect integration only pushes workouts *out* to Health Connect and reads weight back, rather than importing other apps' runs).
  - **Google Health API** reached GA in 2026 and is free under 100 OAuth Test Users (avoiding \$500–\$4,500+/yr CASA audits), but shows "Unverified App" warnings, expires Testing refresh tokens every 7 days, and only covers Fitbit/Pixel Watch cloud data.
- **Recommended \$0 Architecture:** Make **manual/timer Leg logging at Basecamp** the primary flow, add **optional client-side `.gpx` / `.tcx` / `.fit` file upload** (parsed in-browser to auto-populate splits, pace, elevation, and route with zero API fees or Strava ToS risk), host the **5K course as a static `.gpx` download** directly on the web app, and optionally link to a free **Strava Club** for social kudos.

[Full research report](../research/01-fitness-app-api-feasibility.md)
