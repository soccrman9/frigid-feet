# Research 02: Mobile Web Push, Live Location, and Offline Capabilities

**Scope:** Real-world capabilities, OS restrictions, and user-friction trade-offs of a **$0 mobile-first PWA** targeting **iOS Safari** and **Android Chrome** for the Frigid Feet 50K Relay (<30 Participants, 10 hourly 5K Rounds run from a single Basecamp).

---

## Executive Summary

| Capability | iOS Safari (PWA) | Android Chrome | Recommended $0 Approach for Frigid Feet |
| :--- | :--- | :--- | :--- |
| **Web Push notifications** | Supported since iOS 16.4, **only** if added to Home Screen (`standalone`/`fullscreen` manifest) | Supported in both regular browser tabs and installed PWAs | Standard **Web Push (RFC 8030) + VAPID (RFC 8292)** directly from backend ($0, no Apple Developer account). Treat push as opt-in bonus; pair with Basecamp board/countdown for Runners who skip Home Screen install. |
| **Live background GPS (`watchPosition`)** | **Not viable.** Paused/dropped whenever screen locks or app backgrounds (W3C spec + WebKit enforcement) | **Not viable.** Chrome blocks background geolocation; updates stop on lock/background | **Do not build live browser GPS tracking.** Use manual Start/Finish Leg check-ins + elapsed-time/ETA pacing at Basecamp, with optional one-tap "check-in pin" (`getCurrentPosition`) if desired. |
| **Screen Wake Lock** | Supported in Safari tabs since iOS 16.4; **broken in Home Screen PWAs on iOS 16.4–18.3** (fixed in iOS 18.4) | Supported (`navigator.wakeLock.request('screen')`) while visible | Useful **only** for a plugged-in Basecamp timing/leaderboard tablet, not for pocketed Runner phones (cold-weather battery drain + accidental locks). |
| **Offline caching (Service Worker + Cache API)** | Fully supported; Home Screen PWAs exempt from Safari's 7-day ITP storage eviction | Fully supported | Precache App Shell + static Edition/course info (`CacheFirst`); serve live Round/Team state via `NetworkFirst`. |
| **Offline write sync** | **No Background Sync API (`SyncManager`)**; must flush while app is visible | Supports Background Sync API | **IndexedDB mutation queue** with client UUIDs + timestamps, optimistic UI, and foreground flush on `online`, `visibilitychange`, `focus`, and backoff timer (with optional Background Sync progressive enhancement on Chrome). |

---

## 1. Web Push Notifications

### 1.1 Platform Support & the iOS "Add to Home Screen" Requirement

