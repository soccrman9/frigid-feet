# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript + Tailwind CSS PWA (`vite-plugin-pwa`, `idb`, Leaflet + OpenStreetMap) hosted on Cloudflare Pages (`*.pages.dev`) backed by Supabase Free (Postgres + Realtime + Anonymous Auth + `SECURITY DEFINER` RPCs/RLS). \$0 hosting budget.

## Users

A small friend group (<30 **Participants**) attending an annual winter 50K relay:
- **Runners** (ranging from first-time 5K runners to experienced distance runners) checking in before/after 5K **Legs**, checking their **Round** schedule, and tracking collective **Team** progress while moving outdoors in winter sunlight and cold.
- **Supporters** hanging out at **Basecamp**, cheering, coordinating **Supplies**, and following live progress.
- **Organizers** (host and co-hosts) managing **Event** logistics, mass-starting **Rounds**, tracking off-app chip-ins privately, and awarding playful **Badges**.

## Product Purpose

Make an informal, encouraging, non-competitive 50K winter relay effortless to organize and joyful to run together out of a single **Basecamp**. Success means nervous or first-time 5K runners feel genuinely welcome, gloved hands can start/finish a **Leg** in two seconds while moving in bright winter sun, and **Teams** celebrate reaching 50K together without speed-ranking pressure.

## Positioning

A zero-friction, friend-group relay companion where participation and collective 50K completion lead over competition: honor-system tap-your-name access (no accounts, passwords, or PINs), individual 5K times hidden by default unless opted in, fitness-app-optional check-ins, and offline-tolerant **Leg** logging built specifically for cold, outdoor, one-handed mobile use.

## Operating Context

- **Environment**: Early January winter outdoors — bright low-angle sun and snow glare during midday **Rounds**, dim/dusk light on **Round 1** (8:00 AM) and **Round 10** (5:00 PM), cold hands/gloves, and spotty cellular signal near the **Course**.
- **Ritual**: 10 independent hourly mass-start **Rounds** from a single **Basecamp**; **Teams** of 1–10 **Runners** cover 10 × 5K **Legs**; friends share **Supplies**, chip in off-app (Venmo/Zelle), and gather around a shared **Basecamp Dashboard** laptop/TV between **Rounds**.
- **Companion surfaces**: Mobile-first 4-tab web app (`Home`, `Teams`, `Race Day`, `Supplies`) plus an unlisted read-only `/dashboard/:token` **Basecamp Dashboard**.

## Capabilities and Constraints

- **Canonical terminology**: Strictly follow [`GLOSSARY.md`](./GLOSSARY.md) (**Event**, **Basecamp**, **Course**, **Participant**, **Runner**, **Supporter**, **Organizer**, **Team**, **Free Agent**, **Round**, **Leg**, **Badge**, **Supply**).
- **Full product & technical spec**: [`docs/SPEC.md`](./docs/SPEC.md) (13-table Postgres schema, `session_grants` RLS, offline IndexedDB `leg_mutation_queue`, 10 auto-calculated **Badges** + Organizer superlatives, opt-in **Speed Leaderboard**, **Event Recap** copy buttons).
- **Hard constraints**: \$0 budget, early January 2027 race date (6-week 2-phase rollout), zero direct fitness-app APIs/OAuth, zero live background GPS, zero Web Push in v1.

## Brand Commitments

- **Name**: Winter Grind 50K.
- **Tone**: Encouraging, warm-hearted, low-pressure, and friendly — never competitive, stress-inducing, or clinical.
- **Visual constraint (user-pinned)**: Clean, modern mobile interface that is effortless to read and operate while moving outdoors in bright winter sunlight, carrying a **subtle "cold" winter feeling** that is never heavy-handed, kitschy, or tacky (no cartoonish snowflakes/frost gimmicks).

## Evidence on Hand

- Canonical specification: [`docs/SPEC.md`](./docs/SPEC.md)
- Domain glossary: [`GLOSSARY.md`](./GLOSSARY.md)
- Structural/layout reference prototype: [`.scratch/frigid-feet-50k/prototypes/11-race-day-ui-prototype.html`](./.scratch/frigid-feet-50k/prototypes/11-race-day-ui-prototype.html) (throwaway layout prototype establishing Mobile Variant B timeline + sticky thumb action dock).
- Real Course `.gpx` files, actual Participant rosters, and 2027 Basecamp details are supplied by the Organizer at Event provisioning — never fabricate real-world friend names or testimonials as fact.

## Product Principles

1. **Glanceable in motion, operable in gloves**: Every race-day state and primary action must be legible in harsh sunlight at arm's length and tappable with cold, gloved thumbs.
2. **Encouragement over competition**: Collective distance, 10-Round completion, and playful **Badges** always outrank individual speed; times stay private unless explicitly opted in.
3. **Calm under chaos**: Over-60-minute runs never trigger red alarms; offline signal drops queue silently with clear, calm sync status; every check-in tap has an ~8-second Undo.
4. **Zero-friction inclusion**: No accounts, no Strava/watch requirement, and no pressure on chip-ins — walk-ins and first-time 5K runners get the exact same first-class experience.

## Accessibility & Inclusion

- High outdoor sunlight contrast (light-mode primary for daytime sun/snow glare, plus high-contrast dark mode for early morning Round 1 and dusk Round 10).
- Minimum 44px touch targets everywhere (48px+ primary Race-Day action CTA in the bottom thumb zone).
- Non-color-only state cues (always pair color with icons and explicit text labels).
- Accessible ~8-second Undo toast (`popover="manual"`).
