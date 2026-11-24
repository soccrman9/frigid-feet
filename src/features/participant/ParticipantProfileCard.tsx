import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Clock,
  Eye,
  EyeOff,
  Footprints,
  HeartHandshake,
  HelpCircle,
  Pencil,
  Sparkles,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { Participant, RsvpStatus } from '../../types/domain';
import { useEventData } from '../../state/EventDataContext';
import {
  getRsvpOption,
  ROUND_NUMBERS,
  RSVP_OPTIONS,
  validateParticipantProfile,
  type ParticipantProfileDraft,
  type ValidatedParticipantProfile,
} from './participantConstants';

function createDraftFromParticipant(participant: Participant): ParticipantProfileDraft {
  return {
    displayName: participant.displayName,
    rsvpStatus: participant.rsvpStatus,
    availableFromRound: participant.availableFromRound,
    availableToRound: participant.availableToRound,
    rough5kMinutesInput:
      participant.rough5kMinutes != null ? String(participant.rough5kMinutes) : '',
    isFirst5k: participant.isFirst5k,
    dietaryNotes: participant.dietaryNotes ?? '',
    showTimesOnLeaderboard: participant.showTimesOnLeaderboard,
  };
}

function RsvpIcon({ status }: { status: RsvpStatus }) {
  switch (status) {
    case 'going_runner':
      return <Footprints size={15} strokeWidth={2.2} aria-hidden="true" />;
    case 'going_supporter':
      return <HeartHandshake size={15} strokeWidth={2.2} aria-hidden="true" />;
    case 'maybe':
      return <HelpCircle size={15} strokeWidth={2.2} aria-hidden="true" />;
    case 'cant_make_it':
      return <XCircle size={15} strokeWidth={2.2} aria-hidden="true" />;
  }
}

function formatRoundWindow(from: number, to: number): string {
  return from === to ? `Round ${from}` : `Rounds ${from}–${to}`;
}

