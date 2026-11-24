# Fitness App API Feasibility for a Zero-Cost Web App

**Date:** November 22, 2026  
**Context:** Frigid Feet 50K Relay — mobile-first web app, \$0 budget, under 30 Participants, early January 2027 Edition.  
**Scope:** Primary-source feasibility audit of Strava API v3, Apple Health / HealthKit, Google Fit / Android Health Connect / Google Health API, and standard GPX/TCX/FIT file workflows.

---

## Executive Summary

| Ecosystem | Direct Web API Available? | Fits \$0 Budget (<30 Participants)? | Can Display Other Runners' Data on Shared Team Board? | Verdict for Early Jan 2027 Edition |
| --- | --- | --- | --- | --- |
| **Strava API v3** | Yes (OAuth 2.0 REST + Webhooks) | **No / Risky** — June 1, 2026 Developer Program requires a paid Strava subscription for Standard Tier; >10 connected athletes requires manual App Review with unpredictable wait times. | **No** — Strava API Agreement Section 2.3 strictly limits displaying API-fetched data to the authenticated user only (even with user opt-in). | **Do not integrate via API.** Optionally link out to a free Strava Club with zero API calls. |
| **Apple Health / HealthKit** | **No** (on-device iOS/watchOS native SDK only) | **No** — Distributing a native iOS app with HealthKit via TestFlight/App Store requires the \$99/year Apple Developer Program. | N/A (no web API) | **Not possible directly from web.** Use manual Leg entry or optional GPX file upload. |
| **Google Fit REST API** | **Deprecated / Shutting Down** | **No** — New developer signups closed May 1, 2024; API shuts down at the end of 2026. | N/A | **Dead platform — do not use.** |
| **Android Health Connect** | **No** (on-device Android Jetpack SDK only) | **No** (requires native Android app) | N/A (no web API) | **Not possible directly from web.** |
| **Google Health API** | Yes (GA in 2026; Google OAuth 2.0 REST/gRPC) | **Technically \$0** (<100 OAuth test users avoids CASA fees), but shows "Unverified App" warnings and 7-day token expiry in Testing mode. | Subject to Google OAuth/Health user-data policies | **Poor fit** — covers Fitbit/Pixel Watch cloud data only, not general Android watches or iPhones. |
| **Manual Check-In + Client-Side GPX/TCX/FIT Upload + Static Course GPX** | Yes (standard browser File API) | **Yes (\$0)** | **Yes** — Runners voluntarily log/upload their own data directly to the app (no third-party API ToS barrier). | **Recommended primary architecture.** |

**Bottom line:** None of the three major fitness ecosystems provides a viable, \$0, policy-compliant direct web API for a shared multi-Runner relay tracker launching in early January 2027. The cleanest, most reliable, and 100% policy-compliant architecture is **manual/timer Leg logging at Basecamp** paired with **optional client-side GPX/TCX/FIT file upload** (for Runners who want splits, pace, and GPS route verification) and a **self-hosted static 5K course `.gpx` download**.

---

## 1. Strava API v3

