import { useEffect, useState, type FormEvent } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { ChipInBreakdownItem, EventRecord } from '../../types/domain';
import { useEventData } from '../../state/EventDataContext';
import { toSafeHttpsUrl } from '../home/urlSafety';

interface BreakdownDraftRow {
  id: string;
  label: string;
  amountDollars: string;
}

interface EventEditorDraft {
  name: string;
  eventDate: string;
  startTime: string;
  timezone: string;
  basecampName: string;
  basecampAddress: string;
  basecampMapsUrl: string;
  parkingAmenitiesNotes: string;
  coldWeatherTips: string;
  safetyFirstAidNotes: string;
  stravaClubUrl: string;
  recapNote: string;
  chipInTargetDollars: string;
  chipInSuggestedDollars: string;
  venmoHandle: string;
  zelleHandle: string;
  breakdownRows: BreakdownDraftRow[];
}

function centsToDollarInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2);
}

function parseDollarInputToCents(raw: string): { ok: true; cents: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, cents: null };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false, error: 'Enter a valid non-negative dollar amount (for example 25 or 25.50).' };
  }
  const value = Math.round(Number(trimmed) * 100);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: 'Dollar amounts cannot be negative.' };
  }
  return { ok: true, cents: value };
}

function createDraftFromEvent(event: EventRecord): EventEditorDraft {
  return {
    name: event.name,
    eventDate: event.eventDate ?? '',
    startTime: event.startTime ?? '',
    timezone: event.timezone ?? '',
    basecampName: event.basecampName ?? '',
    basecampAddress: event.basecampAddress ?? '',
    basecampMapsUrl: event.basecampMapsUrl ?? '',
    parkingAmenitiesNotes: event.parkingAmenitiesNotes ?? '',
    coldWeatherTips: event.coldWeatherTips ?? '',
    safetyFirstAidNotes: event.safetyFirstAidNotes ?? '',
    stravaClubUrl: event.stravaClubUrl ?? '',
    recapNote: event.recapNote ?? '',
    chipInTargetDollars: centsToDollarInput(event.chipInTargetCents),
    chipInSuggestedDollars: centsToDollarInput(event.chipInSuggestedCents),
    venmoHandle: event.venmoHandle ?? '',
    zelleHandle: event.zelleHandle ?? '',
    breakdownRows: event.chipInBreakdown.map((item, idx) => ({
      id: `row-${idx}-${item.label}`,
      label: item.label,
      amountDollars: centsToDollarInput(item.amountCents),
    })),
  };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const INPUT_CLASS =
  'pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-semibold';
const TEXTAREA_CLASS =
  'pfl-focus-ring min-h-[76px] w-full rounded-md border-[1.5px] p-3 text-sm font-medium leading-relaxed';
const LABEL_CLASS = 'mb-1 block text-xs font-bold tracking-wider uppercase';

const INPUT_STYLE = {
  backgroundColor: 'var(--bg-ground)',
  borderColor: 'var(--border-strong)',
  color: 'var(--ink-primary)',
};

export function OrganizerEventEditor() {
  const { eventApi, eventId, snapshot, isOnline, setSnapshot } = useEventData();
  const [draft, setDraft] = useState<EventEditorDraft>(() => createDraftFromEvent(snapshot.event));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(createDraftFromEvent(snapshot.event));
  }, [snapshot.event]);

  function addBreakdownRow() {
    setDraft((prev) => ({
      ...prev,
      breakdownRows: [
        ...prev.breakdownRows,
        { id: `row-${Date.now()}-${prev.breakdownRows.length}`, label: '', amountDollars: '' },
      ],
    }));
  }

  function removeBreakdownRow(rowId: string) {
    setDraft((prev) => ({
      ...prev,
      breakdownRows: prev.breakdownRows.filter((row) => row.id !== rowId),
    }));
  }

  function updateBreakdownRow(rowId: string, patch: Partial<BreakdownDraftRow>) {
    setDraft((prev) => ({
      ...prev,
      breakdownRows: prev.breakdownRows.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row,
      ),
    }));
  }

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOnline) {
      setErrorMessage('Requires connection to save Event settings.');
      return;
    }

    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setErrorMessage('Event name is required.');
      return;
    }

    const rawBasecampMaps = draft.basecampMapsUrl.trim();
    let basecampMapsUrl: string | null = null;
    if (rawBasecampMaps) {
      const safe = toSafeHttpsUrl(rawBasecampMaps);
      if (!safe) {
        setErrorMessage('Basecamp maps URL must be a valid https:// link (500 characters or fewer).');
        return;
      }
      basecampMapsUrl = safe;
    }

    const rawStrava = draft.stravaClubUrl.trim();
    let stravaClubUrl: string | null = null;
    if (rawStrava) {
      const safe = toSafeHttpsUrl(rawStrava);
      if (!safe) {
        setErrorMessage('Strava Club URL must be a valid https:// link (500 characters or fewer).');
        return;
      }
      stravaClubUrl = safe;
    }

    const rawStartTime = draft.startTime.trim();
    let startTime: string | null = null;
    if (rawStartTime) {
      const parsedMs = Date.parse(rawStartTime);
      if (Number.isNaN(parsedMs)) {
        setErrorMessage('Start time must be a valid ISO timestamp (e.g. 2027-01-09T13:00:00.000Z).');
        return;
      }
      startTime = new Date(parsedMs).toISOString();
    }

    const targetParsed = parseDollarInputToCents(draft.chipInTargetDollars);
    if (!targetParsed.ok) {
      setErrorMessage(`Chip-in target: ${targetParsed.error}`);
      return;
    }
    const suggestedParsed = parseDollarInputToCents(draft.chipInSuggestedDollars);
    if (!suggestedParsed.ok) {
      setErrorMessage(`Suggested amount: ${suggestedParsed.error}`);
      return;
    }

    const chipInBreakdown: ChipInBreakdownItem[] = [];
    for (const row of draft.breakdownRows) {
      const label = row.label.trim();
      const amountRaw = row.amountDollars.trim();
      if (!label && !amountRaw) continue;
      if (!label) {
        setErrorMessage('Each cost breakdown item needs a label.');
        return;
      }
      const parsedAmount = parseDollarInputToCents(amountRaw);
      if (!parsedAmount.ok || parsedAmount.cents == null) {
        setErrorMessage(`Breakdown item "${label}": enter a valid dollar amount.`);
        return;
      }
      chipInBreakdown.push({ label, amountCents: parsedAmount.cents });
    }

    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const updated = await eventApi.updateEvent(eventId, {
        name: trimmedName,
        eventDate: optionalText(draft.eventDate),
        startTime,
        timezone: optionalText(draft.timezone),
        basecampName: optionalText(draft.basecampName),
        basecampAddress: optionalText(draft.basecampAddress),
        basecampMapsUrl,
        parkingAmenitiesNotes: optionalText(draft.parkingAmenitiesNotes),
        coldWeatherTips: optionalText(draft.coldWeatherTips),
        safetyFirstAidNotes: optionalText(draft.safetyFirstAidNotes),
        stravaClubUrl,
        recapNote: optionalText(draft.recapNote),
        chipInTargetCents: targetParsed.cents ?? 0,
        chipInSuggestedCents: suggestedParsed.cents,
        chipInBreakdown,
        venmoHandle: optionalText(draft.venmoHandle),
        zelleHandle: optionalText(draft.zelleHandle),
      });

      setSnapshot((prev) => ({ ...prev, event: updated }));
      setStatusMessage('Event settings saved.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not save Event settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          Edit Event &amp; Basecamp Details
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          Updates appear immediately on Home for all Participants.
        </p>
      </div>

      {/* Core Event schedule & identity */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="org-event-name" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Event name
          </label>
          <input
            id="org-event-name"
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label htmlFor="org-event-date" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Event date
          </label>
          <input
            id="org-event-date"
            type="date"
            value={draft.eventDate}
            onChange={(e) => setDraft({ ...draft, eventDate: e.target.value })}
            className={`${INPUT_CLASS} font-telemetry`}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label htmlFor="org-event-timezone" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Timezone
          </label>
          <input
            id="org-event-timezone"
            type="text"
            list="org-timezone-suggestions"
            value={draft.timezone}
            onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            placeholder="America/New_York"
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
          <datalist id="org-timezone-suggestions">
            <option value="America/New_York" />
            <option value="America/Chicago" />
            <option value="America/Denver" />
            <option value="America/Los_Angeles" />
            <option value="UTC" />
          </datalist>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="org-event-start-time" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Start time (ISO timestamp)
          </label>
          <input
            id="org-event-start-time"
            type="text"
            value={draft.startTime}
            onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
            placeholder="2027-01-09T13:00:00.000Z"
            className={`${INPUT_CLASS} font-telemetry`}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      {/* Basecamp logistics */}
      <div
        className="flex flex-col gap-3 border-t pt-3.5"
        style={{ borderColor: 'var(--border-hairline)' }}
      >
        <p className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
          Basecamp Logistics
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="org-basecamp-name" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              Basecamp name
            </label>
            <input
              id="org-basecamp-name"
              type="text"
              value={draft.basecampName}
              onChange={(e) => setDraft({ ...draft, basecampName: e.target.value })}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>

          <div>
            <label htmlFor="org-basecamp-address" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              Basecamp address
            </label>
            <input
              id="org-basecamp-address"
              type="text"
              value={draft.basecampAddress}
              onChange={(e) => setDraft({ ...draft, basecampAddress: e.target.value })}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="org-basecamp-maps-url" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              Basecamp maps URL (optional https://)
            </label>
            <input
              id="org-basecamp-maps-url"
              type="url"
              value={draft.basecampMapsUrl}
              onChange={(e) => setDraft({ ...draft, basecampMapsUrl: e.target.value })}
              placeholder="https://maps.google.com/..."
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        <div>
          <label htmlFor="org-parking-notes" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Parking &amp; Basecamp amenities notes
          </label>
          <textarea
            id="org-parking-notes"
            value={draft.parkingAmenitiesNotes}
            onChange={(e) => setDraft({ ...draft, parkingAmenitiesNotes: e.target.value })}
            className={TEXTAREA_CLASS}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label htmlFor="org-cold-tips" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Cold-weather gear tips
          </label>
          <textarea
            id="org-cold-tips"
            value={draft.coldWeatherTips}
            onChange={(e) => setDraft({ ...draft, coldWeatherTips: e.target.value })}
            className={TEXTAREA_CLASS}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label htmlFor="org-safety-notes" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Safety &amp; first-aid notes
          </label>
          <textarea
            id="org-safety-notes"
            value={draft.safetyFirstAidNotes}
            onChange={(e) => setDraft({ ...draft, safetyFirstAidNotes: e.target.value })}
            className={TEXTAREA_CLASS}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label htmlFor="org-strava-url" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Strava Club URL (optional https://)
          </label>
          <input
            id="org-strava-url"
            type="url"
            value={draft.stravaClubUrl}
            onChange={(e) => setDraft({ ...draft, stravaClubUrl: e.target.value })}
            placeholder="https://www.strava.com/clubs/..."
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label htmlFor="org-recap-note" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Post-Event recap note
          </label>
          <textarea
            id="org-recap-note"
            value={draft.recapNote}
            onChange={(e) => setDraft({ ...draft, recapNote: e.target.value })}
            placeholder="Optional thank-you note displayed on Event Recap"
            className={TEXTAREA_CLASS}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      {/* Chip-in display settings */}
      <div
        className="flex flex-col gap-3 border-t pt-3.5"
        style={{ borderColor: 'var(--border-hairline)' }}
      >
        <p className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
          Chip-In Display Settings
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="org-chipin-target" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              Chip-in target ($)
            </label>
            <input
              id="org-chipin-target"
              type="text"
              inputMode="decimal"
              value={draft.chipInTargetDollars}
              onChange={(e) => setDraft({ ...draft, chipInTargetDollars: e.target.value })}
              placeholder="300.00"
              className={`${INPUT_CLASS} font-telemetry`}
              style={INPUT_STYLE}
            />
          </div>

          <div>
            <label htmlFor="org-chipin-suggested" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              Suggested amount ($, optional)
            </label>
            <input
              id="org-chipin-suggested"
              type="text"
              inputMode="decimal"
              value={draft.chipInSuggestedDollars}
              onChange={(e) => setDraft({ ...draft, chipInSuggestedDollars: e.target.value })}
              placeholder="15.00"
              className={`${INPUT_CLASS} font-telemetry`}
              style={INPUT_STYLE}
            />
          </div>

          <div>
            <label htmlFor="org-venmo-handle" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              Venmo handle
            </label>
            <input
              id="org-venmo-handle"
              type="text"
              value={draft.venmoHandle}
              onChange={(e) => setDraft({ ...draft, venmoHandle: e.target.value })}
              placeholder="@handle"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>

          <div>
            <label htmlFor="org-zelle-handle" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              Zelle handle
            </label>
            <input
              id="org-zelle-handle"
              type="text"
              value={draft.zelleHandle}
              onChange={(e) => setDraft({ ...draft, zelleHandle: e.target.value })}
              placeholder="email or phone"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        {/* Cost breakdown JSON items */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
              Cost breakdown items
            </span>
            <button
              type="button"
              onClick={addBreakdownRow}
              className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border px-3 text-xs font-bold"
              style={{
                backgroundColor: 'var(--bg-rail-subtle)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            >
              <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
              <span>Add breakdown item</span>
            </button>
          </div>

          {draft.breakdownRows.map((row, idx) => (
            <div key={row.id} className="grid grid-cols-[1fr_110px_44px] items-end gap-2">
              <div>
                <label
                  htmlFor={`breakdown-label-${row.id}`}
                  className="mb-1 block text-[11px] font-semibold"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  Breakdown item label {idx + 1}
                </label>
                <input
                  id={`breakdown-label-${row.id}`}
                  type="text"
                  value={row.label}
                  onChange={(e) => updateBreakdownRow(row.id, { label: e.target.value })}
                  placeholder="Basecamp rental"
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </div>

              <div>
                <label
                  htmlFor={`breakdown-amount-${row.id}`}
                  className="mb-1 block text-[11px] font-semibold"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  Breakdown item amount {idx + 1} ($)
                </label>
                <input
                  id={`breakdown-amount-${row.id}`}
                  type="text"
                  inputMode="decimal"
                  value={row.amountDollars}
                  onChange={(e) => updateBreakdownRow(row.id, { amountDollars: e.target.value })}
                  placeholder="100.00"
                  className={`${INPUT_CLASS} font-telemetry`}
                  style={INPUT_STYLE}
                />
              </div>

              <button
                type="button"
                onClick={() => removeBreakdownRow(row.id)}
                aria-label={`Remove breakdown item ${idx + 1}`}
                className="pfl-focus-ring flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md border"
                style={{
                  backgroundColor: 'var(--bg-ground)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
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

      <button
        type="submit"
        disabled={saving || !isOnline}
        className="pfl-focus-ring inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-md border-0 px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-65"
        style={{
          backgroundColor: 'var(--accent-amber-cta)',
          color: '#0C1E30',
        }}
      >
        {!isOnline ? 'Requires connection' : saving ? 'Saving…' : 'Save Event Settings'}
      </button>
    </form>
  );
}