export function ParticipantProfileCard() {
  const {
    eventApi,
    eventId,
    snapshot,
    isOnline,
    activeParticipant,
    clearParticipant,
    refreshSnapshot,
    setSnapshot,
  } = useEventData();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ParticipantProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingTeamLeaveProfile, setPendingTeamLeaveProfile] =
    useState<ValidatedParticipantProfile | null>(null);

  const activeTeam = useMemo(() => {
    if (!activeParticipant?.teamId) return null;
    return snapshot.teams.find((team) => team.id === activeParticipant.teamId) ?? null;
  }, [activeParticipant?.teamId, snapshot.teams]);

  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setErrorMessage(null);
    setStatusMessage(null);
    setPendingTeamLeaveProfile(null);
  }, [activeParticipant?.id]);

  if (!activeParticipant) {
    return null;
  }

  const currentParticipant = activeParticipant;
  const rsvpOption = getRsvpOption(currentParticipant.rsvpStatus);

  function openEditor() {
    setDraft(createDraftFromParticipant(currentParticipant));
    setEditing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setPendingTeamLeaveProfile(null);
  }

  function closeEditor() {
    setEditing(false);
    setDraft(null);
    setErrorMessage(null);
    setPendingTeamLeaveProfile(null);
  }

  async function persistProfile(
    validated: ValidatedParticipantProfile,
    shouldLeaveTeam: boolean,
  ) {
    setSaving(true);
    setErrorMessage(null);

    try {
      if (shouldLeaveTeam) {
        await eventApi.leaveTeam(currentParticipant.id);
      }

      const updated = await eventApi.updateParticipant(eventId, currentParticipant.id, {
        displayName: validated.displayName,
        rsvpStatus: validated.rsvpStatus,
        availableFromRound: validated.availableFromRound,
        availableToRound: validated.availableToRound,
        rough5kMinutes: validated.rough5kMinutes,
        isFirst5k: validated.isFirst5k,
        dietaryNotes: validated.dietaryNotes,
        showTimesOnLeaderboard: validated.showTimesOnLeaderboard,
      });

      if (shouldLeaveTeam) {
        await refreshSnapshot();
      } else {
        setSnapshot((prev) => ({
          ...prev,
          participants: prev.participants.map((p) => (p.id === updated.id ? updated : p)),
        }));
      }

      setEditing(false);
      setDraft(null);
      setPendingTeamLeaveProfile(null);
      setStatusMessage('Profile saved.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not save your profile. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!draft) return;

    if (!isOnline) {
      setErrorMessage('Requires connection to save profile changes.');
      return;
    }

    const validation = validateParticipantProfile(draft);
    if (!validation.ok) {
      setErrorMessage(validation.error);
      setPendingTeamLeaveProfile(null);
      return;
    }

    const leavingTeam =
      currentParticipant.teamId !== null && validation.value.rsvpStatus !== 'going_runner';

    if (leavingTeam) {
      setErrorMessage(null);
      setPendingTeamLeaveProfile(validation.value);
      return;
    }

    await persistProfile(validation.value, false);
  }

  return (
    <section
      aria-labelledby="participant-profile-heading"
      className="rounded-md border-[1.5px] p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            id="participant-profile-heading"
            className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <UserCheck size={14} strokeWidth={2.3} aria-hidden="true" />
            <span>Your Profile &amp; RSVP</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2
              className="truncate text-lg font-bold leading-snug"
              style={{ color: 'var(--ink-primary)' }}
            >
              {currentParticipant.displayName}
            </h2>
            <span
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold"
              style={{
                backgroundColor:
                  currentParticipant.rsvpStatus === 'going_runner'
                    ? 'var(--accent-spruce-soft)'
                    : 'var(--bg-rail)',
                borderColor:
                  currentParticipant.rsvpStatus === 'going_runner'
                    ? 'var(--accent-spruce)'
                    : 'var(--border-strong)',
                color:
                  currentParticipant.rsvpStatus === 'going_runner'
                    ? 'var(--accent-spruce)'
                    : 'var(--ink-primary)',
              }}
            >
              <RsvpIcon status={currentParticipant.rsvpStatus} />
              <span>{rsvpOption.label}</span>
            </span>
            {currentParticipant.isFirst5k && (
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
        </div>
      </div>

      {/* Glanceable profile metadata strip */}
      <div
        className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-2.5 text-xs font-semibold tabular-nums"
        style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-secondary)' }}
      >
        <span>
          {formatRoundWindow(
            currentParticipant.availableFromRound,
            currentParticipant.availableToRound,
          )}
        </span>
        {activeTeam ? (
          <span>Team: {activeTeam.name}</span>
        ) : currentParticipant.rsvpStatus === 'going_runner' ? (
          <span>Free Agent</span>
        ) : null}
        {currentParticipant.rough5kMinutes != null && (
          <span className="inline-flex items-center gap-1">
            <Clock size={13} aria-hidden="true" />
            <span>~{currentParticipant.rough5kMinutes} min 5K</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          {currentParticipant.showTimesOnLeaderboard ? (
            <>
              <Eye size={13} aria-hidden="true" />
              <span>Speed Leaderboard ON</span>
            </>
          ) : (
            <>
              <EyeOff size={13} aria-hidden="true" />
              <span>5K times private</span>
            </>
          )}
        </span>
      </div>

      {currentParticipant.dietaryNotes && !editing && (
        <p className="mt-2 text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
          Dietary notes: {currentParticipant.dietaryNotes}
        </p>
      )}

      {statusMessage && !editing && (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
          style={{
            backgroundColor: 'var(--accent-spruce-soft)',
            borderColor: 'var(--accent-spruce)',
            color: 'var(--accent-spruce)',
          }}
        >
          <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Action buttons (44px+ touch targets) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={editing ? closeEditor : openEditor}
          aria-expanded={editing}
          className="pfl-focus-ring flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-[1.5px] px-3.5 text-sm font-bold"
          style={{
            backgroundColor: editing ? 'var(--bg-rail)' : 'var(--shell-header)',
            borderColor: 'var(--shell-header)',
            color: editing ? 'var(--ink-primary)' : 'var(--ink-on-shell)',
          }}
        >
          <Pencil size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>{editing ? 'Close Editor' : 'Edit Profile & RSVP'}</span>
        </button>

        <button
          type="button"
          onClick={clearParticipant}
          className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border-[1.5px] px-3.5 text-sm font-bold"
          style={{
            backgroundColor: 'var(--bg-ground)',
            borderColor: 'var(--border-strong)',
            color: 'var(--ink-primary)',
          }}
        >
          <ArrowLeftRight size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>Switch Participant</span>
        </button>
      </div>

      {/* Scoped honor-system profile editor */}
      {editing && draft && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 flex flex-col gap-3.5 border-t pt-4"
          style={{ borderColor: 'var(--border-hairline)' }}
          noValidate
        >
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
            Editing your own profile as {currentParticipant.displayName}.
          </p>

          <div>
            <label
              htmlFor="profile-display-name"
              className="mb-1 block text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Display name
            </label>
            <input
              id="profile-display-name"
              type="text"
              value={draft.displayName}
              onChange={(e) => {
                setDraft({ ...draft, displayName: e.target.value });
                if (errorMessage) setErrorMessage(null);
              }}
              className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-base font-semibold"
              style={{
                backgroundColor: 'var(--bg-ground)',
                borderColor: 'var(--border-strong)',
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
                const selected = draft.rsvpStatus === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setDraft({ ...draft, rsvpStatus: option.value });
                      setPendingTeamLeaveProfile(null);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-md border-[1.5px] px-3 py-2 text-left text-sm font-bold"
                    style={{
                      backgroundColor: selected ? 'var(--shell-header)' : 'var(--bg-ground)',
                      borderColor: selected ? 'var(--shell-header)' : 'var(--border-structural)',
                      color: selected ? 'var(--ink-on-shell)' : 'var(--ink-primary)',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <RsvpIcon status={option.value} />
                      <span>{option.label}</span>
                    </span>
                    {selected && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <p
              className="mb-1.5 text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Round attendance window
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="profile-from-round"
                  className="mb-1 block text-xs font-semibold"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  Available from Round
                </label>
                <select
                  id="profile-from-round"
                  value={draft.availableFromRound}
                  onChange={(e) => {
                    setDraft({ ...draft, availableFromRound: Number(e.target.value) });
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-2.5 text-sm font-bold tabular-nums"
                  style={{
                    backgroundColor: 'var(--bg-ground)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  {ROUND_NUMBERS.map((roundNum) => (
                    <option key={roundNum} value={roundNum}>
                      Round {roundNum}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="profile-to-round"
                  className="mb-1 block text-xs font-semibold"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  Available to Round
                </label>
                <select
                  id="profile-to-round"
                  value={draft.availableToRound}
                  onChange={(e) => {
                    setDraft({ ...draft, availableToRound: Number(e.target.value) });
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-2.5 text-sm font-bold tabular-nums"
                  style={{
                    backgroundColor: 'var(--bg-ground)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  {ROUND_NUMBERS.map((roundNum) => (
                    <option key={roundNum} value={roundNum}>
                      Round {roundNum}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Defaults to Rounds 1–10. Helps teammates schedule your Legs without blocking you.
            </p>
          </div>

          <div>
            <label
              htmlFor="profile-rough-pace"
              className="mb-1 block text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Rough 5K pace (minutes, optional)
            </label>
            <input
              id="profile-rough-pace"
              type="text"
              inputMode="numeric"
              value={draft.rough5kMinutesInput}
              onChange={(e) => {
                setDraft({ ...draft, rough5kMinutesInput: e.target.value });
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="e.g. 28"
              className="pfl-focus-ring font-telemetry min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-base font-semibold"
              style={{
                backgroundColor: 'var(--bg-ground)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Totally optional — used only for friendly return ETAs at Basecamp.
            </p>
          </div>

          <label
            className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border-[1.5px] p-3"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-structural)',
            }}
          >
            <input
              type="checkbox"
              checked={draft.isFirst5k}
              onChange={(e) => setDraft({ ...draft, isFirst5k: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#163A59]"
            />
            <span className="text-sm leading-snug">
              <span className="block font-bold" style={{ color: 'var(--ink-primary)' }}>
                First 5K!
              </span>
              <span className="block text-xs" style={{ color: 'var(--ink-secondary)' }}>
                Tag your profile to celebrate your first 5K and unlock the First 5K Club Badge.
              </span>
            </span>
          </label>

          <div>
            <label
              htmlFor="profile-dietary-notes"
              className="mb-1 block text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Dietary notes (optional)
            </label>
            <input
              id="profile-dietary-notes"
              type="text"
              value={draft.dietaryNotes}
              onChange={(e) => setDraft({ ...draft, dietaryNotes: e.target.value })}
              placeholder="e.g. Vegetarian, gluten-free, nut allergy"
              className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-medium"
              style={{
                backgroundColor: 'var(--bg-ground)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Summarized on the Supplies tab so Basecamp snacks work for everyone.
            </p>
          </div>

          <label
            className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border-[1.5px] p-3"
            style={{
              backgroundColor: 'var(--bg-rail-subtle)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <input
              type="checkbox"
              checked={draft.showTimesOnLeaderboard}
              onChange={(e) =>
                setDraft({ ...draft, showTimesOnLeaderboard: e.target.checked })
              }
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#163A59]"
            />
            <span className="text-sm leading-snug">
              <span className="block font-bold" style={{ color: 'var(--ink-primary)' }}>
                Show my 5K times &amp; join Speed Leaderboard
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                OFF by default. Your individual 5K times stay private to you unless you turn this
                on — Winter Grind is about finishing 50K together, not speed.
              </span>
            </span>
          </label>

          {pendingTeamLeaveProfile && (
            <div
              role="alert"
              className="rounded-md border-[1.5px] p-3"
              style={{
                backgroundColor: 'var(--accent-amber-soft)',
                borderColor: 'var(--accent-amber)',
                color: 'var(--ink-primary)',
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  size={18}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--accent-amber-ink)' }}
                />
                <div className="text-sm">
                  <p className="font-bold">
                    Leave {activeTeam ? `Team "${activeTeam.name}"` : 'your Team'}?
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                    Teams are Runner-only. Switching your RSVP away from Going (Runner) removes you
                    from the Team — your future scheduled Legs will be unassigned while your
                    completed Legs stay preserved.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || !isOnline}
                  onClick={() => void persistProfile(pendingTeamLeaveProfile, true)}
                  className="pfl-focus-ring min-h-[44px] flex-1 cursor-pointer rounded-md border-0 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
                  style={{
                    backgroundColor: 'var(--accent-amber-cta)',
                    color: '#0C1E30',
                  }}
                >
                  {!isOnline ? 'Requires connection' : saving ? 'Updating…' : 'Confirm & Leave Team'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setPendingTeamLeaveProfile(null);
                    setDraft({ ...draft, rsvpStatus: 'going_runner' });
                  }}
                  className="pfl-focus-ring min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-3 text-sm font-bold"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  Keep Going (Runner)
                </button>
              </div>
            </div>
          )}

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

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || !isOnline}
              className="pfl-focus-ring flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-4 text-base font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-65"
              style={{
                backgroundColor: 'var(--accent-amber-cta)',
                color: '#0C1E30',
              }}
            >
              <span>
                {!isOnline
                  ? 'Requires connection'
                  : saving
                    ? 'Saving…'
                    : 'Save Profile'}
              </span>
            </button>
            <button
              type="button"
              onClick={closeEditor}
              disabled={saving}
              className="pfl-focus-ring min-h-[48px] cursor-pointer rounded-md border-[1.5px] px-4 text-sm font-bold"
              style={{
                backgroundColor: 'var(--bg-ground)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
