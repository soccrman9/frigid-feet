import { useState } from 'react';
import { Clock, Footprints, Sparkles, UserPlus } from 'lucide-react';
import type { Participant, Team } from '../../types/domain';
import { formatRoundWindow } from './teamScheduleWarnings';

interface FreeAgentsListProps {
  freeAgents: readonly Participant[];
  activeParticipantId: string | null;
  teams: readonly Team[];
  isOrganizer: boolean;
  isOnline: boolean;
  busy: boolean;
  onOrganizerAssignToTeam: (participantId: string, teamId: string) => void;
}

export function FreeAgentsList({
  freeAgents,
  activeParticipantId,
  teams,
  isOrganizer,
  isOnline,
  busy,
  onOrganizerAssignToTeam,
}: FreeAgentsListProps) {
  const [selectedTeamByParticipant, setSelectedTeamByParticipant] = useState<
    Record<string, string>
  >({});

  return (
    <section
      aria-labelledby="free-agents-heading"
      className="rounded-md border-[1.5px] p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p
            className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <Footprints size={14} strokeWidth={2.3} aria-hidden="true" />
            <span>Unmatched Runners</span>
          </p>
          <h2
            id="free-agents-heading"
            className="mt-0.5 text-lg font-bold"
            style={{ color: 'var(--ink-primary)' }}
          >
            Free Agents
          </h2>
        </div>
        <span
          className="inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold tabular-nums"
          style={{
            backgroundColor: 'var(--bg-rail)',
            borderColor: 'var(--border-strong)',
            color: 'var(--ink-primary)',
          }}
        >
          {freeAgents.length} {freeAgents.length === 1 ? 'Runner' : 'Runners'}
        </span>
      </div>

      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
        Runners RSVP&apos;d as Going (Runner) who haven&apos;t joined a Team yet. Pair up to start a
        Team or join an Open Team above.
      </p>

      {freeAgents.length === 0 ? (
        <p
          className="mt-3 rounded border px-3 py-2.5 text-sm font-medium"
          style={{
            backgroundColor: 'var(--bg-ground)',
            borderColor: 'var(--border-hairline)',
            color: 'var(--ink-secondary)',
          }}
        >
          Every Runner who RSVP&apos;d is currently matched on a Team!
        </p>
      ) : (
        <ul
          className="mt-3 divide-y rounded-md border"
          style={{
            backgroundColor: 'var(--bg-ground)',
            borderColor: 'var(--border-structural)',
          }}
        >
          {freeAgents.map((agent) => {
            const isYou = agent.id === activeParticipantId;
            const chosenTeamId = selectedTeamByParticipant[agent.id] ?? teams[0]?.id ?? '';

            return (
              <li
                key={agent.id}
                className="flex flex-col gap-2 px-3 py-2.5"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {agent.displayName}
                    </span>
                    {isYou && (
                      <span
                        className="rounded border px-1.5 py-0.5 text-[11px] font-bold"
                        style={{
                          backgroundColor: 'var(--bg-rail)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        You
                      </span>
                    )}
                    {agent.isFirst5k && (
                      <span
                        className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: 'var(--accent-amber-soft)',
                          borderColor: 'var(--accent-amber)',
                          color: 'var(--accent-amber-ink)',
                        }}
                      >
                        <Sparkles size={12} aria-hidden="true" />
                        <span>First 5K!</span>
                      </span>
                    )}
                  </div>

                  <div
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold tabular-nums"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    <span>
                      {formatRoundWindow(agent.availableFromRound, agent.availableToRound)}
                    </span>
                    {agent.rough5kMinutes != null && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} aria-hidden="true" />
                        <span>~{agent.rough5kMinutes} min 5K</span>
                      </span>
                    )}
                  </div>
                </div>

                {isOrganizer && teams.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <label htmlFor={`assign-team-${agent.id}`} className="sr-only">
                      Assign {agent.displayName} to Team
                    </label>
                    <select
                      id={`assign-team-${agent.id}`}
                      value={chosenTeamId}
                      onChange={(e) =>
                        setSelectedTeamByParticipant((prev) => ({
                          ...prev,
                          [agent.id]: e.target.value,
                        }))
                      }
                      disabled={busy || !isOnline}
                      className="pfl-focus-ring min-h-[44px] flex-1 rounded-md border-[1.5px] px-2.5 text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                          {team.isOpen ? '' : ' (Closed)'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy || !isOnline || !chosenTeamId}
                      onClick={() => onOrganizerAssignToTeam(agent.id, chosenTeamId)}
                      className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border-0 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
                      style={{
                        backgroundColor: 'var(--shell-header)',
                        color: 'var(--ink-on-shell)',
                      }}
                    >
                      <UserPlus size={14} aria-hidden="true" />
                      <span>{!isOnline ? 'Requires connection' : 'Assign'}</span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
