import {
  ChevronRight,
  Download,
  ExternalLink,
  HelpCircle,
  Route,
  Star,
} from 'lucide-react';
import type { Course } from '../../types/domain';
import { CourseMapPreview } from './CourseMapPreview';
import { downloadCourseGpx, parseGpxXml } from './gpxParser';
import { toSafeHttpsUrl } from './urlSafety';
import './home.css';

interface CoursesSectionProps {
  courses: Course[];
  basecampName?: string | null;
}

function formatDistanceKm(distanceKm: number): string {
  if (!Number.isFinite(distanceKm)) return '5.0 km';
  const rounded = Math.round(distanceKm * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded.toFixed(1)} km` : `${rounded} km`;
}

export function CoursesSection({ courses, basecampName }: CoursesSectionProps) {
  const orderedCourses = [...courses].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section aria-labelledby="home-courses-heading" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <Route
            size={15}
            strokeWidth={2.25}
            aria-hidden="true"
            style={{ color: 'var(--ink-secondary)' }}
          />
          <h2
            id="home-courses-heading"
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--ink-secondary)' }}
          >
            Courses
          </h2>
        </div>
        <span className="font-telemetry text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
          {orderedCourses.length === 1
            ? '1 Course from Basecamp'
            : `${orderedCourses.length} Courses from Basecamp`}
        </span>
      </div>

      {orderedCourses.length === 0 ? (
        <div
          className="rounded-md border px-3.5 py-4 text-sm"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-structural)',
            color: 'var(--ink-muted)',
          }}
        >
          Courses will be posted here soon — every 5K Leg starts and finishes at Basecamp.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orderedCourses.map((course) => {
            const safeRouteUrl = toSafeHttpsUrl(course.externalRouteUrl);
            const parsedGpx = parseGpxXml(course.gpxXml);
            const canDownloadGpx = parsedGpx.ok && typeof course.gpxXml === 'string';

            return (
              <article
                key={course.id}
                aria-label={course.name}
                className="overflow-hidden rounded-md border"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: course.isPrimary
                    ? 'var(--accent-spruce)'
                    : 'var(--border-strong)',
                  borderWidth: course.isPrimary ? '2px' : '1px',
                }}
              >
                <div className="flex flex-col gap-3 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className="text-base font-bold"
                          style={{ color: 'var(--ink-primary)' }}
                        >
                          {course.name}
                        </h3>
                        {course.isPrimary && (
                          <span
                            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase"
                            style={{
                              backgroundColor: 'var(--accent-spruce-soft)',
                              borderColor: 'var(--accent-spruce)',
                              color: 'var(--ink-primary)',
                            }}
                          >
                            <Star size={12} strokeWidth={2.5} aria-hidden="true" />
                            <span>Primary Course</span>
                          </span>
                        )}
                      </div>
                      {course.description && (
                        <p
                          className="mt-1 text-sm leading-relaxed"
                          style={{ color: 'var(--ink-muted)' }}
                        >
                          {course.description}
                        </p>
                      )}
                    </div>

                    <span
                      className="font-telemetry shrink-0 rounded border px-2 py-1 text-sm font-bold"
                      style={{
                        backgroundColor: 'var(--bg-rail-subtle)',
                        borderColor: 'var(--border-structural)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {formatDistanceKm(course.distanceKm)}
                    </span>
                  </div>

                  <CourseMapPreview
                    courseName={course.name}
                    basecampName={basecampName}
                    gpxXml={course.gpxXml}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    {canDownloadGpx && (
                      <button
                        type="button"
                        onClick={() => downloadCourseGpx(course.name, course.gpxXml!)}
                        className="pfl-focus-ring inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-3.5 text-sm font-bold"
                        style={{
                          backgroundColor: 'var(--shell-header)',
                          color: 'var(--ink-on-shell)',
                        }}
                      >
                        <Download size={16} strokeWidth={2.5} aria-hidden="true" />
                        <span>Download .gpx</span>
                      </button>
                    )}

                    {safeRouteUrl && (
                      <a
                        href={safeRouteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pfl-focus-ring inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border px-3.5 text-sm font-bold no-underline"
                        style={{
                          backgroundColor: 'var(--bg-rail-subtle)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        <span>Open Course link</span>
                        <ExternalLink size={15} strokeWidth={2.25} aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  <details
                    className="pfl-course-help rounded border"
                    style={{
                      backgroundColor: 'var(--bg-rail-subtle)',
                      borderColor: 'var(--border-hairline)',
                    }}
                  >
                    <summary
                      className="pfl-focus-ring flex min-h-[44px] items-center gap-2 px-3 py-2 text-sm font-bold select-none"
                      style={{ color: 'var(--ink-primary)' }}
                    >
                      <ChevronRight
                        size={16}
                        strokeWidth={2.5}
                        aria-hidden="true"
                        className="pfl-chevron shrink-0"
                        style={{ color: 'var(--ink-secondary)' }}
                      />
                      <HelpCircle
                        size={16}
                        strokeWidth={2.25}
                        aria-hidden="true"
                        className="shrink-0"
                        style={{ color: 'var(--ink-secondary)' }}
                      />
                      <span>How to load this Course on your watch or phone</span>
                    </summary>

                    <div
                      className="flex flex-col gap-2.5 border-t px-3.5 py-3 text-sm leading-relaxed"
                      style={{
                        borderColor: 'var(--border-hairline)',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      <div>
                        <strong style={{ color: 'var(--ink-primary)' }}>Garmin:</strong> Tap{' '}
                        <strong>Download .gpx</strong>, open the Garmin Connect app or website, go
                        to <em>Training &amp; Planning → Courses → Import</em>, and send the Course
                        to your watch.
                      </div>
                      <div>
                        <strong style={{ color: 'var(--ink-primary)' }}>
                          Apple Watch / Strava:
                        </strong>{' '}
                        Import the downloaded <code>.gpx</code> file into Strava Routes or
                        WorkOutDoors (or your preferred running app) to view turn-by-turn guidance on
                        your watch or phone.
                      </div>
                      <div
                        className="rounded border px-3 py-2 font-medium"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-structural)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        <strong>No watch? Just use the map preview above!</strong> No GPS watch or
                        fitness app is required — glance at the Course preview right here or run
                        alongside friends from Basecamp.
                      </div>
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
