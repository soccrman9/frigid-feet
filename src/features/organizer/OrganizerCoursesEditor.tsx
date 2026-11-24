import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Course } from '../../types/domain';
import { useEventData } from '../../state/EventDataContext';
import { parseGpxXml } from '../home/gpxParser';
import { toSafeHttpsUrl } from '../home/urlSafety';

interface CourseDraft {
  id?: string;
  name: string;
  description: string;
  distanceKm: string;
  isPrimary: boolean;
  externalRouteUrl: string;
  gpxXml: string;
  sortOrder: number;
}

function createEmptyCourseDraft(nextSortOrder: number, defaultPrimary: boolean): CourseDraft {
  return {
    name: '',
    description: '',
    distanceKm: '5.0',
    isPrimary: defaultPrimary,
    externalRouteUrl: '',
    gpxXml: '',
    sortOrder: nextSortOrder,
  };
}

function createDraftFromCourse(course: Course): CourseDraft {
  return {
    id: course.id,
    name: course.name,
    description: course.description ?? '',
    distanceKm: String(course.distanceKm),
    isPrimary: course.isPrimary,
    externalRouteUrl: course.externalRouteUrl ?? '',
    gpxXml: course.gpxXml ?? '',
    sortOrder: course.sortOrder,
  };
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the selected .gpx file.'));
    reader.readAsText(file);
  });
}

const INPUT_CLASS =
  'pfl-focus-ring min-h-[44px] w-full rounded-md border-[1.5px] px-3 text-sm font-semibold';
const LABEL_CLASS = 'mb-1 block text-xs font-bold tracking-wider uppercase';
const INPUT_STYLE = {
  backgroundColor: 'var(--bg-ground)',
  borderColor: 'var(--border-strong)',
  color: 'var(--ink-primary)',
};

