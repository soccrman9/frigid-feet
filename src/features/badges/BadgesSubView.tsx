import { useMemo } from 'react';
import { Award, ChevronDown, Medal, Sparkles, User, Users } from 'lucide-react';
import { useEventData } from '../../state/EventDataContext';
import {
  AUTO_BADGE_CATALOG,
  evaluateAutoBadges,
  resolveOrganizerBadgeAwards,
  type AutoBadgeDefinition,
  type EarnedParticipantBadge,
  type EarnedTeamBadge,
} from './autoBadges';

const TEAM_AUTO_BADGES = AUTO_BADGE_CATALOG.filter((b) => b.scope === 'team');
const PARTICIPANT_AUTO_BADGES = AUTO_BADGE_CATALOG.filter((b) => b.scope === 'participant');

export function BadgesSubView() {
  const { snapshot, activeParticipant } = useEventData();

  const autoBadges = useMemo(() => evaluateAutoBadges(snapshot), [snapshot]);
  const organizerAwards = useMemo(() => resolveOrganizerBadgeAwards(snapshot), [snapshot]);

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

  const myPersonalBadges: AutoBadgeDefinition[] = activeParticipant
    ? (autoBadges.byParticipantId[activeParticipant.id] ?? [])
    : [];
  const myTeamBadges: AutoBadgeDefinition[] = activeParticipant?.teamId
    ? (autoBadges.byTeamId[activeParticipant.teamId] ?? [])
    : [];
  const myOrganizerAwards = activeParticipant
    ? organizerAwards.filter(
        (item) =>
          (item.recipientType === 'participant' && item.recipientId === activeParticipant.id) ||
          (item.recipientType === 'team' &&
            activeParticipant.teamId !== null &&
            item.recipientId === activeParticipant.teamId),
      )
    : [];

  const myTotalBadges =
    myPersonalBadges.length + myTeamBadges.length + myOrganizerAwards.length;

  return (
    <section aria-label="Badges Showcase" className="flex flex-col gap-3">
      {/* Live telemetry summary strip */}
      <div
        className="rounded-[6px] border-[1.5px] p-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Medal size={18} style={{ color: 'var(--accent-amber-ink)' }} aria-hidden="true" />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--ink-primary)' }}>
              Badges & Superlatives
            </h2>
          </div>
          <span
            className="font-telemetry rounded px-2 py-0.5 text-xs font-bold"
            style={{
              backgroundColor: 'var(--bg-rail-subtle)',
              color: 'var(--ink-secondary)',
              border: '1px solid var(--border-structural)',
            }}
          >
            Live
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <div
            className="rounded-[5px] border px-2.5 py-2 text-center"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-hairline)',
            }}
          >
            <div
              className="font-telemetry text-lg font-bold"
              style={{ color: 'var(--ink-primary)' }}
            >
              {organizerAwards.length}
            </div>
            <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--ink-secondary)' }}>
              Superlatives
            </div>
          </div>
          <div
            className="rounded-[5px] border px-2.5 py-2 text-center"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-hairline)',
            }}
          >
            <div
              className="font-telemetry text-lg font-bold"
              style={{ color: 'var(--accent-spruce)' }}
            >
              {autoBadges.teamBadges.length}
            </div>
            <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--ink-secondary)' }}>
              Team
            </div>
          </div>
          <div
            className="rounded-[5px] border px-2.5 py-2 text-center"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-hairline)',
            }}
          >
            <div
              className="font-telemetry text-lg font-bold"
              style={{ color: 'var(--accent-amber-ink)' }}
            >
              {autoBadges.participantBadges.length}
            </div>
            <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--ink-secondary)' }}>
              Participant
            </div>
          </div>
        </div>

        {activeParticipant && myTotalBadges > 0 && (
          <div
            className="mt-2.5 rounded-[5px] border px-2.5 py-2"
            style={{
              backgroundColor: 'var(--accent-spruce-soft)',
              borderColor: 'var(--accent-spruce)',
            }}
          >
            <div
              className="flex items-center gap-1.5 text-xs font-bold"
              style={{ color: 'var(--accent-spruce)' }}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span>
                Unlocked for {activeParticipant.displayName} ({myTotalBadges})
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {myPersonalBadges.map((b) => (
                <span
                  key={`me-${b.id}`}
                  className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-structural)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  <span aria-hidden="true">{b.emoji}</span>
                  <span>{b.name}</span>
                </span>
              ))}
              {myTeamBadges.map((b) => (
                <span
                  key={`my-team-${b.id}`}
                  className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-structural)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  <span aria-hidden="true">{b.emoji}</span>
                  <span>{b.name} (Team)</span>
                </span>
              ))}
              {myOrganizerAwards.map((item) => (
                <span
                  key={`my-org-${item.award.id}`}
                  className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
                  style={{
                    backgroundColor: 'var(--accent-amber-soft)',
                    borderColor: 'var(--accent-amber)',
                    color: 'var(--accent-amber-ink)',
                  }}
                >
                  <span aria-hidden="true">{item.definition.emoji}</span>
                  <span>{item.definition.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 1. Organizer Superlatives */}
      <section aria-label="Organizer Superlatives" className="flex flex-col">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h3
            className="text-xs font-bold tracking-[0.05em] uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Organizer Superlatives
          </h3>
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
            <div className="flex items-start gap-2.5 px-3.5 py-3.5">
              <Award
                size={18}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--accent-amber-ink)' }}
                aria-hidden="true"
              />
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                No Organizer superlatives awarded yet — Organizers can hand out playful awards
                anytime during or after the Event.
              </p>
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {organizerAwards.map((item, idx) => {
                const isSelf =
                  (item.recipientType === 'participant' &&
                    activeParticipant?.id === item.recipientId) ||
                  (item.recipientType === 'team' &&
                    activeParticipant?.teamId !== null &&
                    activeParticipant?.teamId === item.recipientId);

                return (
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
                              backgroundColor:
                                item.recipientType === 'team'
                                  ? 'var(--bg-rail-subtle)'
                                  : 'var(--accent-amber-soft)',
                              borderColor:
                                item.recipientType === 'team'
                                  ? 'var(--border-structural)'
                                  : 'var(--accent-amber)',
                              color:
                                item.recipientType === 'team'
                                  ? 'var(--ink-secondary)'
                                  : 'var(--accent-amber-ink)',
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
                          {isSelf && (
                            <span
                              className="ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold"
                              style={{
                                backgroundColor: 'var(--accent-spruce-soft)',
                                color: 'var(--accent-spruce)',
                              }}
                            >
                              {item.recipientType === 'team' ? 'Your Team' : 'You'}
                            </span>
                          )}
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
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* 2. Team Milestones (3 auto-calculated Team Badges) */}
      <section aria-label="Team Milestones" className="flex flex-col">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h3
            className="text-xs font-bold tracking-[0.05em] uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Team Milestones
          </h3>
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
            <p className="px-3.5 py-3.5 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              No Team Badges unlocked yet — finish 5 Legs for <strong>Halfway There</strong>, get
              every teammate through a Leg for <strong>Full Squad</strong>, and reach 10 of 10 Legs
              for <strong>50K Finisher</strong>!
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
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                          {badge.name}
                        </span>
                        <span
                          className="font-telemetry text-xs font-bold"
                          style={{ color: 'var(--accent-spruce)' }}
                        >
                          {earners.length} {earners.length === 1 ? 'Team' : 'Teams'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                        {badge.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {earners.map((earner) => {
                          const isOwnTeam = activeParticipant?.teamId === earner.teamId;
                          return (
                            <span
                              key={`${badge.id}-${earner.teamId}`}
                              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
                              style={{
                                backgroundColor: isOwnTeam
                                  ? 'var(--accent-spruce-soft)'
                                  : 'var(--bg-rail-subtle)',
                                borderColor: isOwnTeam
                                  ? 'var(--accent-spruce)'
                                  : 'var(--border-structural)',
                                color: isOwnTeam ? 'var(--accent-spruce)' : 'var(--ink-primary)',
                              }}
                            >
                              {earner.teamEmoji ? (
                                <span aria-hidden="true">{earner.teamEmoji}</span>
                              ) : null}
                              <span>{earner.teamName}</span>
                              {isOwnTeam && <span>(Your Team)</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 3. Participant Badges (7 auto-calculated Participant Badges) */}
      <section aria-label="Participant Badges" className="flex flex-col">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h3
            className="text-xs font-bold tracking-[0.05em] uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Participant Badges
          </h3>
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
            <p className="px-3.5 py-3.5 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              No Participant Badges unlocked yet — complete a 5K Leg or claim or volunteer a
              Basecamp Supply to unlock the first Badge!
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
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                          {badge.name}
                        </span>
                        <span
                          className="font-telemetry text-xs font-bold"
                          style={{ color: 'var(--ink-secondary)' }}
                        >
                          {earners.length}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                        {badge.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {earners.map((earner) => {
                          const isMe = activeParticipant?.id === earner.participantId;
                          return (
                            <span
                              key={`${badge.id}-${earner.participantId}`}
                              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
                              style={{
                                backgroundColor: isMe
                                  ? 'var(--accent-spruce-soft)'
                                  : 'var(--bg-rail-subtle)',
                                borderColor: isMe
                                  ? 'var(--accent-spruce)'
                                  : 'var(--border-structural)',
                                color: isMe ? 'var(--accent-spruce)' : 'var(--ink-primary)',
                              }}
                            >
                              <span>{earner.participantName}</span>
                              {isMe && <span>(You)</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Collapsible field guide of all 10 live auto-Badges */}
      <details
        className="overflow-hidden rounded-[6px] border"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
      >
        <summary
          className="pfl-focus-ring flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-bold tracking-wider uppercase"
          style={{ color: 'var(--ink-secondary)' }}
        >
          <span>All 10 Live Auto-Badges Guide</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <ul
          className="m-0 list-none divide-y border-t p-0"
          style={{
            borderColor: 'var(--border-hairline)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          {AUTO_BADGE_CATALOG.map((badge) => (
            <li
              key={`guide-${badge.id}`}
              className="flex items-start gap-2.5 px-3 py-2"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <span className="text-base leading-none" aria-hidden="true">
                {badge.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                    {badge.name}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      backgroundColor: 'var(--bg-rail-subtle)',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    {badge.scope === 'team' ? 'Team' : 'Participant'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                  {badge.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
