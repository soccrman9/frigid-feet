import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Footprints,
  MapPin,
  ParkingCircle,
  ShieldCheck,
  Thermometer,
} from 'lucide-react';
import type { Course, EventRecord, Leg, Round, Team } from '../../types/domain';
import { buildBasecampMapsLinks, toSafeHttpsUrl } from './urlSafety';

interface EventInfoSectionProps {
  event: EventRecord;
  rounds: Round[];
  legs: Leg[];
  courses: Course[];
  teams?: Team[];
}

function formatTimeInTimezone(isoString: string, timezone?: string | null): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  try {
    return new Intl.DateTimeFormat('en-US', {
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}

function formatEventDate(eventDate: string | null, startTime: string | null, timezone?: string | null): string | null {
  if (eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    const [year, month, day] = eventDate.split('-').map(Number);
    const utcMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(utcMidday);
  }

  if (startTime) {
    const date = new Date(startTime);
    if (!Number.isNaN(date.getTime())) {
      try {
        return new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          ...(timezone ? { timeZone: timezone } : {}),
        }).format(date);
      } catch {
        return new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }).format(date);
      }
    }
  }

  return null;
}

function formatTimezoneShort(isoString: string | null, timezone?: string | null): string | null {
  if (!timezone) return null;
  const reference = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(reference.getTime())) return timezone;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(reference);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? timezone;
  } catch {
    return timezone;
  }
}

function formatCollectiveKm(totalKm: number): string {
  const rounded = Math.round(totalKm * 10) / 10;
  return `${rounded.toFixed(1)} km`;
}

export function computeCollectiveStats(legs: Leg[], courses: Course[]): {
  completedLegsCount: number;
  totalKm: number;
  outOnCourseCount: number;
} {
  const courseById = new Map(courses.map((course) => [course.id, course]));
  let completedLegsCount = 0;
  let totalKm = 0;
  let outOnCourseCount = 0;

  for (const leg of legs) {
    if (leg.status === 'completed') {
      completedLegsCount += 1;
      const distance = leg.courseId ? courseById.get(leg.courseId)?.distanceKm : undefined;
      totalKm += typeof distance === 'number' && Number.isFinite(distance) ? distance : 5.0;
    } else if (leg.status === 'out_on_course') {
      outOnCourseCount += 1;
    }
  }

  return { completedLegsCount, totalKm, outOnCourseCount };
}

