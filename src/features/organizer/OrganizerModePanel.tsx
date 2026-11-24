import { useState, type FormEvent, type ReactNode } from 'react';
import {
  CalendarCog,
  Download,
  KeyRound,
  Lock,
  Megaphone,
  Route,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { useEventData } from '../../state/EventDataContext';
import { OrganizerAnnouncementsEditor } from './OrganizerAnnouncementsEditor';
import { OrganizerCoursesEditor } from './OrganizerCoursesEditor';
import { OrganizerEventEditor } from './OrganizerEventEditor';
import { OrganizerExportSection } from './OrganizerExportSection';
import { OrganizerSecretsSection } from './OrganizerSecretsSection';

export type OrganizerSectionId =
  | 'event'
  | 'courses'
  | 'announcements'
  | 'secrets'
  | 'export'
  | string;

export interface OrganizerTabExtension {
  id: string;
  label: string;
  icon?: ReactNode;
  render: () => ReactNode;
}

interface OrganizerModePanelProps {
  /** Extension slots for downstream features (Chip-Ins, Supplies & Teams, Badges, Export). */
  extraTabs?: ReadonlyArray<OrganizerTabExtension>;
  renderEventEditor?: () => ReactNode;
  renderCoursesEditor?: () => ReactNode;
  renderAnnouncementsEditor?: () => ReactNode;
  renderSecretsSection?: () => ReactNode;
  renderExportSection?: () => ReactNode;
}

export function OrganizerModePanel({
  extraTabs = [],
  renderEventEditor,
  renderCoursesEditor,
  renderAnnouncementsEditor,
  renderSecretsSection,
  renderExportSection,
}: OrganizerModePanelProps) {
  const { isOrganizer, isOnline, unlockOrganizer, lockOrganizer } = useEventData();
  const [promptOpen, setPromptOpen] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OrganizerSectionId>('event');

  async function handleUnlockSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOnline) {
      setErrorMessage('Requires connection to unlock Organizer Mode.');
      return;
    }
    if (!passcode.trim()) {
      setErrorMessage('Enter the Event Organizer passcode.');
      return;
    }

    setUnlocking(true);
    setErrorMessage(null);
    try {
      const ok = await unlockOrganizer(passcode);
      if (!ok) {
        setErrorMessage('Passcode did not match this Event.');
        return;
      }
      setPasscode('');
      setPromptOpen(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not verify Organizer passcode.',
      );
    } finally {
      setUnlocking(false);
    }
  }

  function handleLockExit() {
    lockOrganizer();
    setPasscode('');
    setErrorMessage(null);
    setPromptOpen(false);
  }

  if (!isOrganizer) {
    return (
      <section
        aria-labelledby="organizer-entry-heading"
        className="rounded-md border px-3.5 py-3"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield
              size={15}
              strokeWidth={2.25}
              aria-hidden="true"
              style={{ color: 'var(--ink-secondary)' }}
            />
            <span
              id="organizer-entry-heading"
              className="text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Event Organizers
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setPromptOpen((prev) => !prev);
              setErrorMessage(null);
            }}
            aria-expanded={promptOpen}
            className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-bold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-primary)',
            }}
          >
            <KeyRound size={15} strokeWidth={2.25} aria-hidden="true" />
            <span>Organizer Mode</span>
          </button>
        </div>

        {promptOpen && (
          <form
            onSubmit={handleUnlockSubmit}
            className="mt-3 flex flex-col gap-2.5 border-t pt-3"
            style={{ borderColor: 'var(--border-hairline)' }}
            noValidate
          >
            <div>
              <label
                htmlFor="organizer-passcode-input"
                className="mb-1 block text-xs font-bold tracking-wider uppercase"
                style={{ color: 'var(--ink-secondary)' }}
              >
                Organizer passcode
              </label>
              <input
                id="organizer-passcode-input"
                type="password"
                autoComplete="off"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Enter shared Organizer passcode"
                className="pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-base font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              />
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

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={unlocking || !isOnline}
                className="pfl-focus-ring inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 px-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
                style={{
                  backgroundColor: 'var(--shell-header)',
                  color: 'var(--ink-on-shell)',
                }}
              >
                <span>
                  {!isOnline
                    ? 'Requires connection'
                    : unlocking
                      ? 'Checking…'
                      : 'Unlock Organizer Mode'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPromptOpen(false);
                  setPasscode('');
                  setErrorMessage(null);
                }}
                disabled={unlocking}
                className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-3.5 text-sm font-bold"
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
        )}
      </section>
    );
  }

  const coreTabs: ReadonlyArray<{ id: OrganizerSectionId; label: string; icon: ReactNode }> = [
    { id: 'event', label: 'Event', icon: <CalendarCog size={15} strokeWidth={2.25} aria-hidden="true" /> },
    { id: 'courses', label: 'Courses', icon: <Route size={15} strokeWidth={2.25} aria-hidden="true" /> },
    { id: 'announcements', label: 'Announcements', icon: <Megaphone size={15} strokeWidth={2.25} aria-hidden="true" /> },
    { id: 'secrets', label: 'Access & QR', icon: <KeyRound size={15} strokeWidth={2.25} aria-hidden="true" /> },
    { id: 'export', label: 'Export', icon: <Download size={15} strokeWidth={2.25} aria-hidden="true" /> },
  ];

  const allTabs = [
    ...coreTabs,
    ...extraTabs.map((ext) => ({ id: ext.id, label: ext.label, icon: ext.icon ?? null })),
  ];

  const activeExtension = extraTabs.find((ext) => ext.id === activeTab) ?? null;

  return (
    <section
      aria-labelledby="organizer-workspace-heading"
      data-testid="organizer-workspace"
      className="overflow-hidden rounded-md border-[2px]"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--accent-amber)',
      }}
    >
      {/* Active Organizer indicator bar + quick lock/exit action */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
        style={{
          backgroundColor: 'var(--shell-dock)',
          color: 'var(--ink-on-shell)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold tracking-wide uppercase"
            style={{
              backgroundColor: 'var(--accent-amber-cta)',
              borderColor: 'var(--accent-amber)',
              color: '#0C1E30',
            }}
          >
            <ShieldCheck size={14} strokeWidth={2.5} aria-hidden="true" />
            <span id="organizer-workspace-heading">Organizer Mode Active</span>
          </span>
        </div>

        <button
          type="button"
          onClick={handleLockExit}
          className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-bold"
          style={{
            backgroundColor: 'var(--shell-header)',
            borderColor: 'var(--border-strong)',
            color: 'var(--ink-on-shell)',
          }}
        >
          <Lock size={14} strokeWidth={2.4} aria-hidden="true" />
          <span>Lock / Exit</span>
        </button>
      </div>

      {/* Section tabs (44px+ gloved touch targets) */}
      <div
        role="tablist"
        aria-label="Organizer sections"
        className="flex flex-wrap gap-1 border-b p-2"
        style={{
          backgroundColor: 'var(--bg-rail)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        {allTabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className="pfl-focus-ring inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-bold whitespace-nowrap"
              style={{
                backgroundColor: selected ? 'var(--shell-header)' : 'var(--bg-surface)',
                borderColor: selected ? 'var(--shell-header)' : 'var(--border-structural)',
                color: selected ? 'var(--ink-on-shell)' : 'var(--ink-primary)',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="p-3.5" role="tabpanel">
        {activeTab === 'event' && (renderEventEditor ? renderEventEditor() : <OrganizerEventEditor />)}
        {activeTab === 'courses' && (renderCoursesEditor ? renderCoursesEditor() : <OrganizerCoursesEditor />)}
        {activeTab === 'announcements' &&
          (renderAnnouncementsEditor ? renderAnnouncementsEditor() : <OrganizerAnnouncementsEditor />)}
        {activeTab === 'secrets' &&
          (renderSecretsSection ? renderSecretsSection() : <OrganizerSecretsSection />)}
        {activeTab === 'export' &&
          (renderExportSection ? renderExportSection() : <OrganizerExportSection />)}
        {activeExtension && activeExtension.render()}
      </div>
    </section>
  );
}
