# Access, Identity, and Privacy Model for Friends

Type: grilling
Status: resolved

## Question

How should ~30 friends sign in and interact with the app with minimal friction while keeping private event details (Basecamp address, Participant names, chip-in details, live race status) protected from the public internet?

Specifically decide:
- Authentication mechanism (e.g., shared event invite code + claim-your-name/PIN, passwordless email magic link, Google OAuth, or Strava OAuth) balancing zero-friction on race morning against preventing accidental edits to someone else's profile.
- Permission boundaries: what can any **Participant** edit (own RSVP, amenity sign-up, own Leg check-in, Team roster), vs. **Team Captains** (if that role exists), vs. **Organizer** (race info, paid status, manual timing overrides, official Badges).
- How the read-only **Basecamp Dashboard** authenticates on a shared laptop or TV (e.g., unlisted secret dashboard URL or organizer login).

## Answer

- **Event gate & phone-to-phone sharing**: Fully gated behind a simple Event invite code that **auto-unlocks** via a shared Event invite URL or scannable QR code (easy to pass over messaging apps while hiding Basecamp address, Participant names, and live status from strangers and search crawlers).
- **Participant identity (honor system, per Event)**: Once unlocked, friends use **honor-system tap-your-name** (or create a new Participant profile for walk-ins), remembered in their phone's browser — zero PINs, passwords, or email/OAuth friction. Participant profiles are scoped fresh per **Event** (archived per year).
- **Roles & permissions**: Two roles only — **Participant** and **Organizer** (no Team Captain role; **Organizer** added to [GLOSSARY.md](../../../GLOSSARY.md)).
  - **Participants** can edit their own RSVP/profile, claim/unclaim amenities, collaborate with teammates on their own Team's roster and Leg schedule, and check in / log Legs for themselves **or on a teammate's behalf** (helpful if a Runner leaves their phone at Basecamp or leaves early).
  - **Organizers** unlock admin mode via a **shared Organizer passcode** (usable by the host and any co-hosts) to edit Event/Basecamp/Course details, view/record individual chip-in amounts, override any Leg/timing, and award official Badges.
- **In-group privacy**: All Event data (names, Teams, 5K times, schedules, amenities) and the **shared aggregate chip-in total** (e.g., `\$X of \$Y event costs covered`) are visible to signed-in friends; **individual chip-in amounts** are **Organizer-only** (behind the Organizer passcode) so honor-system profile switching cannot expose what anyone paid.
- **Basecamp Dashboard**: Read-only **unlisted Event-specific URL with a rotatable secret token** for one-click display on a shared laptop or TV without exposing Organizer privileges.