### 1.1 OAuth 2.0 Setup, Scopes, and Token Lifecycle
- **Authentication:** Strava API v3 uses OAuth 2.0 via `https://www.strava.com/oauth/authorize` and token exchange at `https://www.strava.com/oauth/token` ([Strava Authentication Docs](https://developers.strava.com/docs/authentication/)).
- **Short-lived tokens:** Access tokens expire every **6 hours** (`21,600` seconds) and must be refreshed using the stored `refresh_token` ([Strava Authentication Docs](https://developers.strava.com/docs/authentication/)).
- **Relevant scopes:**
  - `activity:read` — read public/followers activities.
  - `activity:read_all` — read private ("Only Me") activities in addition to public ones.
  - `activity:write` — create manual activities, upload activity files, and update existing activities.
  - `read_all` — required to read private routes and private profile data ([Strava Authentication Docs](https://developers.strava.com/docs/authentication/)).

### 1.2 Athlete Capacity, June 1, 2026 Tier Changes, and Approval Timeline
- **Single Player Mode (default):** Every new Strava API application starts in Single Player Mode with a hard capacity of **1 connected athlete** (only the developer's own Strava account can authenticate) ([Strava Developer Docs](https://developers.strava.com/docs/getting-started/)).
- **June 1, 2026 Developer Program Overhaul:** Effective June 1, 2026, Strava restructured API access into tiers and introduced a **paid Strava subscription prerequisite** for the **Standard Tier** developer account owning the application ([Strava Developer Program / Rate Limits](https://developers.strava.com/docs/rate-limits/)). This conflicts with a strict \$0 budget unless the organizer already maintains a personal paid Strava subscription.
- **Self-Service Upgrade (up to 10 athletes):** Standard Tier developers can self-upgrade in their API settings dashboard to allow up to **10 connected athletes** without manual review ([Strava Rate Limits](https://developers.strava.com/docs/rate-limits/)). For an Edition with up to 30 Participants (many of whom may be Runners using Strava), 10 connected accounts is too low to guarantee every Strava-using Runner can connect.
- **Scaling Beyond 10 Athletes (Manual App Review):** Exceeding 10 athletes (Standard Tier allows up to 9,999 athletes) requires submitting the application for manual Strava review, including screenshots, privacy policy, "Connect with Strava" button compliance, and brand attribution ([Strava Brand & Developer Guidelines](https://developers.strava.com/guidelines/)). Strava does not publish a guaranteed turnaround SLA; developer reports on the [Strava Developer Community Hub](https://communityhub.strava.com/) routinely document multi-week backlogs—making approval unreliable ahead of an early January 2027 Edition.

### 1.3 Rate Limits
Strava enforces per-application 15-minute (resetting on the 0/15/30/45-minute marks) and daily (midnight UTC) rate limits, split between overall requests and non-upload/read requests ([Strava Rate Limits](https://developers.strava.com/docs/rate-limits/)):
- **Single Player Mode (1 athlete):** 200 overall / 100 read per 15 minutes; 2,000 overall / 1,000 read per day.
- **Self-Service Tier (up to 10 athletes):** 400 overall / 200 read per 15 minutes; 4,000 overall / 2,000 read per day.
- **Approved Standard Tier:** Custom/higher limits granted after review.

For <30 Participants running 10 Rounds (≤300 Legs total over 10 hours), rate limits themselves would not be a bottleneck—**athlete capacity and API legal terms are the real blockers**.

### 1.4 Reading Completed 5K Activities, Splits, and Updating Activities
- **Activity details & splits:** `GET /activities/{id}` (`getActivityById`) returns a `DetailedActivity` containing distance, elapsed/moving time, `splits_metric`, `splits_standard`, `laps`, and `best_efforts` ([Strava API v3 Reference](https://developers.strava.com/docs/reference/#api-Activities-getActivityById)).
- **No direct activity GPX download endpoint:** The API does **not** expose an `/activities/{id}/export_gpx` endpoint. Reconstructing a GPS track via API requires querying `GET /activities/{id}/streams` (`latlng`, `altitude`, `time`) ([Strava API v3 Reference](https://developers.strava.com/docs/reference/#api-Streams-getActivityStreams)).
- **Updating/posting back to Strava:** `PUT /activities/{id}` (`updateActivityById`) is permitted with the `activity:write` scope and allows modifying `name`, `description`, `sport_type`, `trainer`, `commute`, `hide_from_home`, and `gear_id` ([Strava API v3 Reference](https://developers.strava.com/docs/reference/#api-Activities-updateActivityById)). Creating manual activities (`POST /activities`) or uploading GPX/FIT/TCX files (`POST /uploads`) is also permitted with `activity:write`.

### 1.5 Webhooks vs. On-Demand Sync
- **Webhook Events API:** Each app gets **one** push subscription (`POST /push_subscriptions`) covering all authorized athletes ([Strava Webhooks Documentation](https://developers.strava.com/docs/webhooks/)).
- Strava sends lightweight `POST` notifications (`object_type: "activity"`, `aspect_type: "create" | "update" | "delete"`, `object_id`, `owner_id`) and also fires deauthorization events when an athlete revokes access.
- **Server requirement:** Your webhook callback URL must answer Strava's initial `GET` verification challenge and respond `200 OK` to `POST` events **within 2 seconds** (otherwise Strava retries up to 3 attempts), then fetch the full activity asynchronously using the athlete's OAuth token ([Strava Webhooks Documentation](https://developers.strava.com/docs/webhooks/)).
- **On-demand sync** (`GET /athlete/activities?after=<epoch>`) is simpler for a static/serverless \$0 app because it avoids always-on webhook infrastructure, though Strava strongly prefers webhooks to avoid polling.

### 1.6 Course Route Sharing (`export_gpx`)
- Strava exposes `GET /routes/{id}/export_gpx` for Strava Routes (requires `read_all` if private) ([Strava API v3 Reference](https://developers.strava.com/docs/reference/#api-Routes-getRouteAsGPX)).
- On Strava's web interface, exporting **your own** activities as GPX or Original (`.fit`/`.tcx`) is free on desktop web ([Strava Support: Exporting your Data](https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export)), whereas downloading someone else's route/activity GPX on Strava is restricted or requires a subscription.
- **Better approach:** Do not rely on Strava's Routes API to distribute the 5K course. Host the Edition's official 5K `.gpx` file directly as a static asset on the Frigid Feet web app so every Runner can download it with one tap for free.

### 1.7 Showstopper: API Agreement Ban on Displaying Other Users' Data
- Under the **Strava API Agreement** (updated November 2024 and strictly enforced through 2026), **Section 2.3 ("Display Limited to the Authenticated User")** mandates that Strava Data provided by a specific Strava user may be displayed or disclosed in a Developer Application **only to that user** ([Strava API Agreement](https://www.strava.com/legal/api)).
- **Impact on Frigid Feet 50K Relay:**
  - Pulling Runner A's 5K Leg time, pace, splits, or route via the Strava API and displaying it to teammates, other Teams, or Supporters on a shared Edition board or Team tracker **violates the Strava API Agreement**.
  - **User opt-in does not override this clause:** Strava has confirmed via its official developer channels that explicit user consent within a third-party app does not waive the user-isolation restriction, and apps featuring multi-user leaderboards or group tracking are rejected during App Review ([Strava API Agreement](https://www.strava.com/legal/api); [Strava Developer Community Hub](https://communityhub.strava.com/)).
- **Why the Clubs API is not a workaround:** `GET /clubs/{id}/activities` omits `start_date` timestamps, activity IDs, and unique athlete IDs (returning only first name and last initial, e.g., `"Peter S."`), making it impossible to reliably assign activities to specific Rounds/Legs—and any display of Strava API data remains governed by the API Agreement ([Strava API v3 Reference](https://developers.strava.com/docs/reference/#api-Clubs-getClubActivitiesById)).

---

## 2. Apple Health / HealthKit

### 2.1 Strictly On-Device Native SDK (No Web API)
- **No Web / REST API:** Apple does **not** offer a web API, server-side REST endpoint, or cloud query API for Apple Health. HealthKit is exclusively an **on-device native framework** for iOS, iPadOS, watchOS, and visionOS ([Apple Developer: HealthKit Documentation](https://developer.apple.com/documentation/healthkit)).
- GPS tracks associated with Apple Watch runs are stored locally as `HKWorkoutRoute` samples and can only be read inside a native Swift/Objective-C app via `HKWorkoutRouteQuery` ([Apple Developer: HKWorkoutRoute](https://developer.apple.com/documentation/healthkit/hkworkoutroute)).

### 2.2 Cost Barrier for a Native Companion App
- While a free Apple Developer account allows running Xcode builds on a developer's own device (expiring every 7 days), enabling HealthKit capabilities for distribution via **TestFlight** or the **App Store** requires enrolling in the **Apple Developer Program at \$99 USD/year** ([Apple Developer Program](https://developer.apple.com/programs/)). This breaks both the **\$0 budget** and **web-first** constraints.

### 2.3 Zero-Cost Web-Compatible Workarounds for iPhone / Apple Watch Runners
1. **Manual Leg Check-In (Recommended Primary):** Runners simply tap "Complete Leg" and enter their Apple Watch 5K time (or start/stop an in-app Basecamp timer). Zero setup, works with cold fingers.
2. **Apple Health → Strava Automatic Sync (Free, Native):** Strava's free iOS app automatically imports native Apple Watch workouts recorded within the past 30 days once enabled (`Strava > You > Settings > Manage Apps and Devices > Health > Automatic Uploads`) ([Strava Support: Health App and Strava](https://support.strava.com/hc/en-us/articles/216917527-Health-App-and-Strava)). This lets Apple Watch Runners share runs in an optional Strava Club or export a single `.gpx` from Strava web post-Edition, without giving our web app direct HealthKit access.
3. **Apple Shortcuts (Limited Utility):** Built-in iOS Shortcuts provides **Find Health Samples** and **Get Details of Health Sample** actions ([Apple Support: Shortcuts User Guide](https://support.apple.com/guide/shortcuts/welcome/ios)), which can read quantity samples (like Walking + Running Distance) and could theoretically open a pre-filled web URL or POST JSON to our app. However, native Shortcuts cannot reliably extract `HKWorkoutRoute` GPS tracks as `.gpx` files, and asking friends to install and debug a custom Shortcut adds friction compared to typing a 5K time.
4. **Apple Health "Export All Health Data" (Impractical on Race Day):** iOS supports exporting raw Health data (`Health app > Profile > Export All Health Data`), which generates an `export.zip` containing `export.xml` and `workout-routes/route_*.gpx` ([Apple Support: Share and export your Health data](https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios)). However, iOS always exports a user's **entire lifetime health database** (often hundreds of MB to several GB, taking minutes to package)—far too slow and privacy-invasive for hourly 5K Legs.
5. **Free Single-Workout GPX Exporter Apps:** Runners who specifically want to upload a GPS track to our web app can use a free App Store utility (e.g., WorkoutGPX) to export a single Apple Health workout as a `.gpx` file and upload it via the mobile browser's standard `<input type="file">`.

---

## 3. Google Fit, Android Health Connect, and Google Health API

### 3.1 Google Fit REST API — Deprecated & Shutting Down in 2026
- **Closed to new apps:** Google stopped allowing new developer signups for the Google Fit APIs (including the Google Fit REST API) on **May 1, 2024** ([Google Fit REST API Documentation](https://developers.google.com/fit/rest)).
- **End of life:** Google officially announced that the Google Fit APIs are deprecated and supported only **until the end of 2026**—meaning the service will be winding down or shut off right before an early January 2027 Edition ([Google Fit REST API Documentation](https://developers.google.com/fit/rest); [Android Health & Fitness Migration Guide](https://developer.android.com/health-and-fitness/guides/fit-migration)).
- **Verdict:** Completely unusable for a new project.

### 3.2 Android Health Connect — On-Device Only (No Web API)
- **No Web / REST API:** Health Connect is strictly an **on-device** health data store integrated into Android 14+ (and available via Google Play Services back to Android 9) ([Android Developers: Health Connect](https://developer.android.com/health-and-fitness/guides/health-connect)).
- Reading workout sessions (`ExerciseSessionRecord`) and GPS tracks (`ExerciseRoute`) requires a **native Android app** using the Jetpack SDK (`androidx.health.connect:connect-client`) and runtime permissions (`android.permission.health.READ_EXERCISE_ROUTES`) ([Android Developers: Health Connect](https://developer.android.com/health-and-fitness/guides/health-connect)).
- **Important Strava ↔ Health Connect asymmetry:** Per Strava's official support documentation, Strava's Android Health Connect integration sends GPS activity time/distance/calories **from Strava to Health Connect**, while only pulling **weight** from Health Connect back into Strava—it does **not** act as a generic pipe to auto-upload other Android apps' workouts into Strava ([Strava Support: Health Connect & Strava](https://support.strava.com/hc/en-us)). Instead, Android Runners sync workouts to Strava via vendor-specific bridges (e.g., Samsung Health → Strava for GPS workouts, Google Health/Fitbit → Strava, Garmin Connect → Strava).

### 3.3 Google Health API — Cloud REST API (GA in 2026), Narrow Fit
- **Status:** Google's successor to the Fitbit Web API and cloud side of Google Fit is the **Google Health API**, whose core REST/gRPC endpoints reached **General Availability (GA)** in 2026 using Google OAuth 2.0 ([Google Health API Documentation](https://developers.google.com/health)).
- **Cost & OAuth Verification Constraints:**
  - The API itself has no per-call platform fee, **but** health scopes are classified as Google **restricted scopes**. Public apps exceeding **100 users** require formal OAuth App Verification plus an annual third-party **CASA security assessment** (typically \$500–\$4,500+/year) ([Google Cloud Support: Restricted Scope Verification](https://support.google.com/cloud/answer/10117424); [Google Cloud Support: Security Assessment](https://support.google.com/cloud/answer/13465431)).
  - Staying under 100 manually whitelisted **Test Users** in OAuth Testing mode is technically \$0, but displays an "Unverified App" warning screen and expires refresh tokens every **7 days** ([Google Cloud Support: Manage App Audience](https://support.google.com/cloud/answer/10311646)).
- **Device Coverage Gap:** The Google Health API primarily serves cloud-synced **Fitbit and Pixel Watch / Google Health** data—not Garmin, Coros, Samsung Health, Apple Watch, or generic on-device Health Connect workouts. Building OAuth plumbing for a narrow subset of Android watches offers very poor ROI for <30 friends.

---

## 4. Recommended Zero-Cost Architecture: Universal Web + GPX/TCX/FIT

Because every major fitness watch and running app supports standard file exports—and because client-side parsing avoids server compute, API quotas, developer fees, and Strava's Section 2.3 display ban—the highest-value, \$0 design for Frigid Feet 50K Relay is:

1. **First-Class Manual Leg Logging (Works for 100% of Runners):**
   - Runners log their completed 5K Leg directly in the mobile web app (either entering finish time `MM:SS` from their watch/phone, or tapping a shared/personal Round timer at Basecamp).
   - Zero OAuth friction, works if a watch battery dies in January cold, and immediately updates the shared Team/Edition progress board.

2. **Optional Client-Side `.gpx` / `.tcx` / `.fit` File Upload (Zero Server Cost, Zero ToS Risk):**
   - Allow Runners to optionally attach a workout file from any device/platform:
     - **Garmin Connect web:** Free export of any timed activity as Original (`.fit`), `.tcx`, or `.gpx` ([Garmin Support: Exporting a Timed Activity](https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8)).
     - **Strava web (free accounts):** Free "Export GPX" or "Export Original" on a user's **own** activity ([Strava Support: Exporting your Data](https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export)). Because the Runner exports and uploads their own file directly (bypassing the Strava API entirely), Strava's API Agreement Section 2.3 does not apply.
     - **Coros, Polar, Suunto, Apple Watch (via free GPX exporter):** All export standard `.gpx`/`.fit` files.
   - Parse GPX 1.1 XML ([TopoGrafix GPX 1.1 Schema](https://www.topografix.com/gpx.asp)) — and optionally `.tcx`/`.fit` using lightweight open-source JS parsers — **100% in the browser** to auto-fill total distance, elapsed/moving time, per-km/mile splits, elevation gain, and a route polyline preview, storing only compact summary metrics (and optionally a simplified polyline) in the app database.

3. **Self-Hosted 5K Course Route Sharing:**
   - Publish the Edition's single 5K Basecamp loop as a **static `.gpx` file** directly in the web app (plus a rendered map preview), so Runners can import turn-by-turn navigation onto Garmin, Apple Watch, Coros, or phone apps with zero paywalls or API calls.

4. **Zero-Code Social Layer (Optional Strava Club Link):**
   - If friends already live on Strava and want kudos/photos in their feeds, create a free **Strava Club** for the Frigid Feet 50K Relay and put a simple outbound link in the web app—zero API integration, zero subscription cost, zero review risk.