export function EventInfoSection({
  event,
  rounds,
  legs,
  courses,
  teams = [],
}: EventInfoSectionProps) {
  const orderedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const { completedLegsCount, totalKm, outOnCourseCount } = computeCollectiveStats(legs, courses);

  const mapsLinks = buildBasecampMapsLinks(
    event.basecampName,
    event.basecampAddress,
    event.basecampMapsUrl,
  );
  const safeStravaUrl = toSafeHttpsUrl(event.stravaClubUrl);
  const formattedDate = formatEventDate(event.eventDate, event.startTime, event.timezone);

  const firstRound = orderedRounds[0] ?? null;
  const lastRound = orderedRounds[orderedRounds.length - 1] ?? null;
  const startLabel = firstRound
    ? formatTimeInTimezone(firstRound.scheduledStartAt, event.timezone)
    : null;
  const finishIso = lastRound
    ? new Date(Date.parse(lastRound.scheduledStartAt) + 3_600_000).toISOString()
    : null;
  const finishLabel = finishIso ? formatTimeInTimezone(finishIso, event.timezone) : null;
  const tzShort = formatTimezoneShort(
    firstRound?.scheduledStartAt ?? event.startTime,
    event.timezone,
  );

  const plannedTotalKm = teams.length > 0 ? teams.length * 50 : 50;
  const progressPct = Math.min(100, Math.round((totalKm / Math.max(plannedTotalKm, 1)) * 100));

  return (
    <div className="flex flex-col gap-3">
      {/* Collective Event-wide km summary card */}
      <section
        data-testid="collective-km-card"
        aria-labelledby="home-collective-heading"
        className="overflow-hidden rounded-md border p-4"
        style={{
          backgroundColor: 'var(--shell-dock)',
          borderColor: 'var(--shell-header-border)',
          color: 'var(--ink-on-shell)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              id="home-collective-heading"
              className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--accent-glacier)' }}
            >
              <Footprints size={14} strokeWidth={2.25} aria-hidden="true" />
              <span>Collective Distance Together</span>
            </p>
            <div className="mt-1 flex items-baseline gap-2.5">
              <span
                className="font-telemetry text-3xl font-bold tracking-tight"
                style={{ color: 'var(--ink-on-shell)' }}
              >
                {formatCollectiveKm(totalKm)}
              </span>
              <span
                className="font-telemetry text-xs font-semibold"
                style={{ color: 'var(--ink-on-shell-muted)' }}
              >
                {completedLegsCount === 1
                  ? '1 completed Leg'
                  : `${completedLegsCount} completed Legs`}
                {outOnCourseCount > 0 ? ` · ${outOnCourseCount} out now` : ''}
              </span>
            </div>
          </div>

          {teams.length > 0 && (
            <span
              className="font-telemetry rounded border px-2 py-1 text-xs font-bold"
              style={{
                backgroundColor: 'var(--shell-header)',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-on-shell)',
              }}
            >
              {teams.length} {teams.length === 1 ? 'Team' : 'Teams'}
            </span>
          )}
        </div>

        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--shell-header)' }}
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${completedLegsCount > 0 ? Math.max(progressPct, 4) : 0}%`,
              backgroundColor: 'var(--accent-glacier)',
            }}
          />
        </div>

        <p
          className="mt-2 text-xs leading-relaxed font-medium"
          style={{ color: 'var(--ink-on-shell-muted)' }}
        >
          {completedLegsCount === 0
            ? 'Ready for Round 1 — every 5K Leg counts toward our collective Event total.'
            : 'Every 5K Leg brings the group closer together — no speed pressure, just steady winter miles.'}
        </p>
      </section>

      {/* Event Info & Basecamp Logistics */}
      <section
        aria-labelledby="home-event-info-heading"
        className="overflow-hidden rounded-md border"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="p-4">
          <p
            id="home-event-info-heading"
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Event Info &amp; Basecamp
          </p>
          <h1 className="mt-1 text-xl font-bold" style={{ color: 'var(--ink-primary)' }}>
            {event.name}
          </h1>

          {formattedDate && (
            <p
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: 'var(--ink-secondary)' }}
            >
              <CalendarDays size={15} strokeWidth={2.25} aria-hidden="true" />
              <span>{formattedDate}</span>
              {startLabel && finishLabel && (
                <span className="font-telemetry">
                  · {startLabel} – {finishLabel}
                  {tzShort ? ` ${tzShort}` : ''}
                </span>
              )}
            </p>
          )}

          {(event.basecampName || event.basecampAddress || mapsLinks.customMapsUrl) && (
            <div
              className="mt-3 rounded border p-3"
              style={{
                backgroundColor: 'var(--bg-rail-subtle)',
                borderColor: 'var(--border-structural)',
              }}
            >
              <div className="flex items-start gap-2">
                <MapPin
                  size={18}
                  strokeWidth={2.25}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--accent-amber)' }}
                />
                <div className="min-w-0">
                  <p
                    className="text-xs font-bold tracking-wider uppercase"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    Basecamp
                  </p>
                  {event.basecampName && (
                    <p
                      className="mt-0.5 text-[15px] font-bold"
                      style={{ color: 'var(--ink-primary)' }}
                    >
                      {event.basecampName}
                    </p>
                  )}
                  {event.basecampAddress && (
                    <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
                      {event.basecampAddress}
                    </p>
                  )}
                </div>
              </div>

              {(mapsLinks.customMapsUrl || mapsLinks.googleMapsUrl || mapsLinks.appleMapsUrl) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {mapsLinks.customMapsUrl && (
                    <a
                      href={mapsLinks.customMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pfl-focus-ring inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border-0 px-3.5 text-sm font-bold no-underline"
                      style={{
                        backgroundColor: 'var(--shell-header)',
                        color: 'var(--ink-on-shell)',
                      }}
                    >
                      <span>Open Basecamp Map</span>
                      <ExternalLink size={14} strokeWidth={2.25} aria-hidden="true" />
                    </a>
                  )}
                  {mapsLinks.googleMapsUrl && (
                    <a
                      href={mapsLinks.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pfl-focus-ring inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border px-3.5 text-sm font-bold no-underline"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      <span>Google Maps</span>
                      <ExternalLink size={14} strokeWidth={2.25} aria-hidden="true" />
                    </a>
                  )}
                  {mapsLinks.appleMapsUrl && (
                    <a
                      href={mapsLinks.appleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pfl-focus-ring inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border px-3.5 text-sm font-bold no-underline"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      <span>Apple Maps</span>
                      <ExternalLink size={14} strokeWidth={2.25} aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hairline-divided logistics notes */}
        {(event.parkingAmenitiesNotes ||
          event.coldWeatherTips ||
          event.safetyFirstAidNotes ||
          safeStravaUrl) && (
          <div
            className="divide-y border-t"
            style={{
              borderColor: 'var(--border-hairline)',
            }}
          >
            {event.parkingAmenitiesNotes && (
              <div
                className="flex items-start gap-2.5 px-4 py-3"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <ParkingCircle
                  size={18}
                  strokeWidth={2.25}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--ink-secondary)' }}
                />
                <div className="min-w-0">
                  <h2
                    className="text-xs font-bold tracking-wider uppercase"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    Parking &amp; Basecamp Facilities
                  </h2>
                  <p
                    className="mt-1 text-sm leading-relaxed whitespace-pre-line"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {event.parkingAmenitiesNotes}
                  </p>
                </div>
              </div>
            )}

            {event.coldWeatherTips && (
              <div
                className="flex items-start gap-2.5 px-4 py-3"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <Thermometer
                  size={18}
                  strokeWidth={2.25}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--ink-secondary)' }}
                />
                <div className="min-w-0">
                  <h2
                    className="text-xs font-bold tracking-wider uppercase"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    Cold-Weather Gear Tips
                  </h2>
                  <p
                    className="mt-1 text-sm leading-relaxed whitespace-pre-line"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {event.coldWeatherTips}
                  </p>
                </div>
              </div>
            )}

            {event.safetyFirstAidNotes && (
              <div
                className="flex items-start gap-2.5 px-4 py-3"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <ShieldCheck
                  size={18}
                  strokeWidth={2.25}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--accent-spruce)' }}
                />
                <div className="min-w-0">
                  <h2
                    className="text-xs font-bold tracking-wider uppercase"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    Safety &amp; First Aid
                  </h2>
                  <p
                    className="mt-1 text-sm leading-relaxed whitespace-pre-line"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {event.safetyFirstAidNotes}
                  </p>
                </div>
              </div>
            )}

            {safeStravaUrl && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <div className="flex items-center gap-2">
                  <Activity
                    size={16}
                    strokeWidth={2.25}
                    aria-hidden="true"
                    style={{ color: 'var(--ink-secondary)' }}
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
                    Optional friend group club (totally optional)
                  </span>
                </div>
                <a
                  href={safeStravaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pfl-focus-ring inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-bold no-underline"
                  style={{
                    backgroundColor: 'var(--bg-rail-subtle)',
                    borderColor: 'var(--border-structural)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  <span>Strava Club</span>
                  <ExternalLink size={14} strokeWidth={2.25} aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 10-Round Hourly Schedule */}
      <section aria-labelledby="home-schedule-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-0.5">
          <div className="flex items-center gap-1.5">
            <Clock
              size={15}
              strokeWidth={2.25}
              aria-hidden="true"
              style={{ color: 'var(--ink-secondary)' }}
            />
            <h2
              id="home-schedule-heading"
              className="text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--ink-secondary)' }}
            >
              10-Round Hourly Schedule
            </h2>
          </div>
          {startLabel && finishLabel && (
            <span
              className="font-telemetry text-xs font-bold"
              style={{ color: 'var(--ink-muted)' }}
            >
              {startLabel} – {finishLabel}
              {tzShort ? ` (${tzShort})` : ''}
            </span>
          )}
        </div>

        <ol
          data-testid="round-schedule-list"
          className="m-0 grid list-none grid-cols-2 gap-px overflow-hidden rounded-md border p-0 sm:grid-cols-5"
          style={{
            backgroundColor: 'var(--border-hairline)',
            borderColor: 'var(--border-strong)',
          }}
        >
          {orderedRounds.map((round) => {
            const timeLabel = formatTimeInTimezone(round.scheduledStartAt, event.timezone);
            const hasStarted = Boolean(round.startedAt);
            return (
              <li
                key={round.id}
                className="flex flex-col justify-between gap-1 px-3 py-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="text-xs font-bold"
                    style={{ color: 'var(--ink-secondary)' }}
                  >
                    Round {round.roundNumber}
                  </span>
                  {hasStarted && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[11px] font-bold"
                      style={{ color: 'var(--accent-spruce)' }}
                    >
                      <CheckCircle2 size={12} strokeWidth={2.5} aria-hidden="true" />
                      <span>Started</span>
                    </span>
                  )}
                </div>
                <time
                  dateTime={round.scheduledStartAt}
                  className="font-telemetry text-sm font-bold"
                  style={{ color: 'var(--ink-primary)' }}
                >
                  {timeLabel}
                </time>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
