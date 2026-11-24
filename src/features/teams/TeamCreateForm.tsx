import { useState, type FormEvent } from 'react';
import { Check, Lock, Unlock } from 'lucide-react';
import { TEAM_COLOR_PRESETS, TEAM_EMOJI_PRESETS } from './teamScheduleWarnings';

export interface TeamFormValues {
  name: string;
  tagline: string | null;
  colorHex: string | null;
  emoji: string | null;
  isOpen: boolean;
  lookingNote: string | null;
}

interface TeamCreateFormProps {
  mode?: 'create' | 'edit';
  initialValues?: Partial<TeamFormValues>;
  willAutoJoinCreator?: boolean;
  isOnline: boolean;
  busy: boolean;
  onSubmit: (values: TeamFormValues) => Promise<void> | void;
  onCancel: () => void;
}

export function TeamCreateForm({
  mode = 'create',
  initialValues,
  willAutoJoinCreator = true,
  isOnline,
  busy,
  onSubmit,
  onCancel,
}: TeamCreateFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [tagline, setTagline] = useState(initialValues?.tagline ?? '');
  const [emoji, setEmoji] = useState(initialValues?.emoji ?? '');
  const [colorHex, setColorHex] = useState<string | null>(initialValues?.colorHex ?? null);
  const [isOpen, setIsOpen] = useState(initialValues?.isOpen ?? true);
  const [lookingNote, setLookingNote] = useState(initialValues?.lookingNote ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Please enter a Team name.');
      return;
    }

    setValidationError(null);
    const trimmedTagline = tagline.trim();
    const trimmedEmoji = emoji.trim();
    const trimmedLooking = lookingNote.trim();

    await onSubmit({
      name: trimmedName,
      tagline: trimmedTagline.length > 0 ? trimmedTagline : null,
      colorHex,
      emoji: trimmedEmoji.length > 0 ? trimmedEmoji : null,
      isOpen,
      lookingNote: trimmedLooking.length > 0 ? trimmedLooking : null,
    });
  }

  return (
    <form
      onSubmit={(e) => void handleFormSubmit(e)}
      className="rounded-md border-[1.5px] p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--shell-header)',
      }}
      noValidate
    >
      <div className="mb-3">
        <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
          {mode === 'create' ? 'Create a Team' : 'Edit Team Details'}
        </h2>
        {mode === 'create' && (
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
            No invite codes needed — 10 placeholder Rounds (1–10) are set up automatically on the
            Event&apos;s primary Course.
            {willAutoJoinCreator
              ? ' You’ll automatically join this Team.'
              : ' Creating as Organizer without changing your own roster spot.'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label
            htmlFor="team-form-name"
            className="mb-1 block text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Team Name
          </label>
          <input
            id="team-form-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder="e.g. Frostbite Fighters"
            className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-base font-semibold"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="team-form-tagline"
            className="mb-1 block text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Tagline (optional)
          </label>
          <input
            id="team-form-tagline"
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. Warm cocoa after every 5K"
            className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-medium"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          />
        </div>

        {/* Emoji picker + input */}
        <div>
          <label
            htmlFor="team-form-emoji"
            className="mb-1 block text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Emoji (optional)
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {TEAM_EMOJI_PRESETS.map((preset) => {
              const selected = emoji === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-label={`Choose emoji ${preset}`}
                  aria-pressed={selected}
                  onClick={() => setEmoji(selected ? '' : preset)}
                  className="pfl-focus-ring flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border-[1.5px] text-lg"
                  style={{
                    backgroundColor: selected ? 'var(--shell-header)' : 'var(--bg-ground)',
                    borderColor: selected ? 'var(--shell-header)' : 'var(--border-structural)',
                  }}
                >
                  {preset}
                </button>
              );
            })}
            <input
              id="team-form-emoji"
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 8))}
              placeholder="Custom"
              className="pfl-focus-ring min-h-[44px] w-24 rounded-md border-[1.5px] px-2.5 text-center text-sm font-semibold"
              style={{
                backgroundColor: 'var(--bg-ground)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-primary)',
              }}
            />
          </div>
        </div>

        {/* Team color accent */}
        <fieldset className="m-0 border-0 p-0">
          <legend
            className="mb-1.5 text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Team Color (optional)
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {TEAM_COLOR_PRESETS.map((preset) => {
              const selected = colorHex === preset.hex;
              return (
                <button
                  key={preset.hex}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setColorHex(selected ? null : preset.hex)}
                  className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border-[1.5px] px-2.5 text-xs font-bold"
                  style={{
                    backgroundColor: selected ? 'var(--bg-rail)' : 'var(--bg-ground)',
                    borderColor: selected ? 'var(--shell-header)' : 'var(--border-structural)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-4 w-4 rounded-full border"
                    style={{ backgroundColor: preset.hex, borderColor: 'var(--border-strong)' }}
                  />
                  <span>{preset.label}</span>
                  {selected && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Open / Closed toggle */}
        <fieldset className="m-0 border-0 p-0">
          <legend
            className="mb-1.5 text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Team Roster Status
          </legend>
          <div role="radiogroup" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <button
              type="button"
              role="radio"
              aria-checked={isOpen}
              onClick={() => setIsOpen(true)}
              className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-md border-[1.5px] px-3 py-2 text-left text-sm font-bold"
              style={{
                backgroundColor: isOpen ? 'var(--shell-header)' : 'var(--bg-ground)',
                borderColor: isOpen ? 'var(--shell-header)' : 'var(--border-structural)',
                color: isOpen ? 'var(--ink-on-shell)' : 'var(--ink-primary)',
              }}
            >
              <span className="flex items-center gap-2">
                <Unlock size={15} strokeWidth={2.2} aria-hidden="true" />
                <span>Open (one-tap join)</span>
              </span>
              {isOpen && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!isOpen}
              onClick={() => setIsOpen(false)}
              className="pfl-focus-ring flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-md border-[1.5px] px-3 py-2 text-left text-sm font-bold"
              style={{
                backgroundColor: !isOpen ? 'var(--shell-header)' : 'var(--bg-ground)',
                borderColor: !isOpen ? 'var(--shell-header)' : 'var(--border-structural)',
                color: !isOpen ? 'var(--ink-on-shell)' : 'var(--ink-primary)',
              }}
            >
              <span className="flex items-center gap-2">
                <Lock size={15} strokeWidth={2.2} aria-hidden="true" />
                <span>Closed</span>
              </span>
              {!isOpen && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
            </button>
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="team-form-looking-note"
            className="mb-1 block text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Looking-for note (optional)
          </label>
          <input
            id="team-form-looking-note"
            type="text"
            value={lookingNote}
            onChange={(e) => setLookingNote(e.target.value)}
            placeholder="e.g. Looking for 2 Runners to cover Rounds 6–10"
            className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-medium"
            style={{
              backgroundColor: 'var(--bg-ground)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          />
        </div>

        {validationError && (
          <div
            role="alert"
            className="rounded-md border px-3 py-2 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--accent-error-bg)',
              borderColor: 'var(--accent-error-border)',
              color: 'var(--accent-error)',
            }}
          >
            {validationError}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || !isOnline}
            className="pfl-focus-ring flex min-h-[48px] flex-1 cursor-pointer items-center justify-center rounded-md border-0 px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-65"
            style={{
              backgroundColor: 'var(--accent-amber-cta)',
              color: '#0C1E30',
            }}
          >
            {!isOnline
              ? 'Requires connection'
              : busy
                ? 'Saving…'
                : mode === 'create'
                  ? 'Create Team'
                  : 'Save Team Details'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
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
      </div>
    </form>
  );
}
