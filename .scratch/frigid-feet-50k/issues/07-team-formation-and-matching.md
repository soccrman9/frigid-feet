# Hybrid Team Formation and Free-Agent Matching

Type: grilling
Status: resolved
Blocked by: 04

## Context

Depends on the Team size, multi-Leg, and Round rules settled in [Relay Rules, Hourly Round Schedule, and Leg Mechanics](./04-relay-rules-and-round-mechanics.md).

## Question

How should full Teams, partial Teams, and **Free Agents** come together cleanly before race day?

Specifically decide:
- Self-service Team creation (naming, optional fun tagline/color, inviting friends) vs. marking a partial Team as "open / looking for Runners".
- How **Free Agents** get matched (browse & join open partial Teams directly, request to join, or organizer drag-and-drop / manual placement — and how we make joining a Team feel welcoming for nervous runners).
- How Teams assign **Runners** to specific **Rounds** (Round 1–Round 10 schedule builder, flagging uncovered Rounds, handling Runner availability windows).
- When rosters lock (if ever) and how last-minute race-week or race-morning swaps work.

## Answer

- **Lightweight Team Creation & Open/Closed Toggle**:
  - Any **Runner** (or **Organizer**) can create a **Team** with a Team name, optional fun tagline/color or emoji, an **"Open — looking for Runners"** toggle (defaulting to Open until toggled off or 10 Runners are reached), and an optional short note (e.g., *"Need 2 more Runners for afternoon Rounds"*).
  - No Team invite codes or Captain-only settings; any teammate or Organizer can edit Team details.
  - "Open" Teams display a one-tap **Join Team** button plus their uncovered **Rounds** (e.g., *"Open Rounds: 4, 7"*) so **Free Agents** can easily spot a schedule match. Toggling a Team to "Closed / Full" hides the self-service Join button for Participants while Organizers can still edit any roster.
- **Free-Agent Matching & Team Membership Rules**:
  - **Direct one-tap join**: Any Free Agent can join any Open Team with one tap (no approval queue).
  - **Free Agents list**: Only Participants with RSVP **`Going (Runner)`** who are not on a Team appear in the **Free Agents** list (showing name, Round availability window, and optional *"First 5K / extra cheers welcome!"* tag). **Teams** are strictly for **Runners** (**Supporters** remain unaffiliated at Basecamp; `Maybe` Participants can join once they switch to `Going (Runner)`).
  - **Organizer placement**: Organizers can assign or move any Runner between Teams, or spin up a new Team for unmatched Free Agents at any time.
  - **One Team per Runner**: A Runner belongs to at most one Team at a time. Leaving a Team returns them to Free Agent status and reverts any future assigned Rounds on the old Team to open/unassigned placeholders, while preserving any already-completed **Legs** on the Team they ran them for (Organizers can still reassign a Leg if logged in error).
  - **Empty Team cleanup**: If the last Runner leaves a Team with 0 completed Legs, the Team is automatically deleted (with a quick confirmation). Organizers can also delete any Team with 0 completed Legs.
- **Round 1–Round 10 Schedule Builder**:
  - Each Team page features a 10-row **Round** schedule (Round 1 through Round 10) where any teammate or Organizer can assign, claim, swap, or unassign a Runner from the Team's roster.
  - Shows a clear coverage summary at the top (e.g., `8 of 10 Rounds covered — Rounds 4 & 7 open`) and surfaces uncovered Rounds on the `Teams` overview so Free Agents know which Teams need help.
  - Displays **non-blocking gentle warnings** when assigning a Runner outside their RSVP attendance window or to back-to-back Rounds.
- **No Hard Roster Lock**:
  - Rosters and Round schedules remain unlocked through race day to support last-minute race-week/race-morning swaps, walk-in Runners, and make-up Legs under the friend-group honor system and Organizer oversight.
