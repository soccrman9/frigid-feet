# 21: Organizer Mode: passcode unlock, Event/Course/Announcement management & secret rotation

**What to build:** Give Event Organizers a passcode-protected Organizer Mode directly from `Home` so hosts and co-hosts can update Basecamp/Event logistics, manage 5K Courses (including `.gpx` XML), post and pin Announcements, rotate Event secrets safely, and generate shareable invite links/QR codes and Basecamp Dashboard URLs.

**Blocked by:** 18: Home Event info, Announcements & interactive Course maps

**Status:** resolved

- [x] `unlock_organizer(p_event_id, p_passcode)` RPC verifies `organizer_passcode_hash` via `SECURITY DEFINER`, grants both `'participant'` and `'organizer'` scopes in `session_grants`, and returns a boolean indicating success without revealing passcode details.
- [x] `rotate_event_secret(p_event_id, p_secret_type, p_new_value)` RPC requires `'organizer'` scope, updates the specified hash (`invite_code`, `organizer_passcode`, or `dashboard_token`) in `event_secrets`, and revokes existing `session_grants` for the rotated scope while preserving the calling Organizer's own session when rotating `'organizer'`.
- [x] `Home` provides a discreet **Organizer Mode** entry point opening a passcode prompt; once unlocked, Organizer controls appear clearly (with a visual Organizer active indicator and quick lock/exit action).
- [x] Organizers can edit Event and Basecamp fields (`name`, `event_date`, `start_time`, `timezone`, `basecamp_name`, `basecamp_address`, `basecamp_maps_url`, `parking_amenities_notes`, `cold_weather_tips`, `safety_first_aid_notes`, `strava_club_url`, `recap_note`, and chip-in display settings: target, suggested amount, cost breakdown JSON, Venmo handle, Zelle handle).
- [x] Organizers can add, edit, reorder, and delete **Courses** (name, description, distance, upload or paste `.gpx` into `gpx_xml`, toggle primary Course cleanly, and optional `https://`-validated external route URL).
- [x] Organizers can create, edit, pin/unpin, and delete **Announcements**, immediately updating the `Home` Announcements feed.
- [x] Organizers can rotate the Event invite code, Organizer passcode, or Basecamp Dashboard token from Organizer Mode, and generate/copy the shareable invite URL (`/e/:slug?code=...`), printable/saveable scannable invite QR code, and `/dashboard/:token` link (capturing newly entered/rotated secret values client-side since hashes are one-way).
- [x] Automated tests verify Organizer unlock, non-Organizer RLS rejection on `events`/`courses`/`announcements`, secret rotation session revocation (keeping the caller active on Organizer passcode rotation), and Course `https://` URL validation.

## Comments

- Resolved on integration branch `feat/winter-grind-50k` (merged at `108d4f8`; post-code-review verified at `ce2ea1e` with `npm run typecheck`, 57/57 test files / 224/224 tests passing, and clean `npm run build`).
