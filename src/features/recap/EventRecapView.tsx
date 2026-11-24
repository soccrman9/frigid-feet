import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  CalendarDays,
  Check,
  Copy,
  Flag,
  Footprints,
  MessageSquareQuote,
  Share2,
  User,
  Users,
} from 'lucide-react';
import { useEventData } from '../../state/EventDataContext';
import {
  AUTO_BADGE_CATALOG,
  evaluateAutoBadges,
  resolveOrganizerBadgeAwards,
  type EarnedParticipantBadge,
  type EarnedTeamBadge,
} from '../badges/autoBadges';
import { computeCollectiveStats } from '../home/EventInfoSection';
import { TeamProgressList } from '../race-day/TeamProgressList';
import {
  formatEventRecapText,
  formatMyRunSummaryText,
  formatRecapDate,
  formatRecapKm,
} from './recapFormatters';

export interface EventRecapViewProps {
  onBack?: () => void;
  backLabel?: string;
}

type CopyKind = 'event' | 'my-run';

const TEAM_AUTO_BADGES = AUTO_BADGE_CATALOG.filter((b) => b.scope === 'team');
const PARTICIPANT_AUTO_BADGES = AUTO_BADGE_CATALOG.filter((b) => b.scope === 'participant');

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('Clipboard API unavailable');
}

