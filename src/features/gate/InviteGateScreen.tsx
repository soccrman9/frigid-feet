import { useState, type FormEvent } from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';

interface InviteGateScreenProps {
  slug: string;
  initialError?: string | null;
  submitting: boolean;
  onSubmitCode: (code: string) => Promise<void>;
}

export function InviteGateScreen({
  slug,
  initialError = null,
  submitting,
  onSubmitCode,
}: InviteGateScreenProps) {
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const errorMessage = localError ?? initialError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setLocalError('Enter your Event invite code to continue.');
      return;
    }
    setLocalError(null);
    await onSubmitCode(trimmed);
  }

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
    >
      <header
        className="flex h-12 shrink-0 items-center justify-between border-b pl-3.5 pr-1"
        style={{
          backgroundColor: 'var(--shell-header)',
          borderColor: 'var(--shell-header-border)',
          color: 'var(--ink-on-shell)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold tracking-tight">Winter Grind 50K</span>
          <span
            className="font-telemetry rounded border px-1.5 py-0.5 text-xs font-bold"
            style={{
              backgroundColor: 'var(--shell-dock)',
              borderColor: 'var(--border-strong)',
              color: 'var(--accent-glacier)',
            }}
          >
            {slug}
          </span>
        </div>
        <ThemeToggleButton />
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <section
          aria-labelledby="invite-gate-heading"
          className="w-full max-w-md rounded-lg border-[1.5px] p-5"
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
              <Lock size={20} strokeWidth={2.2} aria-hidden="true" />
            </div>
            <div>
              <p
                className="text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Private Event Access
              </p>
              <h1
                id="invite-gate-heading"
                className="text-lg font-bold leading-snug"
                style={{ color: 'var(--ink-primary)' }}
              >
                Enter Event Invite Code
              </h1>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            No account or password needed. Enter the invite code from your friend or open the
            shareable Event link to jump straight into Basecamp.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3" noValidate>
            <div>
              <label
                htmlFor="event-invite-code"
                className="mb-1.5 block text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Invite code
              </label>
              <input
                id="event-invite-code"
                name="inviteCode"
                type="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (localError) setLocalError(null);
                }}
                placeholder="e.g. WINTER50K"
                aria-invalid={Boolean(errorMessage)}
                className="pfl-focus-ring font-telemetry min-h-[48px] w-full rounded-md border-[1.5px] px-3.5 text-base font-bold"
                style={{
                  backgroundColor: 'var(--bg-ground)',
                  borderColor: errorMessage ? 'var(--accent-error)' : 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              />
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-md border px-3 py-2.5 text-sm font-semibold"
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
              disabled={submitting}
              className="pfl-focus-ring mt-1 flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-4 text-base font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-65"
              style={{
                backgroundColor: 'var(--accent-amber-cta)',
                color: '#0C1E30',
              }}
            >
              <span>{submitting ? 'Unlocking Event…' : 'Unlock Event'}</span>
              <ArrowRight size={18} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
