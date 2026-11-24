import { useState, type FormEvent } from 'react';
import { Check, Pencil, Pin, PinOff, Send, Trash2 } from 'lucide-react';
import type { Announcement } from '../../types/domain';
import { useEventData } from '../../state/EventDataContext';
import { sortAnnouncementsPinnedFirst } from '../home/AnnouncementsFeed';

interface EditAnnouncementDraft {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
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

function announcementLabel(item: Announcement): string {
  if (item.title && item.title.trim()) return item.title.trim();
  return item.body.slice(0, 32);
}

export function OrganizerAnnouncementsEditor() {
  const { eventApi, eventId, snapshot, isOnline, setSnapshot } = useEventData();
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newPinned, setNewPinned] = useState(false);

  const [editDraft, setEditDraft] = useState<EditAnnouncementDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sorted = sortAnnouncementsPinnedFirst(snapshot.announcements);

  async function handleCreate(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isOnline) {
      setErrorMessage('Requires connection to post Announcements.');
      return;
    }

    const body = newBody.trim();
    if (!body) {
      setErrorMessage('Announcement message cannot be empty.');
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const created = await eventApi.createAnnouncement(eventId, {
        title: newTitle.trim() || null,
        body,
        isPinned: newPinned,
      });

      setSnapshot((prev) => ({
        ...prev,
        announcements: sortAnnouncementsPinnedFirst([created, ...prev.announcements]),
      }));
      setNewTitle('');
      setNewBody('');
      setNewPinned(false);
      setStatusMessage('Announcement posted.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not post Announcement.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePin(item: Announcement) {
    if (!isOnline) return;
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const updated = await eventApi.updateAnnouncement(eventId, item.id, {
        isPinned: !item.isPinned,
      });
      setSnapshot((prev) => ({
        ...prev,
        announcements: sortAnnouncementsPinnedFirst(
          prev.announcements.map((a) => (a.id === updated.id ? updated : a)),
        ),
      }));
      setStatusMessage(updated.isPinned ? 'Announcement pinned.' : 'Announcement unpinned.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not update Announcement.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!editDraft) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to save Announcement changes.');
      return;
    }

    const body = editDraft.body.trim();
    if (!body) {
      setErrorMessage('Announcement message cannot be empty.');
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const updated = await eventApi.updateAnnouncement(eventId, editDraft.id, {
        title: editDraft.title.trim() || null,
        body,
        isPinned: editDraft.isPinned,
      });
      setSnapshot((prev) => ({
        ...prev,
        announcements: sortAnnouncementsPinnedFirst(
          prev.announcements.map((a) => (a.id === updated.id ? updated : a)),
        ),
      }));
      setEditDraft(null);
      setStatusMessage('Announcement updated.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not update Announcement.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item: Announcement) {
    if (!isOnline) return;
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.deleteAnnouncement(eventId, item.id);
      setSnapshot((prev) => ({
        ...prev,
        announcements: prev.announcements.filter((a) => a.id !== item.id),
      }));
      if (editDraft?.id === item.id) {
        setEditDraft(null);
      }
      setStatusMessage('Announcement deleted.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not delete Announcement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          Manage Announcements
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          Post weather, Course, or Basecamp updates. Pinned items appear first on Home.
        </p>
      </div>

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-md border p-3.5"
        style={{
          backgroundColor: 'var(--bg-rail-subtle)',
          borderColor: 'var(--border-structural)',
        }}
        noValidate
      >
        <div>
          <label htmlFor="org-ann-title" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Announcement title (optional)
          </label>
          <input
            id="org-ann-title"
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Weather & footing update"
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label htmlFor="org-ann-body" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
            Announcement message
          </label>
          <textarea
            id="org-ann-body"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Share a friendly update for everyone at Basecamp..."
            className={TEXTAREA_CLASS}
            style={INPUT_STYLE}
          />
        </div>

        <label
          className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-structural)',
          }}
        >
          <input
            type="checkbox"
            checked={newPinned}
            onChange={(e) => setNewPinned(e.target.checked)}
            className="h-5 w-5 accent-[#163A59]"
          />
          <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
            Pin to top of Home
          </span>
        </label>

        <button
          type="submit"
          disabled={busy || !isOnline}
          className="pfl-focus-ring inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
          style={{
            backgroundColor: 'var(--accent-amber-cta)',
            color: '#0C1E30',
          }}
        >
          <Send size={15} strokeWidth={2.5} aria-hidden="true" />
          <span>{!isOnline ? 'Requires connection' : busy ? 'Posting…' : 'Post Announcement'}</span>
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

      {/* Existing Announcements management list */}
      {sorted.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          No Announcements posted yet.
        </p>
      ) : (
        <ul
          className="m-0 list-none divide-y overflow-hidden rounded-md border p-0"
          style={{
            borderColor: 'var(--border-structural)',
            backgroundColor: 'var(--bg-ground)',
          }}
        >
          {sorted.map((item) => {
            const label = announcementLabel(item);
            const isEditing = editDraft?.id === item.id;

            return (
              <li
                key={item.id}
                className="flex flex-col gap-2.5 p-3"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                {isEditing && editDraft ? (
                  <form onSubmit={handleSaveEdit} className="flex flex-col gap-2.5" noValidate>
                    <div>
                      <label
                        htmlFor={`edit-ann-title-${item.id}`}
                        className={LABEL_CLASS}
                        style={{ color: 'var(--ink-secondary)' }}
                      >
                        Edit announcement title
                      </label>
                      <input
                        id={`edit-ann-title-${item.id}`}
                        type="text"
                        value={editDraft.title}
                        onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                        className={INPUT_CLASS}
                        style={INPUT_STYLE}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor={`edit-ann-body-${item.id}`}
                        className={LABEL_CLASS}
                        style={{ color: 'var(--ink-secondary)' }}
                      >
                        Edit announcement message
                      </label>
                      <textarea
                        id={`edit-ann-body-${item.id}`}
                        value={editDraft.body}
                        onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })}
                        className={TEXTAREA_CLASS}
                        style={INPUT_STYLE}
                      />
                    </div>

                    <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={editDraft.isPinned}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, isPinned: e.target.checked })
                        }
                        className="h-5 w-5 accent-[#163A59]"
                      />
                      <span style={{ color: 'var(--ink-primary)' }}>Pinned</span>
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busy || !isOnline}
                        className="pfl-focus-ring inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-md border-0 px-3 text-sm font-bold"
                        style={{
                          backgroundColor: 'var(--shell-header)',
                          color: 'var(--ink-on-shell)',
                        }}
                      >
                        Save Changes
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
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {item.title && (
                          <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                            {item.title}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                          {item.body}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={item.isPinned ? `Unpin ${label}` : `Pin ${label}`}
                        disabled={!isOnline || busy}
                        onClick={() => void handleTogglePin(item)}
                        className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          backgroundColor: item.isPinned
                            ? 'var(--accent-amber-soft)'
                            : 'var(--bg-surface)',
                          borderColor: item.isPinned
                            ? 'var(--accent-amber)'
                            : 'var(--border-strong)',
                          color: item.isPinned ? 'var(--accent-amber-ink)' : 'var(--ink-primary)',
                        }}
                      >
                        {item.isPinned ? (
                          <>
                            <PinOff size={14} aria-hidden="true" />
                            <span>Unpin</span>
                          </>
                        ) : (
                          <>
                            <Pin size={14} aria-hidden="true" />
                            <span>Pin</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        aria-label={`Edit ${label}`}
                        disabled={busy}
                        onClick={() =>
                          setEditDraft({
                            id: item.id,
                            title: item.title ?? '',
                            body: item.body,
                            isPinned: item.isPinned,
                          })
                        }
                        className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-bold"
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
                        aria-label={`Delete ${label}`}
                        disabled={!isOnline || busy}
                        onClick={() => void handleDelete(item)}
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
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
