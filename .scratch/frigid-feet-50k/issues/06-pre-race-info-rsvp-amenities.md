# Pre-Race Info, RSVP, Amenities Sign-Up, and Chip-In Flow

Type: grilling
Status: resolved

## Question

What pre-race information and planning workflows do **Participants** need so everyone feels prepared and excited to attend?

Specifically decide:
- What race information lives on the event info hub (5K course map + downloadable GPX, Basecamp address/parking/amenities, hourly schedule, cold-weather gear tips, first-aid/safety notes, announcements).
- What fields the RSVP flow captures (Runner vs. Supporter role, arrival/departure windows if someone can't stay all 10 hours, comfort pace or "first 5K / nervous runner" flag, dietary/amenity notes).
- How the **amenities / potluck sign-up** works (organizer-defined wish list of food/water/first-aid/gear items to claim, free-form "I'm bringing X" entries, or both).
- How the **facility/amenities chip-in** is presented (suggested amount, Venmo/Zelle handles/links, and an organizer-only paid/unpaid checklist).

## Answer

- **Event Info Hub & Courses**:
  - Structured, Organizer-editable sections on the Event Info hub: Basecamp address + Google/Apple Maps link, parking & facility amenities notes, hourly **Round** schedule, cold-weather gear tips, first-aid/safety notes, and an optional outbound Strava Club link.
  - Lightweight Organizer **Announcements** feed (pinned updates for weather, ice/traction alerts, or last-minute logistics).
  - For each **Course** (1–3 named 5K routes): short description/notes, an **in-app interactive map preview** rendered client-side from its `.gpx` file (so friends don't need any external app installed), a one-tap `.gpx` download button, and an optional external route link (e.g., Strava Route, AllTrails, or Google Maps) so a Course can be published even before a `.gpx` is uploaded.
- **RSVP & Participant Profile Fields**:
  - Four RSVP statuses: **Going (Runner)**, **Going (Supporter)**, **Maybe**, and **Can't make it**.
  - Optional attendance window by **Round** for Going Participants, defaulting to **All day (Rounds 1–10)** with the option to pick an arrival/departure Round range.
  - Three optional, zero-pressure profile fields:
    1. Rough 5K time/pace for Runners (framed softly as *"helps Basecamp know when to cheer you in — totally optional"*).
    2. Encouraging tag (e.g., *"First 5K / extra cheers welcome!"*).
    3. Dietary/allergy notes (visible to signed-in friends to help food planners).
- **Supply Sign-Up (Hybrid Wish List + Free-Form)**:
  - Standardized bringable items as **Supply** in [GLOSSARY.md](../../../GLOSSARY.md) (reserving "amenities" for fixed Basecamp facility features).
  - Supports **both** an Organizer-curated wish list (categorized into Food, Drinks, Gear/First Aid, with target slot counts like `2 of 3 claimed`) **and** free-form *"I'm bringing X"* entries added by any Participant.
  - Claims and free-form entries support an optional short note (e.g., *"2 gallons of hot cocoa + cups"*); Participants can edit/remove their own claims/entries while Organizers can manage all items.
  - Displays a compact **"Dietary notes to keep in mind"** banner at the top of the Food/Drinks section summarizing Participants' listed dietary/allergy notes.
- **Facility & Supplies Chip-In Flow**:
  - Friend-facing chip-in card displays the shared aggregate progress bar (`\$X of \$Y event costs covered`), a brief itemized cost summary, a soft suggested amount (*"Suggested \$X — pay what you can, no pressure!"*), and Organizer-configured Venmo/Zelle handles (copyable / deep-linked, with zero banking/payment API integration).
  - Chip-in recording is **Organizer-only** (no Participant "I sent it" self-report button): Organizers edit the target cost and itemized lines, log contributions against a **Participant** (amount + optional note), and can also log unlisted/anonymous contributions so the shared aggregate progress bar stays accurate.
- **Pre-Race Landing & Navigation**:
  - Simple top-level navigation across pre-race and race day (`Home`, `Teams`, `Race Day`, `Supplies`).
  - Pre-race `Home` surfaces pinned **Announcements**, a personal **Pre-Race Checklist** banner (RSVP status, Team status, Supplies claimed), and quick links to Event Info, Courses, and Chip-In.
