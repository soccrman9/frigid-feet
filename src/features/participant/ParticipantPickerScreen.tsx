import { useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  ChevronRight,
  Footprints,
  HeartHandshake,
  HelpCircle,
  Search,
  Sparkles,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import type { RsvpStatus } from '../../types/domain';
import { useEventData } from '../../state/EventDataContext';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { getRsvpOption, RSVP_OPTIONS } from './participantConstants';

function RsvpStatusIcon({ status }: { status: RsvpStatus }) {
  switch (status) {
    case 'going_runner':
      return <Footprints size={14} strokeWidth={2.3} aria-hidden="true" />;
    case 'going_supporter':
      return <HeartHandshake size={14} strokeWidth={2.3} aria-hidden="true" />;
    case 'maybe':
      return <HelpCircle size={14} strokeWidth={2.3} aria-hidden="true" />;
    case 'cant_make_it':
      return <XCircle size={14} strokeWidth={2.3} aria-hidden="true" />;
  }
}

function getRsvpBadgeStyles(status: RsvpStatus): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  switch (status) {
    case 'going_runner':
      return {
        backgroundColor: 'var(--accent-spruce-soft)',
        borderColor: 'var(--accent-spruce)',
        color: 'var(--accent-spruce)',
      };
    case 'going_supporter':
      return {
        backgroundColor: 'var(--bg-rail)',
        borderColor: 'var(--border-strong)',
        color: 'var(--ink-primary)',
      };
    case 'maybe':
      return {
        backgroundColor: 'var(--accent-amber-soft)',
        borderColor: 'var(--accent-amber)',
        color: 'var(--accent-amber-ink)',
      };
    case 'cant_make_it':
      return {
        backgroundColor: 'var(--bg-rail-subtle)',
        borderColor: 'var(--border-structural)',
        color: 'var(--ink-secondary)',
      };
  }
}