- **Android Chrome:** Full support for the W3C Push API, Notifications API, and Service Workers in both standard browser tabs and installed PWAs ([MDN Push API](https://developer.mozilla.org/docs/Web/API/Push_API); [web.dev Push Notifications Overview](https://web.dev/articles/push-notifications-overview)). Android Chrome also fires the non-standard `beforeinstallprompt` event so the app can display a one-tap install button ([MDN `BeforeInstallPromptEvent`](https://developer.mozilla.org/docs/Web/API/BeforeInstallPromptEvent)).
- **iOS & iPadOS Safari (16.4+):** Standards-based Web Push (Push API + Notifications API + Service Workers) is supported **exclusively for Home Screen web apps** — not regular Safari tabs ([WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); [Apple Developer: Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/UserNotifications/sending-web-push-notifications-in-web-apps-and-browsers)).
  - **Manifest requirement:** The web app manifest must declare `"display": "standalone"` or `"display": "fullscreen"` ([WebKit 13878](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
  - **Regular tab limitation:** Inside a standard iOS Safari tab, `Notification` / `PushManager` are unavailable — the app cannot request notification permission until the Participant adds the app to their Home Screen and launches it from that icon ([MDN Notifications API](https://developer.mozilla.org/docs/Web/API/Notifications_API); [WebKit 13878](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
  - **No programmatic install prompt on Safari:** Safari does **not** support `beforeinstallprompt` ([MDN `BeforeInstallPromptEvent`](https://developer.mozilla.org/docs/Web/API/BeforeInstallPromptEvent)). On iOS, the UI must show brief manual instructions: tap the **Share** button → **"Add to Home Screen"** → reopen from the Home Screen icon. Since iOS 16.4, third-party iOS browsers (Chrome/Firefox/Edge on iOS) can also surface "Add to Home Screen" via `UIActivityViewController` in the Share sheet, producing the same WebKit Home Screen web app ([WebKit 13878](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).

### 1.2 Permission UX & Strict Delivery Rules

- **User gesture required:** Both Apple and modern browser guidance require calling `Notification.requestPermission()` / `pushManager.subscribe()` inside a direct user gesture (e.g., tapping an "Enable Round Reminders" button) — never on initial page load ([Apple Developer Docs](https://developer.apple.com/documentation/UserNotifications/sending-web-push-notifications-in-web-apps-and-browsers); [web.dev Permission UX](https://web.dev/articles/push-notifications-permissions-ux)).
- **Two-step contextual priming:** Best practice is an in-app card explaining value (e.g., *"Get a 10-minute heads-up before your next Leg"*) that triggers the native prompt only when the Participant taps "Enable" ([web.dev Permission UX](https://web.dev/articles/push-notifications-permissions-ux)).
- **No silent/invisible pushes on Safari:** Apple strictly prohibits silent background push messages. Every incoming `push` event handled by the Service Worker **must** immediately display a visible notification via `self.registration.showNotification()`, or Safari may revoke push permissions for the origin ([Apple Developer Docs](https://developer.apple.com/documentation/UserNotifications/sending-web-push-notifications-in-web-apps-and-browsers)). Subscriptions must pass `{ userVisibleOnly: true }` ([MDN `PushManager.subscribe()`](https://developer.mozilla.org/docs/Web/API/PushManager/subscribe)).

### 1.3 Native Behavior: Lock Screen, Sound, Vibration, Badges, and Declarative Push

- **Lock Screen & Focus integration:** On iOS 16.4+, Home Screen Web Push notifications appear on the Lock Screen, Notification Center, and paired Apple Watch, and obey Focus modes identically to native apps ([WebKit 13878](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- **Sound & vibration:**
  - Web Push does not support custom audio files across mobile browsers; iOS plays the system default notification chime according to the device's silent switch / Focus mode. Setting `silent: true` in `showNotification()` suppresses sound/alerts on supported browsers including iOS 16.4+ ([MDN `Notification.silent`](https://developer.mozilla.org/docs/Web/API/Notification/silent)).
  - **Vibration (`vibrate` option / `navigator.vibrate()`):** Supported on Android Chrome, **unsupported on iOS Safari** ([MDN `Notification.vibrate`](https://developer.mozilla.org/docs/Web/API/Notification/vibrate)).
- **Badges:**
  - The **Badging API** (`navigator.setAppBadge(count)` / `navigator.clearAppBadge()`) is supported on iOS 16.4+ Home Screen web apps (requires granted notification permission) and Chromium PWAs ([WebKit 13878](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); [MDN Badging API](https://developer.mozilla.org/docs/Web/API/Badging_API)).
  - The `badge` monochrome-icon option inside `showNotification()` is used on Android Chrome's status bar, whereas iOS ignores custom notification badge image URLs and displays the PWA's app icon ([MDN `Notification.badge`](https://developer.mozilla.org/docs/Web/API/Notification/badge)).
- **Safari 18.4+ Declarative Web Push:** Released in March 2025, Safari 18.4 introduced **Declarative Web Push** — sending a standardized JSON payload (`"web_push": 8030` with `notification: { title, body, navigate }`) lets iOS render the notification directly without waking a Service Worker JavaScript runtime, improving battery efficiency and eliminating SW lifecycle failure modes while remaining backwards-compatible with standard Service Worker push handlers on Chrome and older iOS ([WebKit: Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/); [WebKit Features in Safari 18.4](https://webkit.org/blog/16534/webkit-features-in-safari-18-4/)).

### 1.4 Free Server-Side Delivery: Standard Web Push (VAPID) vs. Firebase Cloud Messaging (FCM)

| Dimension | Standard Web Push (RFC 8030 + VAPID RFC 8292) | Firebase Cloud Messaging (FCM) — Spark Plan |
| :--- | :--- | :--- |
| **Direct cost** | **$0** (no vendor accounts, no per-message fees) | **$0** for FCM message delivery on Spark plan; no credit card required ([Firebase Pricing](https://firebase.google.com/pricing)) |
| **Apple Developer Program required?** | **No ($0)** — APNs accepts standard VAPID-signed Web Push requests directly at `*.push.apple.com` ([WebKit 13878](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); [Apple Developer Docs](https://developer.apple.com/documentation/UserNotifications/sending-web-push-notifications-in-web-apps-and-browsers)) | **No ($0)** — FCM Web SDK uses a VAPID Web Push certificate configured in Firebase Console ([Firebase JS Client Docs](https://firebase.google.com/docs/cloud-messaging/js/client)) |
| **Protocol / architecture** | App server encrypts payload & signs JWT with VAPID keys ([RFC 8030](https://datatracker.ietf.org/doc/html/rfc8030), [RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292)) and POSTs directly to each browser's push endpoint (`*.push.apple.com`, `fcm.googleapis.com`, etc.). | Client bundles Firebase JS SDK + `firebase-messaging-sw.js`, registers an FCM token backed by VAPID, and backend calls FCM HTTP v1 API. |
| **Operational trade-offs** | Minimal footprint (e.g., standard `web-push` package in Node/Edge function); zero lock-in; works with any free database/cron. Must allow outbound HTTPS to `*.push.apple.com` and `fcm.googleapis.com`. | Convenient *only* if already standardized on Firebase. Note: triggering scheduled Round reminders via Firebase Cloud Functions requires upgrading to the Blaze (pay-as-you-go) plan even if usage stays within free tier allowances ([Firebase Pricing](https://firebase.google.com/pricing)). |

**Design implication for Frigid Feet:** Use **standard Web Push + VAPID** (optionally emitting Safari 18.4-compatible declarative payloads with a standard SW `push` handler fallback). Because iOS requires the manual "Add to Home Screen" step, assume some Runners will not complete it — treat Web Push as a helpful opt-in nudge, never the sole way Runners know their next Leg is starting (complement with an in-app countdown and Basecamp status board).

---

## 2. Browser Geolocation & Live Location Tracking

### 2.1 Behavior of `navigator.geolocation.watchPosition()` on Screen Lock / Background

**Continuous background GPS tracking is fundamentally unsupported in mobile web browsers.**

- **W3C Specification rule:** The [W3C Geolocation API](https://www.w3.org/TR/geolocation/) restricts `watchPosition()` callbacks to documents that are **fully active** and whose Page Visibility state is **`"visible"`**. When a document becomes `"hidden"` (screen locked, browser minimized, or Runner switches to Spotify/Strava/Messages), the user agent must **not** fire position updates; intermediate location changes are silently dropped until the document returns to `"visible"` and a subsequent position change occurs ([W3C Geolocation API](https://www.w3.org/TR/geolocation/)).
- **Android Chrome:** Chrome explicitly disallows background geolocation access for web pages — as soon as a tab or PWA is backgrounded or the screen turns off, geolocation updates pause ([Chrome for Developers](https://developer.chrome.com/); [MDN `Geolocation.watchPosition()`](https://developer.mozilla.org/docs/Web/API/Geolocation/watchPosition)).
- **iOS Safari:** WebKit enforces the same foreground-only restriction and aggressively suspends JavaScript execution for backgrounded tabs and standalone Home Screen PWAs. Locking the screen immediately halts `watchPosition()` callbacks and any `setInterval` / WebSocket heartbeats.

### 2.2 Screen Wake Lock API Caveats

Using `navigator.wakeLock.request('screen')` to keep the browser visible and prevent screen auto-lock has major practical flaws for Runners:

- **Automatic release on hide or manual lock:** Per the [MDN Screen Wake Lock API](https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API) and [web.dev Screen Wake Lock](https://web.dev/articles/wake-lock), the wake lock is immediately released whenever the page becomes hidden (e.g., switching to a music app or pressing the physical side button before pocketing the phone). The app must re-acquire it on `visibilitychange` when the user returns.
- **OS refusal under low battery:** The OS may reject or revoke wake locks with `NotAllowedError` when Low Power Mode is active or battery is low ([MDN Screen Wake Lock API](https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API)).
- **iOS Standalone PWA historical bug (iOS 16.4–18.3):** Although WebKit added Screen Wake Lock in Safari 16.4, **WebKit Bug #254545 broke `navigator.wakeLock` inside standalone Home Screen PWAs across iOS 16.4 through iOS 18.3**. Apple fixed this in **iOS/iPadOS 18.4** ([WebKit Features in Safari 18.4](https://webkit.org/blog/16534/webkit-features-in-safari-18-4/)). Any Participant running the installed PWA on iOS <18.4 will still have their screen auto-lock.

### 2.3 Battery & Cold-Weather Running Impact

Keeping a phone display lit continuously alongside `watchPosition({ enableHighAccuracy: true })` (continuous GNSS radio + network uploads) is one of the highest power-draw states possible on a smartphone ([MDN Geolocation API](https://developer.mozilla.org/docs/Web/API/Geolocation_API)). During a 10-hour outdoor cold-weather relay ("Frigid Feet"), lithium-ion battery capacity already drops sharply in low temperatures; asking Runners to keep their screen awake and unlocked in a pocket or gloved hand for 25–40 minutes per Leg causes severe battery drain and accidental pocket touches.

### 2.4 Web-Viable Alternatives for a 5K Basecamp Relay

Because every Round starts and ends at the same **Basecamp** on a known 5K course:

1. **One-tap Basecamp Leg Start / Finish check-ins (Recommended primary model):** Runners (or a Supporter at Basecamp) tap **Start Leg** / **Finish Leg**. Zero GPS drain, works with locked phones in pockets, and gives exact Leg duration for every Round.
2. **Pace-based ETA & live elapsed-time board:** Using the Leg start timestamp plus the Runner's self-reported 5K pace (or prior Leg times), the Basecamp view displays a live elapsed clock and expected return window (e.g., *"Out 18:40 — expected back in ~7–9 min"*) without needing live GPS coordinates.
3. **Optional on-demand single-shot location ping (`getCurrentPosition`):** If Supporters want an optional midpoint check-in, offer a manual **"Drop Pin / I'm at Turnaround"** button using one-shot `navigator.geolocation.getCurrentPosition()` (with `timeout` and graceful fallback if denied). Never run continuous `watchPosition()`.
4. **Post-Leg route capture via dedicated watch/app:** Let Runners record GPS tracks on their native fitness watch/phone app (which has OS background GPS privileges) and optionally link or log their finished time/split afterward.

---

## 3. Offline & Spotty-Signal Resilience

### 3.1 Service Worker Caching & Storage Durability

- **Service Worker & Cache Storage API:** Fully supported on both iOS Safari and Android Chrome ([MDN Service Worker API](https://developer.mozilla.org/docs/Web/API/Service_Worker_API); [web.dev Caching](https://web.dev/learn/pwa/caching)).
  - **App Shell + Static Edition Info (`CacheFirst`):** Precache HTML/JS/CSS bundles, icons, Basecamp info, schedule, and course map image/GeoJSON during Service Worker `install` (via Workbox `workbox-precaching` or a small custom SW) so the app opens instantaneously even in airplane mode ([web.dev Caching](https://web.dev/learn/pwa/caching)).
  - **Dynamic Edition/Round State (`NetworkFirst` or `StaleWhileRevalidate`):** Serve the latest Team roster, Round schedule, and Leg statuses from network when available, falling back seamlessly to the last cached response when cell signal drops outdoors ([web.dev Caching](https://web.dev/learn/pwa/caching)).
- **Safari 7-day ITP eviction & Home Screen exemption:**
  - Under WebKit Intelligent Tracking Prevention (ITP), all script-writable storage (`IndexedDB`, `localStorage`, Cache API, Service Workers) for websites opened in normal Safari tabs is deleted after **7 days of browser use without user interaction** ([WebKit: Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
  - **Home Screen PWAs are explicitly exempted** from ITP's 7-day purge and maintain isolated storage from Safari ([WebKit 10218](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). Even for non-installed Safari tabs, a 10-hour single-day Edition is well inside the 7-day window.
- **Storage quotas:** Since Safari 17 / iOS 17, WebKit uses dynamic disk-percentage quotas (up to **60%** of total disk per origin in Safari, **15%** in non-browser WebKit contexts) and supports `navigator.storage.estimate()` and `navigator.storage.persist()` ([WebKit: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)). A <30-Participant event requires well under 1 MB of structured state.

### 3.2 Background Synchronization API Gap on iOS Safari

- **Android Chrome:** Supports the [Background Synchronization API](https://developer.mozilla.org/docs/Web/API/Background_Synchronization_API) (`registration.sync.register()`) and Workbox Background Sync ([Chrome for Developers: Workbox Background Sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync)), allowing a Service Worker to retry failed POST requests automatically after connectivity returns even if the tab is closed.
- **iOS Safari (and Firefox):** **Does not support the Background Synchronization API** (nor Periodic Background Sync) ([MDN Background Synchronization API](https://developer.mozilla.org/docs/Web/API/Background_Synchronization_API)). A closed or backgrounded iOS PWA cannot wake itself up solely because cell signal returned.

### 3.3 Practical Offline Queue + Reconnect Flush Pattern (<30 Participants)

Because iOS Safari lacks Background Sync, build an **application-level offline write queue** that works identically across iOS and Android, with Chromium Background Sync as optional progressive enhancement:

1. **Store pending mutations in IndexedDB** (not just in-memory state; prefer IndexedDB over `localStorage` because IndexedDB is asynchronous, structured, and accessible from both the page and Service Worker if Chrome Background Sync is layered on later — [MDN IndexedDB API](https://developer.mozilla.org/docs/Web/API/IndexedDB_API)).
2. **Design every mutation to be idempotent and client-timestamped:**
   ```json
   {
     "actionId": "uuid-v4",
     "type": "LEG_FINISH",
     "editionId": "2026",
     "teamId": "team-1",
     "roundNumber": 4,
     "runnerId": "runner-7",
     "recordedAt": "2026-11-22T14:28:12.410Z"
   }
   ```
   - The server deduplicates on `actionId` (`INSERT ... ON CONFLICT DO NOTHING`), making retries completely safe.
   - Official Leg timing uses `recordedAt` (captured when the Participant tapped the button), not server receipt time when signal recovers 3 minutes later.
3. **Optimistic UI with honest sync indicator:** Immediately reflect the tap in the local UI and show a subtle status pill: `Saved locally · Waiting for signal (1)` → `Synced ✓`.
4. **Do NOT trust `navigator.onLine === true` alone:** Per [MDN `Navigator.onLine`](https://developer.mozilla.org/docs/Web/API/Navigator/onLine), `false` reliably indicates no network interface, but `true` frequently produces **false positives** on weak outdoor cell connections or captive portals where HTTP requests still hang or time out. Always pair requests with a short `AbortController` timeout (e.g., 6–8 seconds) and queue on any network/timeout failure.
5. **Multi-trigger foreground flush (essential for iOS):** Attempt to drain the IndexedDB queue in FIFO order whenever any of the following occur:
   - Immediately upon enqueuing a new action.
   - On `window.addEventListener('online', flushQueue)`.
   - On `document.addEventListener('visibilitychange', ...)` when `visibilityState === 'visible'` and on `window` `focus` (catches the common case of a Runner finishing a Leg outdoors and reopening the app at Basecamp).
   - On a lightweight backoff timer (e.g., 5s → 15s → 30s) while the page is visible and `pendingCount > 0`.
   - *(Optional progressive enhancement)* On Chromium where `'SyncManager' in window`, also call `registration.sync.register('flush-queue')` so Android Chrome can drain the same IndexedDB queue even if the Participant closes the tab immediately after tapping.

---

## Primary Sources Cited

- Apple WebKit Blog — *Web Push for Web Apps on iOS and iPadOS* (Feb 2023): <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>
- Apple WebKit Blog — *Meet Declarative Web Push* (Mar 2025): <https://webkit.org/blog/16535/meet-declarative-web-push/>
- Apple WebKit Blog — *WebKit Features in Safari 18.4* (Mar 2025 — Screen Wake Lock fix in Home Screen Web Apps + Declarative Web Push): <https://webkit.org/blog/16534/webkit-features-in-safari-18-4/>
- Apple WebKit Blog — *Updates to Storage Policy* (Aug 2023): <https://webkit.org/blog/14403/updates-to-storage-policy/>
- Apple WebKit Blog — *Full Third-Party Cookie Blocking and More* (Mar 2020 — 7-day storage cap & Home Screen web app exemption): <https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/>
- Apple Developer Documentation — *Sending web push notifications in web apps and browsers*: <https://developer.apple.com/documentation/UserNotifications/sending-web-push-notifications-in-web-apps-and-browsers>
- IETF — *RFC 8030: Generic Event Delivery Using HTTP Push*: <https://datatracker.ietf.org/doc/html/rfc8030>
- IETF — *RFC 8292: Voluntary Application Server Identification (VAPID) for Web Push*: <https://datatracker.ietf.org/doc/html/rfc8292>
- W3C — *Geolocation API Specification*: <https://www.w3.org/TR/geolocation/>
- MDN Web Docs — *Push API*: <https://developer.mozilla.org/docs/Web/API/Push_API>
- MDN Web Docs — *Notifications API*: <https://developer.mozilla.org/docs/Web/API/Notifications_API>
- MDN Web Docs — *Badging API*: <https://developer.mozilla.org/docs/Web/API/Badging_API>
- MDN Web Docs — *BeforeInstallPromptEvent*: <https://developer.mozilla.org/docs/Web/API/BeforeInstallPromptEvent>
- MDN Web Docs — *Screen Wake Lock API*: <https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API>
- MDN Web Docs — *Geolocation.watchPosition()*: <https://developer.mozilla.org/docs/Web/API/Geolocation/watchPosition>
- MDN Web Docs — *Background Synchronization API*: <https://developer.mozilla.org/docs/Web/API/Background_Synchronization_API>
- MDN Web Docs — *Navigator.onLine*: <https://developer.mozilla.org/docs/Web/API/Navigator/onLine>
- MDN Web Docs — *IndexedDB API*: <https://developer.mozilla.org/docs/Web/API/IndexedDB_API>
- web.dev — *Push notifications overview* & *Permission UX*: <https://web.dev/articles/push-notifications-overview>, <https://web.dev/articles/push-notifications-permissions-ux>
- web.dev — *Stay awake with the Screen Wake Lock API*: <https://web.dev/articles/wake-lock>
- web.dev — *Learn PWA: Caching*: <https://web.dev/learn/pwa/caching>
- Chrome for Developers — *Workbox Background Sync*: <https://developer.chrome.com/docs/workbox/modules/workbox-background-sync>
- Firebase — *Pricing* & *Cloud Messaging JavaScript Client Setup*: <https://firebase.google.com/pricing>, <https://firebase.google.com/docs/cloud-messaging/js/client>
