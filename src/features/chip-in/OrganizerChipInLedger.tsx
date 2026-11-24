import { useMemo, useState, type FormEvent } from 'react';
import { Check, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ChipIn } from '../../types/domain';
import { useEventData } from '../../state/EventDataContext';
import {
  centsToDollarInput,
  formatChipInTimestamp,
  formatUsd,
  parsePositiveDollarInputToCents,
} from './chipInFormatting';

interface EditChipInDraft {
  id: string;
  participantId: string;
  amountDollars: string;
  note: string;
}

const INPUT_CLASS =
  'pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-semibold';
const LABEL_CLASS = 'mb-1 block text-xs font-bold tracking-wider uppercase';
const INPUT_STYLE = {
  backgroundColor: 'var(--bg-ground)',
  borderColor: 'var(--border-strong)',
  color: 'var(--ink-primary)',
};

export function OrganizerChipInLedger() {
  const { eventApi, eventId, snapshot, isOnline, refreshSnapshot } = useEventData();
  const { event, participants, chipIns, chipInTotalCents } = snapshot;

  const [newParticipantId, setNewParticipantId] = useState('');
  const [newAmountDollars, setNewAmountDollars] = useState('');
  const [newNote, setNewNote] = useState('');

  const [editDraft, setEditDraft] = useState<EditChipInDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [participants],
  );

  const participantById = useMemo(
    () => new Map(participants.map((p) => [p.id, p])),
    [participants],
  );

  const sortedEntries = useMemo(
    () => [...chipIns].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [chipIns],
  );

  function contributorLabel(entry: ChipIn): string {
    if (!entry.participantId) return 'Anonymous / Unlisted';
    return participantById.get(entry.participantId)?.displayName ?? 'Anonymous / Unlisted';
  }

  async function handleCreate(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOnline) {
      setErrorMessage('Requires connection to record chip-ins.');
      return;
    }

    const parsed = parsePositiveDollarInputToCents(newAmountDollars);
    if (!parsed.ok) {
      setErrorMessage(parsed.error);
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.createChipIn(eventId, {
        participantId: newParticipantId || null,
        amountCents: parsed.cents,
        note: newNote.trim() || null,
      });
      await refreshSnapshot();
      setNewParticipantId('');
      setNewAmountDollars('');
      setNewNote('');
      setStatusMessage('Chip-in recorded. Home total updated.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not record chip-in.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!editDraft) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to update chip-ins.');
      return;
    }

    const parsed = parsePositiveDollarInputToCents(editDraft.amountDollars);
    if (!parsed.ok) {
      setErrorMessage(parsed.error);
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.updateChipIn(eventId, editDraft.id, {
        participantId: editDraft.participantId || null,
        amountCents: parsed.cents,
        note: editDraft.note.trim() || null,
      });
      await refreshSnapshot();
      setEditDraft(null);
      setStatusMessage('Chip-in entry updated. Home total updated.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not update chip-in entry.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(entry: ChipIn) {
    if (!isOnline) {
      setErrorMessage('Requires connection to delete chip-ins.');
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.deleteChipIn(eventId, entry.id);
      await refreshSnapshot();
      if (editDraft?.id === entry.id) {
        setEditDraft(null);
      }
      setStatusMessage('Chip-in entry deleted. Home total updated.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not delete chip-in entry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-1.5">
          <Lock
            size={14}
            strokeWidth={2.25}
            aria-hidden="true"
            style={{ color: 'var(--ink-secondary)' }}
          />
          <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
            Private Chip-In Ledger
          </h3>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
          Organizer-only record of off-app Venmo, Zelle, or cash chip-ins. Participants on Home
          only see the combined total — never who chipped in, counts, or individual amounts.
        </p>
      </div>

      {/* Private Organizer summary */}
      <div
        className="grid grid-cols-3 gap-2 rounded-md border p-3"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
      >
        <div>
          <span
            className="block text-[11px] font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Total Logged
          </span>
          <span
            className="font-telemetry mt-0.5 block text-base font-bold"
            style={{ color: 'var(--ink-primary)' }}
          >
            {formatUsd(chipInTotalCents)}
          </span>
        </div>
        <div>
          <span
            className="block text-[11px] font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Event Target
          </span>
          <span
            className="font-telemetry mt-0.5 block text-base font-bold"
            style={{ color: 'var(--ink-primary)' }}
          >
            {formatUsd(event.chipInTargetCents)}
          </span>
        </div>
        <div>
          <span
            className="block text-[11px] font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Entries
          </span>
          <span
            className="font-telemetry mt-0.5 block text-base font-bold"
            style={{ color: 'var(--ink-primary)' }}
          >
            {sortedEntries.length}
          </span>
        </div>
      </div>

      {/* Add new chip-in entry */}
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-md border p-3.5"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
        noValidate
      >
        <p
          className="text-xs font-bold tracking-wider uppercase"
          style={{ color: 'var(--ink-secondary)' }}
        >
          Record Off-App Chip-In
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="org-chipin-participant"
              className={LABEL_CLASS}
              style={{ color: 'var(--ink-secondary)' }}
            >
              Participant (optional)
            </label>
            <select
              id="org-chipin-participant"
              value={newParticipantId}
              onChange={(e) => setNewParticipantId(e.target.value)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            >
              <option value="">Anonymous / Unlisted</option>
              {sortedParticipants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.displayName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="org-chipin-amount"
              className={LABEL_CLASS}
              style={{ color: 'var(--ink-secondary)' }}
            >
              Chip-in amount ($)
            </label>
            <input
              id="org-chipin-amount"
              type="text"
              inputMode="decimal"
              value={newAmountDollars}
              onChange={(e) => {
                setNewAmountDollars(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="15.00"
              className={`${INPUT_CLASS} font-telemetry`}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="org-chipin-note"
            className={LABEL_CLASS}
            style={{ color: 'var(--ink-secondary)' }}
          >
            Ledger note (optional)
          </label>
          <input
            id="org-chipin-note"
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="e.g. Venmo, Zelle, cash at Basecamp"
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </div>

        <button
          type="submit"
          disabled={busy || !isOnline}
          className="pfl-focus-ring inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
          style={{
            backgroundColor: 'var(--accent-amber-cta)',
            color: '#0C1E30',
          }}
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          <span>{!isOnline ? 'Requires connection' : busy ? 'Saving…' : 'Record Chip-In'}</span>
        </button>
      </form>

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

      {/* Existing private ledger entries */}
      {sortedEntries.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          No chip-ins recorded yet.
        </p>
      ) : (
        <ul
          data-testid="chip-in-ledger-list"
          className="m-0 list-none divide-y overflow-hidden rounded-md border p-0"
          style={{
            borderColor: 'var(--border-structural)',
            backgroundColor: 'var(--bg-ground)',
          }}
        >
          {sortedEntries.map((entry) => {
            const label = contributorLabel(entry);
            const isEditing = editDraft?.id === entry.id;
            const formattedTimestamp = formatChipInTimestamp(entry.recordedAt, event.timezone);

            return (
              <li
                key={entry.id}
                className="flex flex-col gap-2.5 p-3"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                {isEditing && editDraft ? (
                  <form onSubmit={handleSaveEdit} className="flex flex-col gap-2.5" noValidate>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`edit-chipin-participant-${entry.id}`}
                          className={LABEL_CLASS}
                          style={{ color: 'var(--ink-secondary)' }}
                        >
                          Edit Participant
                        </label>
                        <select
                          id={`edit-chipin-participant-${entry.id}`}
                          value={editDraft.participantId}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, participantId: e.target.value })
                          }
                          className={INPUT_CLASS}
                          style={INPUT_STYLE}
                        >
                          <option value="">Anonymous / Unlisted</option>
                          {sortedParticipants.map((participant) => (
                            <option key={participant.id} value={participant.id}>
                              {participant.displayName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor={`edit-chipin-amount-${entry.id}`}
                          className={LABEL_CLASS}
                          style={{ color: 'var(--ink-secondary)' }}
                        >
                          Edit amount ($)
                        </label>
                        <input
                          id={`edit-chipin-amount-${entry.id}`}
                          type="text"
                          inputMode="decimal"
                          value={editDraft.amountDollars}
                          onChange={(e) => {
                            setEditDraft({ ...editDraft, amountDollars: e.target.value });
                            if (errorMessage) setErrorMessage(null);
                          }}
                          className={`${INPUT_CLASS} font-telemetry`}
                          style={INPUT_STYLE}
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`edit-chipin-note-${entry.id}`}
                        className={LABEL_CLASS}
                        style={{ color: 'var(--ink-secondary)' }}
                      >
                        Edit note (optional)
                      </label>
                      <input
                        id={`edit-chipin-note-${entry.id}`}
                        type="text"
                        value={editDraft.note}
                        onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
                        className={INPUT_CLASS}
                        style={INPUT_STYLE}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busy || !isOnline}
                        className="pfl-focus-ring inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-md border-0 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
                        style={{
                          backgroundColor: 'var(--shell-header)',
                          color: 'var(--ink-on-shell)',
                        }}
                      >
                        {!isOnline ? 'Requires connection' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditDraft(null)}
                        disabled={busy}
                        className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-bold"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span
                          className="text-sm font-bold"
                          style={{ color: 'var(--ink-primary)' }}
                        >
                          {label}
                        </span>
                        <span
                          className="font-telemetry text-sm font-bold"
                          style={{ color: 'var(--accent-spruce)' }}
                        >
                          {formatUsd(entry.amountCents, { alwaysShowCents: true })}
                        </span>
                      </div>

                      <div
                        className="mt-0.5 flex flex-wrap items-center gap-2 text-xs"
                        style={{ color: 'var(--ink-secondary)' }}
                      >
                        <time dateTime={entry.recordedAt} className="font-telemetry">
                          {formattedTimestamp || entry.recordedAt}
                        </time>
                        {entry.note && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span style={{ color: 'var(--ink-muted)' }}>{entry.note}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Edit chip-in from ${label} (${formatUsd(entry.amountCents, { alwaysShowCents: true })})`}
                        disabled={busy || !isOnline}
                        onClick={() =>
                          setEditDraft({
                            id: entry.id,
                            participantId: entry.participantId ?? '',
                            amountDollars: centsToDollarInput(entry.amountCents),
                            note: entry.note ?? '',
                          })
                        }
                        className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        <Pencil size={13} aria-hidden="true" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        aria-label={`Delete chip-in from ${label} (${formatUsd(entry.amountCents, { alwaysShowCents: true })})`}
                        disabled={busy || !isOnline}
                        onClick={() => void handleDelete(entry)}
                        className="pfl-focus-ring inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md border disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--accent-error)',
                        }}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
