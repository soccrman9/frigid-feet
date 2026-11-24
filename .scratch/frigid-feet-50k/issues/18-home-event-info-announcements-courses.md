# 18: Home Event info, Announcements & interactive Course maps

**What to build:** Give every friend a warm, scannable `Home` screen containing all Basecamp logistics, the 10-Round schedule, pinned Organizer Announcements, collective km progress, and interactive 5K Course previews rendered directly from stored `.gpx` XML with one-tap downloads and watch/phone loading instructions.

**Blocked by:** 16: App bootstrap, full Postgres schema/RLS, heartbeat & Event invite gate

**Status:** ready-for-agent

- [ ] `Home` displays the Event info section: Basecamp name and address with an outbound Google/Apple Maps link, parking and facility notes, the 10-Round hourly schedule (formatted in the Event's timezone), cold-weather gear tips, safety/first-aid notes, an optional low-key Strava Club link (hidden when unset), and an Event-wide collective km summary card.
- [ ] `Home` displays the chronological **Announcements** feed with pinned updates (`is_pinned = true`) anchored visually at the top using non-color-only pinned badges/icons.
- [ ] `Home` renders all 1–3 Event **Courses** in `sort_order`, clearly highlighting the primary Course and displaying each Course's name, distance, description, and optional outbound `https://` route link (never rendering non-`https://` URLs).
- [ ] Each Course with `gpx_xml` renders an interactive Leaflet + OpenStreetMap map preview parsed client-side directly from `courses.gpx_xml` (gracefully handling empty or malformed GPX without crashing) and provides a one-tap `.gpx` file download button (`>=44px` target).
- [ ] Next to the Course `.gpx` download, a collapsible **"How to load this Course on your watch or phone"** help accordion explains Garmin, Apple Watch / Strava, and a reassuring *"No watch? Just use the map preview above!"* option.
- [ ] Automated tests cover client-side GPX parsing/fallback behavior, `.gpx` download trigger, pinned-first Announcement ordering, safe `https://` link validation, and Event info rendering.