export function EventRecapView({ onBack, backLabel = 'Back' }: EventRecapViewProps = {}) {
  const { snapshot, activeParticipant } = useEventData();
  const [copiedKind, setCopiedKind] = useState<CopyKind | null>(null);
  const [copyStatusMessage, setCopyStatusMessage] = useState<string | null>(null);
  const [includeMyTimes, setIncludeMyTimes] = useState<boolean>(
    Boolean(activeParticipant?.showTimesOnLeaderboard),
  );
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setIncludeMyTimes(Boolean(activeParticipant?.showTimesOnLeaderboard));
  }, [activeParticipant?.id, activeParticipant?.showTimesOnLeaderboard]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const { completedLegsCount, totalKm } = useMemo(
    () => computeCollectiveStats(snapshot.legs, snapshot.courses),
    [snapshot.legs, snapshot.courses],
  );

  const dateLabel = useMemo(
    () =>
      formatRecapDate(
        snapshot.event.eventDate,
        snapshot.event.startTime,
        snapshot.event.timezone,
      ),
    [snapshot.event.eventDate, snapshot.event.startTime, snapshot.event.timezone],
  );

  const autoBadges = useMemo(() => evaluateAutoBadges(snapshot), [snapshot]);
  const organizerAwards = useMemo(() => resolveOrganizerBadgeAwards(snapshot), [snapshot]);

  const fiftyKFinisherTeams = useMemo(() => {
    const sortedTeams = [...snapshot.teams].sort((a, b) => a.name.localeCompare(b.name));
    return sortedTeams.filter((team) => {
      const completed = snapshot.legs.filter(
        (leg) => leg.teamId === team.id && leg.status === 'completed',
      ).length;
      return completed >= 10;
    });
  }, [snapshot.teams, snapshot.legs]);

  const myTimedLegsCount = useMemo(() => {
    if (!activeParticipant) return 0;
    return snapshot.legs.filter(
      (leg) =>
        leg.runnerId === activeParticipant.id &&
        leg.status === 'completed' &&
        leg.durationSeconds !== null &&
        leg.durationSeconds > 0,
    ).length;
  }, [activeParticipant, snapshot.legs]);

  const earnedTeamGroups = useMemo(() => {
    const byBadgeId = new Map<string, EarnedTeamBadge[]>();
    for (const item of autoBadges.teamBadges) {
      const list = byBadgeId.get(item.badge.id) ?? [];
      list.push(item);
      byBadgeId.set(item.badge.id, list);
    }
    return TEAM_AUTO_BADGES.map((badge) => ({
      badge,
      earners: byBadgeId.get(badge.id) ?? [],
    })).filter((group) => group.earners.length > 0);
  }, [autoBadges.teamBadges]);

  const earnedParticipantGroups = useMemo(() => {
    const byBadgeId = new Map<string, EarnedParticipantBadge[]>();
    for (const item of autoBadges.participantBadges) {
      const list = byBadgeId.get(item.badge.id) ?? [];
      list.push(item);
      byBadgeId.set(item.badge.id, list);
    }
    return PARTICIPANT_AUTO_BADGES.map((badge) => ({
      badge,
      earners: byBadgeId.get(badge.id) ?? [],
    })).filter((group) => group.earners.length > 0);
  }, [autoBadges.participantBadges]);

  const recapNote = snapshot.event.recapNote?.trim() || null;

  async function handleCopy(kind: CopyKind) {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    const payload =
      kind === 'event'
        ? formatEventRecapText(snapshot)
        : formatMyRunSummaryText(snapshot, activeParticipant, { includeTimes: includeMyTimes });

    try {
      await copyTextToClipboard(payload);
      setCopiedKind(kind);
      setCopyStatusMessage(
        kind === 'event'
          ? 'Event Recap copied — ready to paste into your group chat!'
          : 'My Run Summary copied — ready for Strava or group chat!',
      );
      resetTimerRef.current = window.setTimeout(() => {
        setCopiedKind((current) => (current === kind ? null : current));
        setCopyStatusMessage(null);
      }, 3000);
    } catch {
      setCopiedKind(null);
      setCopyStatusMessage('Could not access clipboard automatically — please try again.');
    }
  }

  return (
    <section
      aria-label="Event Recap"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 pb-8"
    >
      {/* Top navigation & Event heading */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award size={20} style={{ color: 'var(--accent-spruce)' }} aria-hidden="true" />
          <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
            Event Recap
          </h1>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-bold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{backLabel}</span>
          </button>
        )}
      </div>

      {/* Celebratory collective distance hero */}
      <div
        className="overflow-hidden rounded-[6px] border-[1.5px] p-4"
        style={{
          backgroundColor: 'var(--shell-dock)',
          borderColor: 'var(--shell-header-border)',
          color: 'var(--ink-on-shell)',
        }}
      >
        <p
          className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
          style={{ color: 'var(--accent-glacier)' }}
        >
          <Footprints size={14} strokeWidth={2.25} aria-hidden="true" />
          <span>{snapshot.event.name}</span>
        </p>

        {dateLabel && (
          <p
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: 'var(--ink-on-shell-muted)' }}
          >
            <CalendarDays size={13} aria-hidden="true" />
            <span>{dateLabel}</span>
          </p>
        )}

        <p
          className="font-telemetry mt-3 text-3xl font-bold tracking-tight"
          style={{ color: 'var(--ink-on-shell)' }}
        >
          {formatRecapKm(totalKm)} run together
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div
            className="rounded-[5px] border px-2.5 py-2 text-center"
            style={{
              backgroundColor: 'var(--shell-header)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div className="font-telemetry text-lg font-bold" style={{ color: 'var(--ink-on-shell)' }}>
              {completedLegsCount}
            </div>
            <div
              className="text-[11px] font-bold uppercase"
              style={{ color: 'var(--ink-on-shell-muted)' }}
            >
              5K Legs
            </div>
          </div>

          <div
            className="rounded-[5px] border px-2.5 py-2 text-center"
            style={{
              backgroundColor: 'var(--shell-header)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div
              className="font-telemetry text-lg font-bold"
              style={{ color: 'var(--accent-glacier)' }}
            >
              {fiftyKFinisherTeams.length} / {snapshot.teams.length}
            </div>
            <div
              className="text-[11px] font-bold uppercase"
              style={{ color: 'var(--ink-on-shell-muted)' }}
            >
              50K Teams
            </div>
          </div>

          <div
            className="rounded-[5px] border px-2.5 py-2 text-center"
            style={{
              backgroundColor: 'var(--shell-header)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div className="font-telemetry text-lg font-bold" style={{ color: 'var(--ink-on-shell)' }}>
              {autoBadges.teamBadges.length +
                autoBadges.participantBadges.length +
                organizerAwards.length}
            </div>
            <div
              className="text-[11px] font-bold uppercase"
              style={{ color: 'var(--ink-on-shell-muted)' }}
            >
              Badges
            </div>
          </div>
        </div>
      </div>

      {/* Optional Organizer Recap Note */}
      {recapNote && (
        <section
          aria-label="Organizer Recap Note"
          className="rounded-[6px] border-[1.5px] p-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--accent-spruce)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <MessageSquareQuote
              size={16}
              style={{ color: 'var(--accent-spruce)' }}
              aria-hidden="true"
            />
            <h2
              className="text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--accent-spruce)' }}
            >
              Organizer&apos;s Note
            </h2>
          </div>
          <p
            className="mt-2 text-sm leading-relaxed whitespace-pre-line"
            style={{ color: 'var(--ink-primary)' }}
          >
            {recapNote}
          </p>
        </section>
      )}

      {/* One-tap Copy Summaries */}
      <section
        aria-label="Share Summaries"
        className="rounded-[6px] border-[1.5px] p-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <Share2 size={16} style={{ color: 'var(--ink-secondary)' }} aria-hidden="true" />
          <h2
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            One-Tap Copy Summaries
          </h2>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {/* Copy Event Recap */}
          <div>
            <button
              type="button"
              onClick={() => void handleCopy('event')}
              className="pfl-focus-ring flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-[6px] border-0 px-4 py-2.5 text-[15px] font-bold transition-opacity hover:opacity-95"
              style={
                copiedKind === 'event'
                  ? {
                      backgroundColor: 'var(--accent-spruce)',
                      color: '#FFFFFF',
                    }
                  : {
                      backgroundColor: 'var(--shell-header)',
                      color: 'var(--ink-on-shell)',
                    }
              }
            >
              {copiedKind === 'event' ? (
                <>
                  <Check size={18} strokeWidth={2.5} aria-hidden="true" />
                  <span>Copied Event Recap!</span>
                </>
              ) : (
                <>
                  <Copy size={17} strokeWidth={2.25} aria-hidden="true" />
                  <span>Copy Event Recap</span>
                </>
              )}
            </button>
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Formatted for iMessage or WhatsApp group chats (collective distance, Teams &amp; Badges).
            </p>
          </div>

          {/* Copy My Run Summary */}
          <div
            className="border-t pt-3"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <button
              type="button"
              onClick={() => void handleCopy('my-run')}
              className="pfl-focus-ring flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-[6px] border-[1.5px] px-4 py-2.5 text-[15px] font-bold transition-colors"
              style={
                copiedKind === 'my-run'
                  ? {
                      backgroundColor: 'var(--accent-spruce-soft)',
                      borderColor: 'var(--accent-spruce)',
                      color: 'var(--accent-spruce)',
                    }
                  : {
                      backgroundColor: 'var(--bg-rail-subtle)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--ink-primary)',
                    }
              }
            >
              {copiedKind === 'my-run' ? (
                <>
                  <Check size={18} strokeWidth={2.5} aria-hidden="true" />
                  <span>Copied My Run Summary!</span>
                </>
              ) : (
                <>
                  <Copy size={17} strokeWidth={2.25} aria-hidden="true" />
                  <span>Copy My Run Summary</span>
                </>
              )}
            </button>
            <p className="mt-1 text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
              Great for Strava or group chat — summarizes your completed Legs, Team, Courses, and
              earned Badges.
            </p>

            {activeParticipant && myTimedLegsCount > 0 && (
              <label
                className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[5px] border px-3 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--bg-ground)',
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--ink-primary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={includeMyTimes}
                  onChange={(e) => {
                    setIncludeMyTimes(e.target.checked);
                    if (copiedKind === 'my-run') {
                      setCopiedKind(null);
                      setCopyStatusMessage(null);
                    }
                  }}
                  className="h-4 w-4 cursor-pointer"
                />
                <span>
                  Include my own 5K {myTimedLegsCount === 1 ? 'time' : 'times'} in this summary
                  (optional)
                </span>
              </label>
            )}
          </div>
        </div>

        {copyStatusMessage && (
          <p
            role="status"
            aria-live="polite"
            className="mt-3 rounded-[5px] border px-3 py-2 text-xs font-bold"
            style={
              copiedKind !== null
                ? {
                    backgroundColor: 'var(--accent-spruce-soft)',
                    borderColor: 'var(--accent-spruce)',
                    color: 'var(--accent-spruce)',
                  }
                : {
                    backgroundColor: 'var(--bg-rail-subtle)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  }
            }
          >
            {copyStatusMessage}
          </p>
        )}
      </section>

      {/* 50K Finisher highlight + Alphabetical Team 50K Progress */}
      <div className="flex flex-col gap-2">
        {fiftyKFinisherTeams.length > 0 && (
          <div
            className="flex items-start gap-2 rounded-[6px] border px-3 py-2.5 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--accent-spruce-soft)',
              borderColor: 'var(--accent-spruce)',
              color: 'var(--accent-spruce)',
            }}
          >
            <Flag size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>50K Finishers:</strong>{' '}
              {fiftyKFinisherTeams
                .map((team) => `${team.emoji ? `${team.emoji} ` : ''}${team.name}`)
                .join(', ')}
            </span>
          </div>
        )}
        <TeamProgressList teams={snapshot.teams} legs={snapshot.legs} />
      </div>

      {/* Full Badge & Superlative Showcase */}
      <section aria-label="Recap Badges Showcase" className="flex flex-col gap-3">
        {/* 1. Organizer Superlatives */}
        <div className="flex flex-col">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h2
              className="text-xs font-bold tracking-[0.05em] uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Organizer Superlatives
            </h2>
            <span className="font-telemetry text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
              {organizerAwards.length} awarded
            </span>
          </div>

          <div
            className="overflow-hidden rounded-[6px] border-[1.5px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            {organizerAwards.length === 0 ? (
              <p className="px-3.5 py-3 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                No Organizer superlatives awarded yet.
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {organizerAwards.map((item, idx) => (
                  <li
                    key={item.award.id}
                    className="px-3 py-2.5"
                    style={
                      idx < organizerAwards.length - 1
                        ? { borderBottom: '1px solid var(--border-hairline)' }
                        : undefined
                    }
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-xl leading-none" aria-hidden="true">
                        {item.definition.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                            {item.definition.name}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold"
                            style={{
                              backgroundColor: 'var(--bg-rail-subtle)',
                              borderColor: 'var(--border-structural)',
                              color: 'var(--ink-secondary)',
                            }}
                          >
                            {item.recipientType === 'team' ? (
                              <Users size={11} aria-hidden="true" />
                            ) : (
                              <User size={11} aria-hidden="true" />
                            )}
                            <span>{item.recipientType === 'team' ? 'Team' : 'Participant'}</span>
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                          {item.recipientEmoji ? `${item.recipientEmoji} ` : ''}
                          {item.recipientName}
                        </p>
                        {item.award.note && (
                          <p
                            className="mt-1 text-xs leading-relaxed"
                            style={{ color: 'var(--ink-secondary)' }}
                          >
                            “{item.award.note}”
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 2. Team Milestones */}
        <div className="flex flex-col">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h2
              className="text-xs font-bold tracking-[0.05em] uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Team Milestones
            </h2>
            <span className="font-telemetry text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
              {autoBadges.teamBadges.length} unlocked
            </span>
          </div>

          <div
            className="overflow-hidden rounded-[6px] border-[1.5px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            {earnedTeamGroups.length === 0 ? (
              <p className="px-3.5 py-3 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                No Team Milestones unlocked yet — Teams earn Badges at 25K, Full Squad, and 50K!
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {earnedTeamGroups.map(({ badge, earners }, idx) => (
                  <li
                    key={badge.id}
                    className="px-3 py-2.5"
                    style={
                      idx < earnedTeamGroups.length - 1
                        ? { borderBottom: '1px solid var(--border-hairline)' }
                        : undefined
                    }
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-xl leading-none" aria-hidden="true">
                        {badge.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                          {badge.name}
                        </span>
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                          {badge.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {earners.map((earner) => (
                            <span
                              key={`${badge.id}-${earner.teamId}`}
                              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
                              style={{
                                backgroundColor: 'var(--bg-rail-subtle)',
                                borderColor: 'var(--border-structural)',
                                color: 'var(--ink-primary)',
                              }}
                            >
                              {earner.teamEmoji ? <span aria-hidden="true">{earner.teamEmoji}</span> : null}
                              <span>{earner.teamName}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 3. Participant Badges */}
        <div className="flex flex-col">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h2
              className="text-xs font-bold tracking-[0.05em] uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Participant Badges
            </h2>
            <span className="font-telemetry text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
              {autoBadges.participantBadges.length} unlocked
            </span>
          </div>

          <div
            className="overflow-hidden rounded-[6px] border-[1.5px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            {earnedParticipantGroups.length === 0 ? (
              <p className="px-3.5 py-3 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                No Participant Badges unlocked yet.
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {earnedParticipantGroups.map(({ badge, earners }, idx) => (
                  <li
                    key={badge.id}
                    className="px-3 py-2.5"
                    style={
                      idx < earnedParticipantGroups.length - 1
                        ? { borderBottom: '1px solid var(--border-hairline)' }
                        : undefined
                    }
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-xl leading-none" aria-hidden="true">
                        {badge.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                          {badge.name}
                        </span>
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                          {badge.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {earners.map((earner) => (
                            <span
                              key={`${badge.id}-${earner.participantId}`}
                              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
                              style={{
                                backgroundColor: 'var(--bg-rail-subtle)',
                                borderColor: 'var(--border-structural)',
                                color: 'var(--ink-primary)',
                              }}
                            >
                              <span>{earner.participantName}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
