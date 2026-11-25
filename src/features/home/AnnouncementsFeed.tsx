import { Megaphone, Pin } from 'lucide-react';
import type { Announcement } from '../../types/domain';

interface AnnouncementsFeedProps {
  announcements: Announcement[];
  timezone?: string | null;
}

function formatAnnouncementTime(isoString: string, timezone?: string | null): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const baseOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  try {
    return new Intl.DateTimeFormat('en-US', {
      ...baseOptions,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', baseOptions).format(date);
  }
}

export function sortAnnouncementsPinnedFirst(announcements: Announcement[]): Announcement[] {
  return [...announcements].sort((a, b) => {
    const pinnedDiff = Number(b.isPinned) - Number(a.isPinned);
    if (pinnedDiff !== 0) return pinnedDiff;

    const timeA = Date.parse(a.createdAt);
    const timeB = Date.parse(b.createdAt);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeB !== timeA) {
      return timeB - timeA;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function AnnouncementsFeed({ announcements, timezone }: AnnouncementsFeedProps) {
  const sorted = sortAnnouncementsPinnedFirst(announcements);
  const pinnedCount = sorted.filter((item) => item.isPinned).length;

  return (
    <section aria-labelledby="home-announcements-heading" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <Megaphone
            size={15}
            strokeWidth={2.25}
            aria-hidden="true"
            style={{ color: 'var(--ink-secondary)' }}
          />
          <h2
            id="home-announcements-heading"
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Announcements
          </h2>
        </div>
        {sorted.length > 0 && (
          <span
            className="font-telemetry text-xs font-bold"
            style={{ color: 'var(--ink-muted)' }}
          >
            {pinnedCount > 0
              ? `${pinnedCount} pinned · ${sorted.length} total`
              : `${sorted.length} ${sorted.length === 1 ? 'update' : 'updates'}`}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div
          className="rounded-md border px-3.5 py-4 text-sm"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-structural)',
            color: 'var(--ink-muted)',
          }}
        >
          No Organizer announcements yet — check back closer to Event morning for weather,
          Course, and Basecamp updates.
        </div>
      ) : (
        <ul
          className="m-0 list-none overflow-hidden rounded-md border p-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
          }}
        >
          {sorted.map((item, idx) => {
            const formattedTime = formatAnnouncementTime(item.createdAt, timezone);
            return (
              <li
                key={item.id}
                className="px-3.5 py-3"
                style={{
                  backgroundColor: item.isPinned ? 'var(--bg-out-row)' : 'var(--bg-surface)',
                  borderBottom:
                    idx < sorted.length - 1 ? '1px solid var(--border-hairline)' : 'none',
                  borderLeft: item.isPinned ? '4px solid var(--accent-amber)' : 'none',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {item.isPinned && (
                      <span
                        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase"
                        style={{
                          backgroundColor: 'var(--accent-amber-soft)',
                          borderColor: 'var(--accent-amber)',
                          color: 'var(--accent-amber-ink)',
                        }}
                      >
                        <Pin size={12} strokeWidth={2.5} aria-hidden="true" />
                        <span>Pinned</span>
                      </span>
                    )}
                    {item.title && (
                      <h3
                        className="text-[15px] font-bold"
                        style={{ color: 'var(--ink-primary)' }}
                      >
                        {item.title}
                      </h3>
                    )}
                  </div>
                  {formattedTime && (
                    <time
                      dateTime={item.createdAt}
                      className="font-telemetry text-xs font-semibold whitespace-nowrap"
                      style={{ color: 'var(--ink-secondary)' }}
                    >
                      {formattedTime}
                    </time>
                  )}
                </div>

                <p
                  className="mt-1.5 text-sm leading-relaxed whitespace-pre-line"
                  style={{ color: 'var(--ink-muted)' }}
                >
                  {item.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