export function OrganizerCoursesEditor() {
  const { eventApi, eventId, snapshot, isOnline, setSnapshot } = useEventData();
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const orderedCourses = [...snapshot.courses].sort((a, b) => a.sortOrder - b.sortOrder);

  function openNewForm() {
    const nextSortOrder =
      orderedCourses.length > 0
        ? Math.max(...orderedCourses.map((c) => c.sortOrder)) + 1
        : 0;
    setDraft(createEmptyCourseDraft(nextSortOrder, orderedCourses.length === 0));
    setErrorMessage(null);
    setStatusMessage(null);
  }

  function openEditForm(course: Course) {
    setDraft(createDraftFromCourse(course));
    setErrorMessage(null);
    setStatusMessage(null);
  }

  async function handleGpxFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !draft) return;
    try {
      const content = await readFileAsText(file);
      setDraft({ ...draft, gpxXml: content });
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not read .gpx file.');
    }
  }

  async function persistCoursesUpdate(updatedCourses: Course[]) {
    const sorted = [...updatedCourses].sort((a, b) => a.sortOrder - b.sortOrder);
    setSnapshot((prev) => ({ ...prev, courses: sorted }));
  }

  async function handleSaveCourse(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!draft) return;
    if (!isOnline) {
      setErrorMessage('Requires connection to save Courses.');
      return;
    }

    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setErrorMessage('Course name is required.');
      return;
    }

    const parsedDistance = Number(draft.distanceKm.trim());
    if (!Number.isFinite(parsedDistance) || parsedDistance <= 0 || parsedDistance > 99.99) {
      setErrorMessage('Course distance must be between 0.01 and 99.99 km.');
      return;
    }

    const rawUrl = draft.externalRouteUrl.trim();
    let externalRouteUrl: string | null = null;
    if (rawUrl) {
      const safe = toSafeHttpsUrl(rawUrl);
      if (!safe) {
        setErrorMessage('External route URL must be a valid https:// link (500 characters or fewer).');
        return;
      }
      externalRouteUrl = safe;
    }

    const gpxXml = draft.gpxXml.trim() ? draft.gpxXml : null;

    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const nextCoursesMap = new Map(orderedCourses.map((c) => [c.id, c]));

      // Ensure only one Course is marked primary at a time
      if (draft.isPrimary) {
        for (const existing of orderedCourses) {
          if (existing.isPrimary && existing.id !== draft.id) {
            const demoted = await eventApi.upsertCourse(eventId, {
              id: existing.id,
              name: existing.name,
              description: existing.description,
              distanceKm: existing.distanceKm,
              isPrimary: false,
              gpxXml: existing.gpxXml,
              externalRouteUrl: existing.externalRouteUrl,
              sortOrder: existing.sortOrder,
            });
            nextCoursesMap.set(demoted.id, demoted);
          }
        }
      }

      const saved = await eventApi.upsertCourse(eventId, {
        ...(draft.id ? { id: draft.id } : {}),
        name: trimmedName,
        description: draft.description.trim() || null,
        distanceKm: Math.round(parsedDistance * 100) / 100,
        isPrimary: draft.isPrimary,
        gpxXml,
        externalRouteUrl,
        sortOrder: draft.sortOrder,
      });

      nextCoursesMap.set(saved.id, saved);
      await persistCoursesUpdate(Array.from(nextCoursesMap.values()));

      setDraft(null);
      setStatusMessage(`Course saved: ${saved.name}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not save Course.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPrimary(target: Course) {
    if (!isOnline || target.isPrimary) return;
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const nextMap = new Map(orderedCourses.map((c) => [c.id, c]));
      for (const existing of orderedCourses) {
        if (existing.isPrimary && existing.id !== target.id) {
          const demoted = await eventApi.upsertCourse(eventId, {
            id: existing.id,
            name: existing.name,
            description: existing.description,
            distanceKm: existing.distanceKm,
            isPrimary: false,
            gpxXml: existing.gpxXml,
            externalRouteUrl: existing.externalRouteUrl,
            sortOrder: existing.sortOrder,
          });
          nextMap.set(demoted.id, demoted);
        }
      }

      const promoted = await eventApi.upsertCourse(eventId, {
        id: target.id,
        name: target.name,
        description: target.description,
        distanceKm: target.distanceKm,
        isPrimary: true,
        gpxXml: target.gpxXml,
        externalRouteUrl: target.externalRouteUrl,
        sortOrder: target.sortOrder,
      });
      nextMap.set(promoted.id, promoted);
      await persistCoursesUpdate(Array.from(nextMap.values()));
      setStatusMessage(`${target.name} is now the primary Course.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not update primary Course.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReorder(index: number, direction: -1 | 1) {
    if (!isOnline) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= orderedCourses.length) return;

    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const reordered = [...orderedCourses];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(swapIndex, 0, moved);

      const persisted: Course[] = [];
      for (let i = 0; i < reordered.length; i += 1) {
        const course = reordered[i];
        if (course.sortOrder !== i) {
          const updated = await eventApi.upsertCourse(eventId, {
            id: course.id,
            name: course.name,
            description: course.description,
            distanceKm: course.distanceKm,
            isPrimary: course.isPrimary,
            gpxXml: course.gpxXml,
            externalRouteUrl: course.externalRouteUrl,
            sortOrder: i,
          });
          persisted.push(updated);
        } else {
          persisted.push(course);
        }
      }
      await persistCoursesUpdate(persisted);
      setStatusMessage('Course order updated.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not reorder Courses.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(course: Course) {
    if (!isOnline) return;
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await eventApi.deleteCourse(eventId, course.id);
      const remaining = orderedCourses.filter((c) => c.id !== course.id);
      await persistCoursesUpdate(remaining);
      if (draft?.id === course.id) {
        setDraft(null);
      }
      setStatusMessage(`Deleted Course: ${course.name}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not delete Course.');
    } finally {
      setSaving(false);
    }
  }

  const parsedGpx = draft?.gpxXml.trim() ? parseGpxXml(draft.gpxXml) : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
            Manage 5K Courses
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
            Add, edit, reorder, upload .gpx files, and set the primary Basecamp Course.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewForm}
          disabled={!isOnline || saving}
          className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border-0 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
          style={{
            backgroundColor: 'var(--shell-header)',
            color: 'var(--ink-on-shell)',
          }}
        >
          <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
          <span>{!isOnline ? 'Requires connection' : 'Add Course'}</span>
        </button>
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

      {/* Existing Courses list */}
      {orderedCourses.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          No Courses added yet. Tap <strong>Add Course</strong> to publish your first 5K Course.
        </p>
      ) : (
        <ul
          className="m-0 list-none divide-y overflow-hidden rounded-md border p-0"
          style={{
            borderColor: 'var(--border-structural)',
            backgroundColor: 'var(--bg-ground)',
          }}
        >
          {orderedCourses.map((course, idx) => (
            <li
              key={course.id}
              className="flex flex-col gap-2 p-3"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>
                    {course.name}
                  </span>
                  <span className="font-telemetry text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                    {course.distanceKm} km
                  </span>
                  {course.isPrimary && (
                    <span
                      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold uppercase"
                      style={{
                        backgroundColor: 'var(--accent-spruce-soft)',
                        borderColor: 'var(--accent-spruce)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      <Star size={11} strokeWidth={2.5} aria-hidden="true" />
                      <span>Primary</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Move ${course.name} up`}
                    disabled={!isOnline || saving || idx === 0}
                    onClick={() => void handleReorder(idx, -1)}
                    className="pfl-focus-ring flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md border disabled:cursor-not-allowed disabled:opacity-45"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    <ArrowUp size={15} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    aria-label={`Move ${course.name} down`}
                    disabled={!isOnline || saving || idx === orderedCourses.length - 1}
                    onClick={() => void handleReorder(idx, 1)}
                    className="pfl-focus-ring flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md border disabled:cursor-not-allowed disabled:opacity-45"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    <ArrowDown size={15} aria-hidden="true" />
                  </button>

                  {!course.isPrimary && (
                    <button
                      type="button"
                      aria-label={`Set ${course.name} as primary`}
                      disabled={!isOnline || saving}
                      onClick={() => void handleSetPrimary(course)}
                      className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border px-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      <Star size={13} aria-hidden="true" />
                      <span>Set Primary</span>
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label={`Edit ${course.name}`}
                    disabled={!isOnline || saving}
                    onClick={() => openEditForm(course)}
                    className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md border px-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
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
                    aria-label={`Delete ${course.name}`}
                    disabled={!isOnline || saving}
                    onClick={() => void handleDelete(course)}
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
            </li>
          ))}
        </ul>
      )}

      {/* Course Add / Edit Form */}
      {draft && (
        <form
          onSubmit={handleSaveCourse}
          className="flex flex-col gap-3 rounded-md border p-3.5"
          style={{
            backgroundColor: 'var(--bg-rail-subtle)',
            borderColor: 'var(--border-strong)',
          }}
          noValidate
        >
          <p className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--ink-secondary)' }}>
            {draft.id ? 'Edit Course' : 'New Course'}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_130px]">
            <div>
              <label htmlFor="org-course-name" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
                Course name
              </label>
              <input
                id="org-course-name"
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Boardwalk 5K"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </div>

            <div>
              <label htmlFor="org-course-distance" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
                Distance (km)
              </label>
              <input
                id="org-course-distance"
                type="text"
                inputMode="decimal"
                value={draft.distanceKm}
                onChange={(e) => setDraft({ ...draft, distanceKm: e.target.value })}
                className={`${INPUT_CLASS} font-telemetry`}
                style={INPUT_STYLE}
              />
            </div>
          </div>

          <div>
            <label htmlFor="org-course-description" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              Description
            </label>
            <textarea
              id="org-course-description"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Surface notes, hills, turnarounds..."
              className="pfl-focus-ring min-h-[70px] w-full rounded-md border-[1.5px] p-3 text-sm font-medium"
              style={INPUT_STYLE}
            />
          </div>

          <div>
            <label htmlFor="org-course-external-url" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
              External route URL (optional https://)
            </label>
            <input
              id="org-course-external-url"
              type="url"
              value={draft.externalRouteUrl}
              onChange={(e) => setDraft({ ...draft, externalRouteUrl: e.target.value })}
              placeholder="https://www.strava.com/routes/..."
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="org-course-gpx-xml" className={LABEL_CLASS} style={{ color: 'var(--ink-secondary)' }}>
                GPX XML
              </label>
              <label
                htmlFor="org-course-gpx-file"
                className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-bold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              >
                <Upload size={14} aria-hidden="true" />
                <span>Upload .gpx file</span>
                <input
                  id="org-course-gpx-file"
                  type="file"
                  accept=".gpx,.xml,application/gpx+xml,text/xml"
                  onChange={(e) => void handleGpxFileChange(e)}
                  className="sr-only"
                />
              </label>
            </div>

            <textarea
              id="org-course-gpx-xml"
              value={draft.gpxXml}
              onChange={(e) => setDraft({ ...draft, gpxXml: e.target.value })}
              placeholder="Paste .gpx XML or upload a .gpx file above"
              className="pfl-focus-ring font-telemetry min-h-[96px] w-full rounded-md border-[1.5px] p-2.5 text-xs"
              style={INPUT_STYLE}
            />

            {parsedGpx && (
              <p
                className="text-xs font-semibold"
                style={{ color: parsedGpx.ok ? 'var(--accent-spruce)' : 'var(--accent-amber-ink)' }}
              >
                {parsedGpx.ok
                  ? `Valid GPX parsed: ${parsedGpx.points.length} track points.`
                  : `GPX note: ${parsedGpx.error}`}
              </p>
            )}
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
              checked={draft.isPrimary}
              onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })}
              className="h-5 w-5 accent-[#163A59]"
            />
            <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              Primary Course (default for new Team Legs)
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving || !isOnline}
              className="pfl-focus-ring inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-md border-0 px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-65"
              style={{
                backgroundColor: 'var(--accent-amber-cta)',
                color: '#0C1E30',
              }}
            >
              {!isOnline ? 'Requires connection' : saving ? 'Saving…' : 'Save Course'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setErrorMessage(null);
              }}
              disabled={saving}
              className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 text-sm font-bold"
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
    </div>
  );
}