export function ParticipantPickerScreen() {
  const { eventApi, eventId, snapshot, isOnline, selectParticipant, setSnapshot } = useEventData();
  const { event, participants, teams } = snapshot;

  const [showWalkInForm, setShowWalkInForm] = useState(participants.length === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>('going_runner');
  const [isFirst5k, setIsFirst5k] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teams) {
      map.set(team.id, team.name);
    }
    return map;
  }, [teams]);

  const sortedParticipants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = [...participants].sort((a, b) => a.displayName.localeCompare(b.displayName));
    if (!query) return list;
    return list.filter((p) => p.displayName.toLowerCase().includes(query));
  }, [participants, searchQuery]);

  async function handleCreateWalkIn(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter your name to join this Event.');
      return;
    }
    if (!isOnline) {
      setErrorMessage('Requires connection to add a new Participant.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const created = await eventApi.createParticipant(eventId, {
        displayName: trimmedName,
        rsvpStatus,
        teamId: null,
        availableFromRound: 1,
        availableToRound: 10,
        rough5kMinutes: null,
        isFirst5k,
        dietaryNotes: null,
        showTimesOnLeaderboard: false,
      });

      setSnapshot((prev) => ({
        ...prev,
        participants: prev.participants.some((p) => p.id === created.id)
          ? prev.participants
          : [...prev.participants, created],
      }));
      selectParticipant(created.id);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not add your profile. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
    >
      <header
        className="flex h-12 shrink-0 items-center justify-between gap-2 border-b pl-3.5 pr-1"
        style={{
          backgroundColor: 'var(--shell-header)',
          borderColor: 'var(--shell-header-border)',
          color: 'var(--ink-on-shell)',
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-bold tracking-tight">{event.name}</span>
        </div>
        <ThemeToggleButton />
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
        <section
          aria-labelledby="participant-picker-heading"
          className="rounded-lg border-[1.5px] p-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: 'var(--bg-rail)', color: 'var(--shell-header)' }}
            >
              <Users size={20} strokeWidth={2.2} aria-hidden="true" />
            </div>
            <div>
              <p
                className="text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Honor-System Check-In
              </p>
              <h1
                id="participant-picker-heading"
                className="text-lg font-bold leading-snug"
                style={{ color: 'var(--ink-primary)' }}
              >
                Who&apos;s checking in?
              </h1>
            </div>
          </div>

          <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            Tap your name below, or add yourself if you&apos;re new — no passwords, PINs, or emails
            needed.
          </p>

          {participants.length >= 6 && (
            <div className="relative mt-3">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                style={{ color: 'var(--ink-secondary)' }}
              />
              <input
                type="search"
                aria-label="Filter Participants by name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name…"
                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] pr-3 pl-9 text-sm font-medium"
                style={{
                  backgroundColor: 'var(--bg-ground)',
                  borderColor: 'var(--border-structural)',
                  color: 'var(--ink-primary)',
                }}
              />
            </div>
          )}

          {participants.length > 0 && (
            <div
              className="mt-3 overflow-hidden rounded-md border-[1.5px]"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
              }}
            >
              {sortedParticipants.length === 0 ? (
                <p className="p-4 text-sm font-medium" style={{ color: 'var(--ink-secondary)' }}>
                  No matching Participant found. Add yourself below!
                </p>
              ) : (
                <ul className="m-0 list-none divide-y p-0" style={{ borderColor: 'var(--border-hairline)' }}>
                  {sortedParticipants.map((participant) => {
                    const rsvp = getRsvpOption(participant.rsvpStatus);
                    const badgeStyle = getRsvpBadgeStyles(participant.rsvpStatus);
                    const teamName = participant.teamId
                      ? teamNameById.get(participant.teamId)
                      : null;

                    return (
                      <li
                        key={participant.id}
                        style={{ borderColor: 'var(--border-hairline)' }}
                      >
                        <button
                          type="button"
                          onClick={() => selectParticipant(participant.id)}
                          className="pfl-focus-ring flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-3.5 py-2.5 text-left transition-colors hover:opacity-90"
                          style={{ color: 'var(--ink-primary)' }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-[15px] font-bold">
                                {participant.displayName}
                              </span>
                              <span
                                className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold"
                                style={badgeStyle}
                              >
                                <RsvpStatusIcon status={participant.rsvpStatus} />
                                <span>{rsvp.shortLabel}</span>
                              </span>
                              {participant.isFirst5k && (
                                <span
                                  className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold"
                                  style={{
                                    backgroundColor: 'var(--accent-amber-soft)',
                                    borderColor: 'var(--accent-amber)',
                                    color: 'var(--accent-amber-ink)',
                                  }}
                                >
                                  <Sparkles size={11} aria-hidden="true" />
                                  <span>First 5K!</span>
                                </span>
                              )}
                            </div>
                            {teamName && (
                              <p
                                className="mt-0.5 truncate text-xs font-medium"
                                style={{ color: 'var(--ink-secondary)' }}
                              >
                                Team: {teamName}
                              </p>
                            )}
                          </div>
                          <ChevronRight
                            size={18}
                            strokeWidth={2.2}
                            aria-hidden="true"
                            style={{ color: 'var(--ink-secondary)' }}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Walk-in flow */}
          <div className="mt-4">
            {!showWalkInForm ? (
              <button
                type="button"
                onClick={() => setShowWalkInForm(true)}
                className="pfl-focus-ring flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-[1.5px] px-4 text-sm font-bold"
                style={{
                  backgroundColor: 'var(--bg-rail)',
                  borderColor: 'var(--shell-header)',
                  color: 'var(--ink-primary)',
                }}
              >
                <UserPlus size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>I&apos;m new — add my name</span>
              </button>
            ) : (
              <div
                className="rounded-md border-[1.5px] p-3.5"
                style={{
                  backgroundColor: 'var(--bg-rail-subtle)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserPlus
                      size={18}
                      strokeWidth={2.2}
                      aria-hidden="true"
                      style={{ color: 'var(--shell-header)' }}
                    />
                    <h2
                      className="text-sm font-bold"
                      style={{ color: 'var(--ink-primary)' }}
                    >
                      I&apos;m new — add my name
                    </h2>
                  </div>
                  {participants.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowWalkInForm(false);
                        setErrorMessage(null);
                      }}
                      className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-0 bg-transparent px-2 text-xs font-bold"
                      style={{ color: 'var(--ink-secondary)' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <form onSubmit={handleCreateWalkIn} className="mt-3 flex flex-col gap-3" noValidate>
                  <div>
                    <label
                      htmlFor="walkin-display-name"
                      className="mb-1 block text-xs font-bold tracking-wider uppercase"
                      style={{ color: 'var(--ink-secondary)' }}
                    >
                      Your name
                    </label>
                    <input
                      id="walkin-display-name"
                      name="displayName"
                      type="text"
                      autoComplete="name"
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="e.g. Jordan Lee"
                      aria-invalid={Boolean(errorMessage)}
                      className="pfl-focus-ring min-h-[48px] w-full rounded-md border-[1.5px] px-3 text-base font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: errorMessage ? 'var(--accent-error)' : 'var(--border-strong)',
                        color: 'var(--ink-primary)',
                      }}
                    />
                  </div>

                  <fieldset className="m-0 border-0 p-0">
                    <legend
                      className="mb-1.5 text-xs font-bold tracking-wider uppercase"
                      style={{ color: 'var(--ink-secondary)' }}
                    >
                      RSVP status
                    </legend>
                    <div role="radiogroup" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {RSVP_OPTIONS.map((option) => {
                        const selected = rsvpStatus === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setRsvpStatus(option.value)}
                            className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-md border-[1.5px] px-3 py-2 text-left text-sm font-bold"
                            style={{
                              backgroundColor: selected
                                ? 'var(--shell-header)'
                                : 'var(--bg-surface)',
                              borderColor: selected
                                ? 'var(--shell-header)'
                                : 'var(--border-structural)',
                              color: selected ? 'var(--ink-on-shell)' : 'var(--ink-primary)',
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <RsvpStatusIcon status={option.value} />
                              <span>{option.label}</span>
                            </span>
                            {selected && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <label
                    className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-structural)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isFirst5k}
                      onChange={(e) => setIsFirst5k(e.target.checked)}
                      className="h-5 w-5 shrink-0 accent-[#163A59]"
                    />
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                      First 5K!{' '}
                      <span className="font-normal" style={{ color: 'var(--ink-secondary)' }}>
                        (Optional — celebrates your milestone!)
                      </span>
                    </span>
                  </label>

                  <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                    Your 5K times stay private by default. You can edit your Round availability,
                    dietary notes, or Speed Leaderboard opt-in anytime on Home.
                  </p>

                  {errorMessage && (
                    <div
                      role="alert"
                      className="rounded-md border px-3 py-2 text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--accent-error-bg)',
                        borderColor: 'var(--accent-error-border)',
                        color: 'var(--accent-error)',
                      }}
                    >
                      {errorMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !isOnline}
                    className="pfl-focus-ring flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-4 text-base font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-65"
                    style={{
                      backgroundColor: 'var(--accent-amber-cta)',
                      color: '#0C1E30',
                    }}
                  >
                    <span>
                      {!isOnline
                        ? 'Requires connection'
                        : submitting
                          ? 'Joining Event…'
                          : 'Join Event'}
                    </span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
