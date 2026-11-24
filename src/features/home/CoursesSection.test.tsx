import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../../types/domain';
import { CoursesSection } from './CoursesSection';
import * as gpxParser from './gpxParser';

const VALID_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Boardwalk 5K</name>
    <trkseg>
      <trkpt lat="44.4759" lon="-73.2121" />
      <trkpt lat="44.4810" lon="-73.2195" />
      <trkpt lat="44.4761" lon="-73.2123" />
    </trkseg>
  </trk>
</gpx>`;

function makeCourse(overrides: Partial<Course> & { id: string; name: string }): Course {
  return {
    eventId: 'evt-1',
    description: null,
    distanceKm: 5.0,
    isPrimary: false,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe('CoursesSection & CourseMapPreview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders 1–3 Courses in sortOrder, highlights the primary Course, renders safe https:// route links only, and omits unsafe links', () => {
    const courses: Course[] = [
      makeCourse({
        id: 'c-3',
        name: 'Hill Loop 5K',
        distanceKm: 5.15,
        description: 'Rolling neighborhood climb.',
        sortOrder: 3,
        externalRouteUrl: 'http://insecure.example.com/hill',
      }),
      makeCourse({
        id: 'c-1',
        name: 'Boardwalk 5K',
        distanceKm: 5.0,
        description: 'Flat waterfront out-and-back from Basecamp.',
        isPrimary: true,
        sortOrder: 1,
        gpxXml: VALID_GPX,
        externalRouteUrl: 'https://www.strava.com/routes/12345',
      }),
      makeCourse({
        id: 'c-2',
        name: 'Pine Trail 5K',
        distanceKm: 5.05,
        description: 'Sheltered wooded path for windy Rounds.',
        sortOrder: 2,
        gpxXml: '<gpx><broken',
        externalRouteUrl: 'javascript:alert(1)',
      }),
    ];

    render(<CoursesSection courses={courses} basecampName="Lakeside Warming Pavilion" />);

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(3);

    // Order matches sortOrder: 1, 2, 3
    expect(within(cards[0]).getByRole('heading', { name: 'Boardwalk 5K' })).toBeInTheDocument();
    expect(within(cards[0]).getByText(/Primary Course/i)).toBeInTheDocument();
    expect(within(cards[0]).getByText('5.0 km')).toBeInTheDocument();
    expect(within(cards[0]).getByText(/Flat waterfront out-and-back/i)).toBeInTheDocument();

    const safeLink = within(cards[0]).getByRole('link', { name: /Open route link/i });
    expect(safeLink).toHaveAttribute('href', 'https://www.strava.com/routes/12345');
    expect(safeLink).toHaveAttribute('target', '_blank');
    expect(safeLink).toHaveAttribute('rel', expect.stringContaining('noopener'));

    // Valid GPX renders interactive map preview region with trackpoint count & Basecamp start/finish
    expect(
      within(cards[0]).getByRole('region', { name: /Boardwalk 5K interactive Course map/i }),
    ).toBeInTheDocument();
    expect(within(cards[0]).getByText(/3 trackpoints/i)).toBeInTheDocument();
    expect(within(cards[0]).getByText(/Lakeside Warming Pavilion/i)).toBeInTheDocument();

    // Card 2: malformed GPX falls back gracefully without crashing and strips javascript: URL
    expect(within(cards[1]).getByRole('heading', { name: 'Pine Trail 5K' })).toBeInTheDocument();
    expect(within(cards[1]).getByText('5.05 km')).toBeInTheDocument();
    expect(within(cards[1]).getByText(/Map preview unavailable/i)).toBeInTheDocument();
    expect(within(cards[1]).queryByRole('link', { name: /Open route link/i })).not.toBeInTheDocument();
    expect(within(cards[1]).queryByRole('button', { name: /Download \.gpx/i })).not.toBeInTheDocument();

    // Card 3: missing GPX shows calm placeholder and rejects http:// URL
    expect(within(cards[2]).getByRole('heading', { name: 'Hill Loop 5K' })).toBeInTheDocument();
    expect(within(cards[2]).getByText('5.15 km')).toBeInTheDocument();
    expect(within(cards[2]).getByText(/GPX file not uploaded yet/i)).toBeInTheDocument();
    expect(within(cards[2]).queryByRole('link', { name: /Open route link/i })).not.toBeInTheDocument();
  });

  it('triggers .gpx download on button tap and toggles the watch/phone help accordion covering Garmin, Apple Watch / Strava, and no-watch reassurance', async () => {
    const user = userEvent.setup();
    const downloadSpy = vi.spyOn(gpxParser, 'downloadCourseGpx').mockReturnValue(true);

    const courses: Course[] = [
      makeCourse({
        id: 'c-1',
        name: 'Boardwalk 5K',
        isPrimary: true,
        sortOrder: 1,
        gpxXml: VALID_GPX,
      }),
    ];

    render(<CoursesSection courses={courses} basecampName="Lakeside Warming Pavilion" />);

    const downloadBtn = screen.getByRole('button', { name: /Download \.gpx/i });
    await user.click(downloadBtn);
    expect(downloadSpy).toHaveBeenCalledWith('Boardwalk 5K', VALID_GPX);

    const summary = screen.getByText(/How to load this Course on your watch or phone/i);
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');

    await user.click(summary);
    expect(details).toHaveAttribute('open');

    expect(within(details!).getByText(/Garmin Connect/i)).toBeInTheDocument();
    expect(within(details!).getByText(/Apple Watch \/ Strava/i)).toBeInTheDocument();
    expect(
      within(details!).getByText(/No watch\? Just use the map preview above!/i),
    ).toBeInTheDocument();
  });
});
