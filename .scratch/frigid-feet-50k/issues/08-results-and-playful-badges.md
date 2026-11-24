# Encouraging Results, Simple Team Milestones, and Playful Badges

Type: grilling
Status: resolved
Blocked by: 04

## Context

Depends on the Round and Leg completion definitions settled in [Relay Rules, Hourly Round Schedule, and Leg Mechanics](./04-relay-rules-and-round-mechanics.md).

## Question

How should we display team progress/results and celebrate Participants with playful **Badges** while maintaining a warm, non-competitive atmosphere that encourages slower or nervous runners?

Specifically decide:
- What **Team** results and progress metrics to show (e.g., km completed toward 50K, Rounds finished, total moving time — and whether to de-emphasize or hide head-to-head rankings/leaderboards).
- Which **Badges** to include and how they are awarded:
  - Simple auto-calculated Badges (e.g., First 5K Club, Consistency Champ, Coldest Round Warrior, Dawn Patrol / Night Owl, Cheer Squad MVP).
  - Organizer-awarded or peer-nominated/voted playful superlatives (e.g., Best Cold-Weather Outfit, Best Snack Contributor, Most Encouraging).
- Whether individual Leg pace/times are visible to everyone, visible only to the Runner/Team, or optional/hideable for nervous runners.
- How post-race recaps and Badges are communicated and shared (in-app recap page, copyable text summary, or downloadable share cards for the group chat).

## Answer

- **Encouraging Team Progress & Non-Competitive Main View**:
  - Main Team progress views (and the **Basecamp Dashboard**) highlight collective distance and completion: `km completed / 50 km`, `Rounds completed / 10`, a visual 10-Round progress bar per **Team**, simple Team milestone callouts (*Halfway There 25K*, *50K Finisher*), and an **Event**-wide collective km counter (e.g., *"Friends ran X km together today!"*).
  - Teams are displayed in a fixed/alphabetical order — no head-to-head Team speed rankings or leaderboards on the main view or Basecamp Dashboard.
- **Opt-In Speed Leaderboard & Individual Leg Time Visibility**:
  - Each **Runner** has a per-Runner opt-in toggle on their profile (default **OFF**, changeable anytime):
    - **When OFF (default)**: The Runner can log a **Leg** as *"Completed 5K"* with no time required; no Leg time is displayed publicly to other Participants (any time logged privately stays visible only to them), and they are omitted from the Speed Leaderboard.
    - **When ON**: Their logged Leg times are shown on their Team's Round breakdown, and they appear on a separate **Speed Leaderboard** section ranking opted-in Runners individually (fastest single 5K Leg and average 5K time across their Legs — no Team speed leaderboard, so mixed-pace Teams stay pressure-free).
  - **Leaderboard visibility**: The separate Speed Leaderboard section is viewable by any signed-in **Participant** (including **Supporters** and Runners whose own toggle is OFF) so friends can cheer on opted-in Runners without sharing their own times. *(Refines [Access, Identity, and Privacy Model for Friends](./05-access-identity-and-privacy.md): individual 5K times are opt-in rather than visible by default.)*
- **Two-Source Badge System (Auto-Calculated + Organizer-Awarded)**:
  - Both **Runners** and **Supporters** (and **Teams**) can earn multiple **Badges**; auto-calculated Badges appear **live** as they are earned during the Event. Skip in-app peer voting for v1.
  - **Auto-calculated Team Badges**: *Halfway There (25K)*, *50K Finisher (10/10 Rounds)*, *Full Squad* (every Runner on the Team completed ≥1 Leg).
  - **Auto-calculated Participant Badges**: *First 5K Club* (*"first 5K"* RSVP tag + completed a Leg), *Dawn Patrol* (Round 1), *Anchor Leg* (Round 10), *Back-to-Back* (2 consecutive Rounds), *Distance Machine* (3+ Legs), *Course Explorer* (2+ different **Courses**), *Basecamp Hero* (claimed/brought a **Supply**).
  - **Organizer-awarded Superlatives**: Built-in presets (*Best Cold-Weather Outfit*, *Cheer Squad MVP*, *Best Snack Contributor*, *Most Encouraging*, *Best Vibes at Basecamp*) plus an **Organizer** UI to create new custom Badges/superlatives (name, emoji, short description) and award them to any Participant or Team.
- **Post-Race Event Recap & Copyable Share Text**:
  - Dedicated in-app **Event Recap** view featuring an optional **Organizer wrap-up note**, Event-wide total km, Team 50K completions, and the full Badge showcase.
  - Two one-tap copy buttons: **Copy Event Recap** (formatted for iMessage/WhatsApp group chats) and **Copy My Strava Post** (personalized summary of the Runner's completed Legs/km, Team, Courses run, and Badges earned for Strava descriptions). Defer PNG share-card image generation for v1.
