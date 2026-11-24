# Relay Rules, Hourly Round Schedule, and Leg Mechanics

Type: grilling
Status: resolved

## Question

What are the exact rules and edge cases for the 10 hourly 5K **Rounds** and **Legs**?

Specifically decide:
- How each hourly Round starts (mass start on the hour for all Teams, staggered, or rolling?) and what happens if a slower Runner takes **more than 60 minutes** to finish their 5K (critical for our welcoming, encouraging vibe!).
- Minimum and maximum **Team** size (e.g., 1–10 Runners?), whether a Runner can run multiple Legs or back-to-back Rounds, and whether two friends can run a Leg together for support.
- How mid-race substitutions, late arrivals, or a Runner who can't finish a Leg are handled without breaking the Team's progress toward 50K.
- Whether the 5K course is a single fixed loop or can vary by Round, and whether an Edition model should support reusing the app next year.

## Answer

- **Hourly mass start schedule**: 10 **Rounds** on the hour — default **8:00 AM (Round 1)** through **5:00 PM (Round 10)**, finishing by **6:00 PM** (start time configurable per **Event**). No rolling baton.
- **Over-60-minute finishes**: Rounds are independent on the hour with **no penalty** if a **Runner** takes over 60 minutes; the next Round starts on the hour regardless, and the slower Runner receives full 5K credit upon finishing.
- **Team size & Leg scheduling**: **1 to 10 Runners** per **Team**, with no cap on how many **Legs** (including back-to-back Rounds) a single Runner can take. Teams and Runners can pre-schedule who runs each Round to plan around back-to-back fatigue or outside commitments.
- **One Runner per Leg**: No buddy/companion running feature; each Leg belongs to a single assigned Runner.
- **Swaps, late starts, and walk-in subs**: Anytime Leg swapping between teammates is supported; late starts are handled via swaps or starting late; anyone stepping in to help simply joins as a new **Runner** (no separate guest-sub role).
- **Unfinished / missed Legs**: Keep state simple (no complex Partial/DNF status) — leave an open **placeholder** Leg so another Runner can step in and make it up toward the Team's 50K.
- **Courses**: Each **Event** defines a small list of named 5K **Courses** (primary boardwalk out-and-back plus 1–2 optional alternates), and Runners can pick which Course they run on their Leg.
- **Multi-year reuse & glossary update**: Renamed **Edition** → **Event** and added **Course** in [GLOSSARY.md](../../../GLOSSARY.md). Data is scoped by **Event** so each year's results and **Badges** are archived and the app can be reused in future winters.
