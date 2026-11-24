import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Award, Check, Plus, Trash2, User, Users, X } from 'lucide-react';
import { useEventData } from '../../state/EventDataContext';
import { resolveOrganizerBadgeAwards } from './autoBadges';

type RecipientMode = 'participant' | 'team';

const INPUT_CLASS =
  'pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-semibold';
const LABEL_CLASS = 'mb-1 block text-xs font-bold tracking-wider uppercase';
const INPUT_STYLE = {
  backgroundColor: 'var(--bg-ground)',
  borderColor: 'var(--border-strong)',
  color: 'var(--ink-primary)',
};

export function OrganizerBadgesSection() {
  const { eventApi, eventId, snapshot, isOnline, setSnapshot } = useEventData();

  const sortedDefinitions = useMemo(
    () =>
      [...snapshot.badgeDefinitions].sort(
        (a, b) => Number(b.isPreset) - Number(a.isPreset) || a.name.localeCompare(b.name),
      ),
    [snapshot.badgeDefinitions],
  );

  const sortedParticipants = useMemo(
    () => [...snapshot.participants].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [snapshot.participants],
  );

  const sortedTeams = useMemo(
    () => [...snapshot.teams].sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.teams],
  );

  const resolvedAwards = useMemo(() => resolveOrganizerBadgeAwards(snapshot), [snapshot]);

  // Award form state (strict recipient XOR driven by recipientMode)
  const [selectedBadgeId, setSelectedBadgeId] = useState<string>(
    () => sortedDefinitions[0]?.id ?? '',
  );
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('participant');
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>(
    () => sortedParticipants[0]?.id ?? '',
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => sortedTeams[0]?.id ?? '');
  const [awardNote, setAwardNote] = useState('');

  // Custom Badge definition form state
  const [customName, setCustomName] = useState('');
  const [customEmoji, setCustomEmoji] = useState('🏅');
  const [customDescription, setCustomDescription] = useState('');

  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Keep selections valid when snapshot items change
  useEffect(() => {
    if (!sortedDefinitions.some((d) => d.id === selectedBadgeId)) {
      setSelectedBadgeId(sortedDefinitions[0]?.id ?? '');
    }
  }, [selectedBadgeId, sortedDefinitions]);

  useEffect(() => {
    if (!sortedParticipants.some((p) => p.id === selectedParticipantId)) {
      setSelectedParticipantId(sortedParticipants[0]?.id ?? '');
    }
  }, [selectedParticipantId, sortedParticipants]);

  useEffect(() => {
    if (!sortedTeams.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(sortedTeams[0]?.id ?? '');
    }
  }, [selectedTeamId, sortedTeams]);

  async function handleAwardSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOnline) {
      setErrorMessage('Requires connection to award Badges.');
      return;
    }
    if (!selectedBadgeId) {
      setErrorMessage('Select a Badge to award.');
      return;
    }

    const participantId = recipientMode === 'participant' ? selectedParticipantId || null : null;
    const teamId = recipientMode === 'team' ? selectedTeamId || null : null;

    if ((participantId === null) === (teamId === null)) {
      setErrorMessage(
        recipientMode === 'participant'
          ? 'Select a Participant to receive this Badge.'
          : 'Select a Team to receive this Badge.',
      );
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const created = await eventApi.createBadgeAward(eventId, {
        badgeDefinitionId: selectedBadgeId,
        participantId,
        teamId,
        note: awardNote.trim() || null,
      });

      setSnapshot((prev) => ({
        ...prev,
        badgeAwards: [created, ...prev.badgeAwards],
      }));
      setAwardNote('');
      setStatusMessage('Badge awarded!');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not award Badge.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokeAward(awardId: string) {
    if (!isOnline) return;
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.deleteBadgeAward(eventId, awardId);
      setSnapshot((prev) => ({
        ...prev,
        badgeAwards: prev.badgeAwards.filter((a) => a.id !== awardId),
      }));
      setStatusMessage('Badge award revoked.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not revoke Badge award.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCustomBadge(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOnline) {
      setErrorMessage('Requires connection to create custom Badges.');
      return;
    }

    const name = customName.trim();
    const emoji = customEmoji.trim();
    if (!name) {
      setErrorMessage('Badge name cannot be empty.');
      return;
    }
    if (!emoji) {
      setErrorMessage('Badge emoji cannot be empty.');
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const created = await eventApi.createBadgeDefinition(eventId, {
        name,
        emoji,
        description: customDescription.trim() || null,
        isPreset: false,
      });

      setSnapshot((prev) => ({
        ...prev,
        badgeDefinitions: [...prev.badgeDefinitions, created],
      }));
      setSelectedBadgeId(created.id);
      setCustomName('');
      setCustomEmoji('🏅');
      setCustomDescription('');
      setStatusMessage(`Custom Badge “${created.name}” created.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not create custom Badge.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDefinition(definitionId: string, name: string) {
    if (!isOnline) return;
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.deleteBadgeDefinition(eventId, definitionId);
      setSnapshot((prev) => ({
        ...prev,
        badgeDefinitions: prev.badgeDefinitions.filter((d) => d.id !== definitionId),
        badgeAwards: prev.badgeAwards.filter((a) => a.badgeDefinitionId !== definitionId),
      }));
      setStatusMessage(`Deleted custom Badge “${name}”.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not delete Badge definition.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmitAward =
    isOnline &&
    !busy &&
    Boolean(selectedBadgeId) &&
    (recipientMode === 'participant' ? Boolean(selectedParticipantId) : Boolean(selectedTeamId));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          Organizer Superlative Badges
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          Award pre-seeded or custom Badges to any Participant or Team. Live auto-Badges update
          automatically on Race Day.
        </p>
      </div>

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

      {statusMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
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

      {/* 1. Award a Badge form (strict recipient XOR) */}
      <section
        aria-label="Award a Badge"
        className="rounded-md border p-3.5"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
      >
        <h4 className="mb-2.5 text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
          Award a Superlative
        </h4>

        <form onSubmit={handleAwardSubmit} className="flex flex-col gap-3" noValidate>
          <div>
            <label
              htmlFor="org-award-badge"
              className={LABEL_CLASS}
              style={{ color: 'var(--ink-secondary)' }}
            >
              Badge
            </label>
            <select
              id="org-award-badge"
              value={selectedBadgeId}
              onChange={(e) => setSelectedBadgeId(e.target.value)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            >
              {sortedDefinitions.map((def) => (
                <option key={def.id} value={def.id}>
                  {def.emoji} {def.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              Recipient type
            </span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Recipient type">
              <button
                type="button"
                aria-pressed={recipientMode === 'participant'}
                onClick={() => setRecipientMode('participant')}
                className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border text-sm font-bold"
                style={
                  recipientMode === 'participant'
                    ? {
                        backgroundColor: 'var(--shell-header)',
                        borderColor: 'var(--shell-header)',
                        color: 'var(--ink-on-shell)',
                      }
                    : {
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--ink-primary)',
                      }
                }
              >
                <User size={15} aria-hidden="true" />
                <span>Participant</span>
              </button>
              <button
                type="button"
                aria-pressed={recipientMode === 'team'}
                onClick={() => setRecipientMode('team')}
                className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border text-sm font-bold"
                style={
                  recipientMode === 'team'
                    ? {
                        backgroundColor: 'var(--shell-header)',
                        borderColor: 'var(--shell-header)',
                        color: 'var(--ink-on-shell)',
                      }
                    : {
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--ink-primary)',
                      }
                }
              >
                <Users size={15} aria-hidden="true" />
                <span>Team</span>
              </button>
            </div>
          </div>

          {recipientMode === 'participant' ? (
            <div>
              <label
                htmlFor="org-award-participant"
                className={LABEL_CLASS}
                style={{ color: 'var(--ink-secondary)' }}
              >
                Select Participant
              </label>
              {sortedParticipants.length === 0 ? (
                <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                  No Participants have joined this Event yet.
                </p>
              ) : (
                <select
                  id="org-award-participant"
                  value={selectedParticipantId}
                  onChange={(e) => setSelectedParticipantId(e.target.value)}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                >
                  {sortedParticipants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div>
              <label
                htmlFor="org-award-team"
                className={LABEL_CLASS}
                style={{ color: 'var(--ink-secondary)' }}
              >
                Select Team
              </label>
              {sortedTeams.length === 0 ? (
                <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                  No Teams have been formed yet.
                </p>
              ) : (
                <select
                  id="org-award-team"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                >
                  {sortedTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.emoji ? `${t.emoji} ` : ''}
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="org-award-note"
              className={LABEL_CLASS}
              style={{ color: 'var(--ink-secondary)' }}
            >
              Note (optional)
            </label>
            <input
              id="org-award-note"
              type="text"
              value={awardNote}
              onChange={(e) => setAwardNote(e.target.value)}
              placeholder="e.g. Unmatched Basecamp cheer energy!"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmitAward}
            className="pfl-focus-ring inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
            style={{
              backgroundColor: 'var(--accent-amber-cta)',
              color: '#0C1E30',
            }}
          >
            <Award size={16} strokeWidth={2.5} aria-hidden="true" />
            <span>{!isOnline ? 'Requires connection' : busy ? 'Awarding…' : 'Award Badge'}</span>
          </button>
        </form>
      </section>

      {/* 2. Awarded superlatives (with Revoke) */}
      <section aria-label="Awarded Superlatives" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
            Awarded Superlatives
          </h4>
          <span className="font-telemetry text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
            {resolvedAwards.length}
          </span>
        </div>

        {resolvedAwards.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            No superlatives awarded yet.
          </p>
        ) : (
          <ul
            className="m-0 list-none divide-y overflow-hidden rounded-md border p-0"
            style={{
              borderColor: 'var(--border-structural)',
              backgroundColor: 'var(--bg-ground)',
            }}
          >
            {resolvedAwards.map((item) => (
              <li
                key={item.award.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span className="text-lg leading-none" aria-hidden="true">
                    {item.definition.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {item.definition.name}
                    </p>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                      {item.recipientType === 'team' ? 'Team: ' : 'Participant: '}
                      {item.recipientEmoji ? `${item.recipientEmoji} ` : ''}
                      {item.recipientName}
                    </p>
                    {item.award.note && (
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
                        “{item.award.note}”
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  aria-label={`Revoke ${item.definition.name} from ${item.recipientName}`}
                  disabled={!isOnline || busy}
                  onClick={() => void handleRevokeAward(item.award.id)}
                  className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--accent-error)',
                  }}
                >
                  <X size={14} aria-hidden="true" />
                  <span>Revoke</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Badge Catalog (5 pre-seeded presets + custom definitions) */}
      <section aria-label="Badge Catalog" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
            Superlative Badge Catalog
          </h4>
          <span className="font-telemetry text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
            {sortedDefinitions.length} total
          </span>
        </div>

        <ul
          className="m-0 list-none divide-y overflow-hidden rounded-md border p-0"
          style={{
            borderColor: 'var(--border-structural)',
            backgroundColor: 'var(--bg-ground)',
          }}
        >
          {sortedDefinitions.map((def) => (
            <li
              key={def.id}
              className="flex items-center justify-between gap-2 p-2.5"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <span className="text-lg leading-none" aria-hidden="true">
                  {def.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {def.name}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                      style={{
                        backgroundColor: def.isPreset
                          ? 'var(--bg-rail)'
                          : 'var(--accent-amber-soft)',
                        color: def.isPreset ? 'var(--ink-secondary)' : 'var(--accent-amber-ink)',
                      }}
                    >
                      {def.isPreset ? 'Preset' : 'Custom'}
                    </span>
                  </div>
                  {def.description && (
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                      {def.description}
                    </p>
                  )}
                </div>
              </div>

              {!def.isPreset && (
                <button
                  type="button"
                  aria-label={`Delete ${def.name}`}
                  disabled={!isOnline || busy}
                  onClick={() => void handleDeleteDefinition(def.id, def.name)}
                  className="pfl-focus-ring inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md border disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--accent-error)',
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Create Custom Badge Definition form */}
      <section
        aria-label="Create Custom Badge"
        className="rounded-md border p-3.5"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
      >
        <h4 className="mb-2.5 text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
          Create Custom Badge
        </h4>

        <form onSubmit={handleCreateCustomBadge} className="flex flex-col gap-3" noValidate>
          <div className="grid grid-cols-[1fr_92px] gap-2">
            <div>
              <label
                htmlFor="org-badge-name"
                className={LABEL_CLASS}
                style={{ color: 'var(--ink-secondary)' }}
              >
                Badge name
              </label>
              <input
                id="org-badge-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Frostiest Beanie"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </div>

            <div>
              <label
                htmlFor="org-badge-emoji"
                className={LABEL_CLASS}
                style={{ color: 'var(--ink-secondary)' }}
              >
                Emoji
              </label>
              <input
                id="org-badge-emoji"
                type="text"
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value)}
                placeholder="🏅"
                className={`${INPUT_CLASS} text-center`}
                style={INPUT_STYLE}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="org-badge-description"
              className={LABEL_CLASS}
              style={{ color: 'var(--ink-secondary)' }}
            >
              Description (optional)
            </label>
            <input
              id="org-badge-description"
              type="text"
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="What earns this playful superlative?"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>

          <button
            type="submit"
            disabled={busy || !isOnline}
            className="pfl-focus-ring inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
            style={{
              backgroundColor: 'var(--shell-header)',
              color: 'var(--ink-on-shell)',
            }}
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            <span>
              {!isOnline ? 'Requires connection' : busy ? 'Creating…' : 'Create Custom Badge'}
            </span>
          </button>
        </form>
      </section>
    </div>
  );
}
