# Mobile Web Push, Live Location, and Offline Capabilities

Type: research
Status: resolved

## Question

In a **mobile-first web app (PWA)** targeting both **iOS Safari** and **Android Chrome** at **\$0 cost**, what are the real-world capabilities, OS restrictions, and user-friction trade-offs of:

1. **Web Push notifications** (for reminding Runners of upcoming Legs): Current iOS Safari / iPadOS / Android Chrome support, the iOS "Add to Home Screen" requirement, permission UX, and free server-side push options (standard Web Push / VAPID vs. Firebase Cloud Messaging free tier).
2. **Live GPS location tracking in the browser**: What happens to `navigator.geolocation.watchPosition` when a Runner locks their phone screen or switches apps on iOS Safari and Android Chrome (background execution limits, Wake Lock behavior, battery drain), and what lightweight web-friendly alternatives exist if true background GPS tracking isn't viable in a browser.
3. **Offline / spotty-signal resilience**: Practical PWA patterns (Service Worker caching, IndexedDB/local queue, optimistic UI) for keeping Basecamp timing and Runner check-ins reliable if cell signal dips outdoors.

## Answer

- **Web Push ($0 via standard Web Push RFC 8030 + VAPID RFC 8292):** Works on Android Chrome (regular tabs & installed PWAs) and iOS/iPadOS 16.4+ **only after manual Share → "Add to Home Screen"** (`display: "standalone"`/`"fullscreen"` manifest; Safari lacks `beforeinstallprompt`, forbids silent pushes, requires a user gesture to request permission, ignores custom notification sounds/vibration, and supports `setAppBadge` + Safari 18.4 Declarative Web Push). Direct VAPID push needs no Apple Developer account ($0) and avoids FCM's Firebase SDK / Cloud Functions Blaze-plan coupling. Treat Web Push as an opt-in nudge alongside an in-app countdown and Basecamp board.
- **Live Browser GPS (`watchPosition` is NOT viable in the background):** Both the W3C Geolocation spec and iOS Safari / Android Chrome drop `watchPosition()` updates as soon as the screen locks or the browser backgrounds. `navigator.wakeLock` releases on hide/manual lock, was broken in iOS Home Screen PWAs on iOS 16.4–18.3 (fixed in iOS 18.4), and severely drains cold-weather batteries. Use **manual Basecamp Start/Finish Leg check-ins + pace-based ETA** (with an optional one-tap `getCurrentPosition` pin if desired) instead of continuous browser GPS.
- **Offline / Spotty Signal (Service Worker + IndexedDB queue):** Service Worker caching (`CacheFirst` App Shell + `NetworkFirst` Round/Team data) works on both platforms, and Home Screen PWAs are exempt from Safari's 7-day ITP storage purge. Because **iOS Safari does not support the Background Synchronization API**, store idempotent, client-timestamped mutations in **IndexedDB** with optimistic UI and flush on `online`, `visibilitychange`, `focus`, and a short backoff timer (never trusting `navigator.onLine === true` alone; optionally layering Chrome Background Sync as progressive enhancement).

[Full research report](../research/02-web-push-gps-offline-capabilities.md)
