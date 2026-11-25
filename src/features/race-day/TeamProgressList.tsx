import type { Leg, Team } from '../../types/domain';

export interface TeamProgressListProps {
  teams: Team[];
  legs: Leg[];
}

const ROUND_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function TeamProgressList({ teams, legs }: TeamProgressListProps) {
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section aria-label="Teams 50K Progress" className="flex flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2
          className="text-xs font-bold tracking-[0.05em] uppercase"
          style={{ color: 'var(--ink-secondary)' }}
        >
          Teams · 50K Progress
        </h2>
        <span className="font-telemetry text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
          Alphabetical
        </span>
      </div>

      <div
        className="overflow-hidden rounded-[6px] border-[1.5px]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {sortedTeams.length === 0 ? (
          <p className="px-3 py-4 text-sm" style={{ color: 'var(--ink-secondary)' }}>
            No Teams formed yet. Head to the Teams tab to start or join a Team.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {sortedTeams.map((team, idx) => {
              const teamLegs = legs.filter((leg) => leg.teamId === team.id);
              const byRound = new Map<number, Leg>();
              for (const leg of teamLegs) {
                byRound.set(leg.roundNumber, leg);
              }

              const completedCount = teamLegs.filter((leg) => leg.status === 'completed').length;
              const activeCount = teamLegs.filter((leg) => leg.status === 'out_on_course').length;
              const openCount = Math.max(0, 10 - completedCount - activeCount);
              const kmDone = completedCount * 5;

              return (
                <li
                  key={team.id}
                  className="px-3 py-2"
                  style={
                    idx < sortedTeams.length - 1
                      ? { borderBottom: '1px solid var(--border-hairline)' }
                      : undefined
                  }
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span
                      data-testid="team-progress-name"
                      className="truncate text-sm font-bold"
                      style={{ color: 'var(--ink-primary)' }}
                    >
                      {team.emoji ? `${team.emoji} ` : ''}
                      {team.name}
                    </span>
                    <span
                      className="font-telemetry shrink-0 text-[13px] font-bold"
                      style={{
                        color:
                          completedCount === 10
                            ? 'var(--accent-spruce)'
                            : 'var(--ink-secondary)',
                      }}
                    >
                      {kmDone} / 50 km
                    </span>
                  </div>

                  <div
                    role="img"
                    aria-label={`${team.name}: ${completedCount} completed, ${activeCount} out on course, ${openCount} open out of 10 Rounds`}
                    className="grid grid-cols-10 gap-[3px]"
                  >
                    {ROUND_NUMBERS.map((roundNum) => {
                      const leg = byRound.get(roundNum);
                      const status = leg?.status ?? 'scheduled';
                      const segStyle: React.CSSProperties =
                        status === 'completed'
                          ? {
                              backgroundColor: 'var(--accent-spruce)',
                              borderColor: 'var(--accent-spruce-border)',
                              borderStyle: 'solid',
                            }
                          : status === 'out_on_course'
                            ? {
                                backgroundColor: 'var(--accent-amber-cta)',
                                backgroundImage:
                                  'repeating-linear-gradient(-45deg, transparent 0 3px, rgba(12, 30, 48, 0.25) 3px 5px)',
                                borderColor: 'var(--accent-amber-ink)',
                                borderStyle: 'solid',
                              }
                            : {
                                backgroundColor: 'var(--bg-ground)',
                                borderColor: 'var(--border-strong)',
                                borderStyle: 'dashed',
                              };

                      return (
                        <div
                          key={roundNum}
                          data-segment-status={status}
                          title={`Round ${roundNum}: ${
                            status === 'completed'
                              ? 'Completed'
                              : status === 'out_on_course'
                                ? 'Out on course'
                                : 'Open'
                          }`}
                          className="h-2 border"
                          style={segStyle}
                        />
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
