import type { Course, EventSnapshot, Leg, Participant } from '../../types/domain';
import {
  AUTO_BADGE_CATALOG,
  evaluateAutoBadges,
  resolveOrganizerBadgeAwards,
} from '../badges/autoBadges';
import { computeCollectiveStats } from '../home/EventInfoSection';
import { formatElapsedSeconds } from '../race-day/raceDayUtils';

export interface MyRunSummaryOptions {
  includeTimes?: boolean;
}

export function formatRecapDate(
  eventDate: string | null,
  startTime: string | null,
  timezone?: string | null,
): string | null {
  if (eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    const [year, month, day] = eventDate.split('-').map(Number);
    const utcMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(utcMidday);
  }

  if (startTime) {
    const date = new Date(startTime);
    if (!Number.isNaN(date.getTime())) {
      try {
        return new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          ...(timezone ? { timeZone: timezone } : {}),
        }).format(date);
      } catch {
        return new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }).format(date);
      }
    }
  }

  return null;
}

export function formatRecapKm(totalKm: number): string {
  const rounded = Math.round(totalKm * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} km` : `${rounded.toFixed(1)} km`;
}

function legDistanceKm(leg: Leg, courseById: Map<string, Course>): number {
  const distance = leg.courseId ? courseById.get(leg.courseId)?.distanceKm : undefined;
  return typeof distance === 'number' && Number.isFinite(distance) ? distance : 5.0;
}

/**
 * Formats a clean, emoji-friendly group chat Event Recap (for iMessage, WhatsApp, etc.).
 * Strictly celebrates collective distance, alphabetical Team 50K progress, and Badges —
 * never includes Team speed rankings or private individual times.
 */
export function formatEventRecapText(snapshot: EventSnapshot): string {
  const lines: string[] = [];
  const dateLabel = formatRecapDate(
    snapshot.event.eventDate,
    snapshot.event.startTime,
    snapshot.event.timezone,
  );

  lines.push(`❄️ ${snapshot.event.name} — Event Recap`);
  if (dateLabel) {
    lines.push(`📅 ${dateLabel}`);
  }

  const recapNote = snapshot.event.recapNote?.trim();
  if (recapNote) {
    lines.push('');
    lines.push(`💬 "${recapNote}"`);
  }

  const { completedLegsCount, totalKm } = computeCollectiveStats(snapshot.legs, snapshot.courses);
  lines.push('');
  lines.push(
    `🏃 Collective Distance: ${formatRecapKm(totalKm)} (${completedLegsCount} completed ${
      completedLegsCount === 1 ? 'Leg' : 'Legs'
    })`,
  );

  const sortedTeams = [...snapshot.teams].sort((a, b) => a.name.localeCompare(b.name));
  if (sortedTeams.length > 0) {
    lines.push('');
    lines.push('Teams (50K Progress):');
    for (const team of sortedTeams) {
      const completedCount = snapshot.legs.filter(
        (leg) => leg.teamId === team.id && leg.status === 'completed',
      ).length;
      const kmDone = completedCount * 5;
      const emojiPrefix = team.emoji ? `${team.emoji} ` : '';
      if (completedCount >= 10) {
        lines.push(
          `🏁 ${emojiPrefix}${team.name} — ${kmDone} / 50 km (${completedCount}/10 Legs · 50K Finisher!)`,
        );
      } else {
        lines.push(`• ${emojiPrefix}${team.name} — ${kmDone} / 50 km (${completedCount}/10 Legs)`);
      }
    }
  }

  const organizerAwards = resolveOrganizerBadgeAwards(snapshot);
  if (organizerAwards.length > 0) {
    lines.push('');
    lines.push('Organizer Superlatives:');
    for (const item of organizerAwards) {
      const recipientPrefix = item.recipientEmoji ? `${item.recipientEmoji} ` : '';
      const noteSuffix = item.award.note?.trim() ? ` — "${item.award.note.trim()}"` : '';
      lines.push(
        `${item.definition.emoji} ${item.definition.name}: ${recipientPrefix}${item.recipientName}${noteSuffix}`,
      );
    }
  }

  const autoBadges = evaluateAutoBadges(snapshot);
  const badgeLines: string[] = [];

  for (const def of AUTO_BADGE_CATALOG) {
    if (def.scope === 'team') {
      const earners = autoBadges.teamBadges
        .filter((item) => item.badge.id === def.id)
        .map((item) => (item.teamEmoji ? `${item.teamEmoji} ${item.teamName}` : item.teamName));
      if (earners.length > 0) {
        badgeLines.push(`${def.emoji} ${def.name}: ${earners.join(', ')}`);
      }
    } else {
      const earners = autoBadges.participantBadges
        .filter((item) => item.badge.id === def.id)
        .map((item) => item.participantName);
      if (earners.length > 0) {
        badgeLines.push(`${def.emoji} ${def.name}: ${earners.join(', ')}`);
      }
    }
  }

  if (badgeLines.length > 0) {
    lines.push('');
    lines.push('Badges Unlocked:');
    lines.push(...badgeLines);
  }

  return lines.join('\n');
}

/**
 * Formats a neutral, inclusive personal summary ("Great for Strava or group chat")
 * for the active Participant.
 *
 * Privacy guarantee:
 * - Individual times are omitted unless `options.includeTimes` is true or the Participant
 *   opted in (`showTimesOnLeaderboard === true`) AND recorded >=1 timed completed Leg.
 * - Never includes any other Participant's individual times.
 * - Handles Supporters and Runners with 0, 1, or multiple completed Legs gracefully.
 */
export function formatMyRunSummaryText(
  snapshot: EventSnapshot,
  participant: Participant | null,
  options?: MyRunSummaryOptions,
): string {
  if (!participant) {
    return formatEventRecapText(snapshot);
  }

  const lines: string[] = [];
  const dateLabel = formatRecapDate(
    snapshot.event.eventDate,
    snapshot.event.startTime,
    snapshot.event.timezone,
  );
  const courseById = new Map<string, Course>(snapshot.courses.map((c) => [c.id, c]));
  const team = participant.teamId
    ? (snapshot.teams.find((t) => t.id === participant.teamId) ?? null)
    : null;

  const myCompletedLegs = snapshot.legs
    .filter((leg) => leg.runnerId === participant.id && leg.status === 'completed')
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const autoBadges = evaluateAutoBadges(snapshot);
  const organizerAwards = resolveOrganizerBadgeAwards(snapshot);

  const myBadgeLabels: string[] = [];
  for (const badge of autoBadges.byParticipantId[participant.id] ?? []) {
    myBadgeLabels.push(`${badge.emoji} ${badge.name}`);
  }
  if (team) {
    for (const badge of autoBadges.byTeamId[team.id] ?? []) {
      myBadgeLabels.push(`${badge.emoji} ${badge.name} (Team)`);
    }
  }
  for (const item of organizerAwards) {
    const isPersonal =
      item.recipientType === 'participant' && item.recipientId === participant.id;
    const isTeamAward =
      item.recipientType === 'team' && team !== null && item.recipientId === team.id;
    if (isPersonal || isTeamAward) {
      myBadgeLabels.push(`${item.definition.emoji} ${item.definition.name}`);
    }
  }

  lines.push(`❄️ ${snapshot.event.name}`);
  if (dateLabel) {
    lines.push(`📅 ${dateLabel}`);
  }

  const isSupporterWithoutLegs =
    participant.rsvpStatus === 'going_supporter' && myCompletedLegs.length === 0;

  if (isSupporterWithoutLegs) {
    lines.push(`📣 ${participant.displayName} — Basecamp Supporter`);

    const { totalKm, completedLegsCount } = computeCollectiveStats(snapshot.legs, snapshot.courses);
    lines.push(
      `🤝 Event Total: ${formatRecapKm(totalKm)} together (${completedLegsCount} ${
        completedLegsCount === 1 ? 'Leg' : 'Legs'
      })`,
    );

    const supplyNames = new Set<string>();
    const supplyById = new Map(snapshot.supplyItems.map((s) => [s.id, s]));
    for (const claim of snapshot.supplyClaims) {
      if (claim.participantId === participant.id) {
        const item = supplyById.get(claim.supplyItemId);
        if (item) supplyNames.add(item.name);
      }
    }
    for (const item of snapshot.supplyItems) {
      if (!item.isWishlist && item.createdByParticipantId === participant.id) {
        supplyNames.add(item.name);
      }
    }
    if (supplyNames.size > 0) {
      lines.push(`🧤 Basecamp Supplies: ${Array.from(supplyNames).join(', ')}`);
    }
  } else {
    lines.push(`🏃 ${participant.displayName}`);
    if (team) {
      lines.push(`Team: ${team.emoji ? `${team.emoji} ` : ''}${team.name}`);
    }

    if (myCompletedLegs.length === 0) {
      lines.push('Completed: 0 Legs (0 km) — cheered from Basecamp!');
    } else {
      const myTotalKm = myCompletedLegs.reduce(
        (sum, leg) => sum + legDistanceKm(leg, courseById),
        0,
      );
      const roundNumbers = myCompletedLegs.map((leg) => leg.roundNumber);
      const roundsText =
        roundNumbers.length === 1
          ? `Round ${roundNumbers[0]}`
          : `Rounds ${roundNumbers.join(', ')}`;
      lines.push(
        `Completed: ${myCompletedLegs.length} ${
          myCompletedLegs.length === 1 ? 'Leg' : 'Legs'
        } (${formatRecapKm(myTotalKm)}) · ${roundsText}`,
      );

      const distinctCourses: string[] = [];
      for (const leg of myCompletedLegs) {
        if (!leg.courseId) continue;
        const courseName = courseById.get(leg.courseId)?.name;
        if (courseName && !distinctCourses.includes(courseName)) {
          distinctCourses.push(courseName);
        }
      }
      if (distinctCourses.length > 0) {
        lines.push(`Courses: ${distinctCourses.join(', ')}`);
      }

      const timedLegs = myCompletedLegs.filter(
        (leg): leg is Leg & { durationSeconds: number } =>
          leg.durationSeconds !== null &&
          Number.isFinite(leg.durationSeconds) &&
          leg.durationSeconds > 0,
      );

      const shouldIncludeTimes =
        (options?.includeTimes ?? participant.showTimesOnLeaderboard) && timedLegs.length > 0;

      if (shouldIncludeTimes) {
        if (timedLegs.length === 1) {
          lines.push(`5K Time: ${formatElapsedSeconds(timedLegs[0]!.durationSeconds)}`);
        } else {
          const fastest = Math.min(...timedLegs.map((l) => l.durationSeconds));
          const average = Math.round(
            timedLegs.reduce((sum, l) => sum + l.durationSeconds, 0) / timedLegs.length,
          );
          lines.push(
            `Fastest 5K: ${formatElapsedSeconds(fastest)} · Avg 5K: ${formatElapsedSeconds(average)} (${timedLegs.length} timed Legs)`,
          );
        }
      }
    }
  }

  if (myBadgeLabels.length > 0) {
    lines.push(`Badges: ${myBadgeLabels.join(' · ')}`);
  }

  return lines.join('\n');
}
