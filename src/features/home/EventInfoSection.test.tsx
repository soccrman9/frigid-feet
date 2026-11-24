import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Course, EventRecord, Leg, Round, Team } from '../../types/domain';
import { EventInfoSection } from './EventInfoSection';

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'evt-1',
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
    basecampAddress: '100 Basecamp Trail, Frost Harbor',
    basecampMapsUrl: null,
    parkingAmenitiesNotes: 'Free parking beside Basecamp; heated restrooms inside.',
    coldWeatherTips: 'Layer up and bring dry socks for between Rounds.',
    safetyFirstAidNotes: 'First-aid kit and hand warmers live at the Basecamp table.',
    stravaClubUrl: null,
    recapNote: null,
    chipInTargetCents: 30000,
    chipInSuggestedCents: 1500,
    chipInBreakdown: [],
    venmoHandle: null,
    zelleHandle: null,
    createdAt: '2026-11-24T12:00:00.000Z',
    ...overrides,
  };
}

function makeTenRounds(baseStartIso = '2027-01-09T13:00:00.000Z'): Round[] {
  const baseMs = Date.parse(baseStartIso);
  return Array.from({ length: 10 }, (_, idx) => ({
    id: `r-${idx + 1}`,
    eventId: 'evt-1',
    roundNumber: idx + 1,
    scheduledStartAt: new Date(baseMs + idx * 3_600_000).toISOString(),
    startedAt: idx === 0 ? new Date(baseMs).toISOString() : null,
  }));
}

function makeLeg(overrides: Partial<Leg> & { id: string; roundNumber: number }): Leg {
  return {
    eventId: 'evt-1',
    teamId: 'team-1',
    runnerId: 'runner-1',
    courseId: null,
    status: 'scheduled',
    startedAt: null,
    finishedAt: null,
    durationSeconds: null,
    externalActivityUrl: null,
    clientUpdatedAt: '2027-01-09T13:30:00.000Z',
    lastMutationId: null,
    updatedByOrganizer: false,
    ...overrides,
  };
}

describe('EventInfoSection', () => {
  it('renders Basecamp details, Google & Apple Maps links, logistics notes, 10-Round schedule in Event timezone, and collective km summary', () => {
    const event = makeEvent({
      timezone: 'America/New_York',
      stravaClubUrl: 'https://www.strava.com/clubs/winter-grind-50k',
    });
    const rounds = makeTenRounds('2027-01-09T13:00:00.000Z'); // 8:00 AM EST .. 5:00 PM EST
    const courses: Course[] = [
      {
        id: 'c-1',
        eventId: 'evt-1',
        name: 'Boardwalk 5K',
        description: null,
        distanceKm: 5.0,
        isPrimary: true,
        gpxXml: null,
        externalRouteUrl: null,
        sortOrder: 1,
      },
      {
        id: 'c-2',
        eventId: 'evt-1',
        name: 'Trail Loop 5K',
        description: null,
        distanceKm: 5.2,
        isPrimary: false,
        gpxXml: null,
        externalRouteUrl: null,
        sortOrder: 2,
      },
    ];
    const teams: Team[] = [
      {
        id: 'team-1',
        eventId: 'evt-1',
        name: 'Frostbite Fighters',
        tagline: null,
        colorHex: null,
        emoji: null,
        isOpen: true,
        lookingNote: null,
        createdAt: '2026-12-01T12:00:00.000Z',
      },
    ];
    const legs: Leg[] = [
      makeLeg({ id: 'l-1', roundNumber: 1, courseId: 'c-1', status: 'completed' }),
      makeLeg({ id: 'l-2', roundNumber: 2, courseId: 'c-2', status: 'completed' }),
      makeLeg({ id: 'l-3', roundNumber: 3, courseId: null, status: 'completed' }), // defaults to 5.0 km
      makeLeg({ id: 'l-4', roundNumber: 4, courseId: 'c-1', status: 'out_on_course' }), // not counted yet
      makeLeg({ id: 'l-5', roundNumber: 5, courseId: 'c-1', status: 'scheduled' }),
    ];

    render(
      <EventInfoSection
        event={event}
        rounds={rounds}
        legs={legs}
        courses={courses}
        teams={teams}
      />,
    );

    // Collective km card: 5.0 + 5.2 + 5.0 = 15.2 km across 3 completed Legs
    const collectiveCard = screen.getByTestId('collective-km-card');
    expect(within(collectiveCard).getByText('15.2 km')).toBeInTheDocument();
    expect(within(collectiveCard).getByText(/3 completed Legs/i)).toBeInTheDocument();

    // Basecamp info & outbound Google/Apple Maps links
    expect(screen.getByText('Lakeside Warming Pavilion')).toBeInTheDocument();
    expect(screen.getByText('100 Basecamp Trail, Frost Harbor')).toBeInTheDocument();

    const googleLink = screen.getByRole('link', { name: /Google Maps/i });
    expect(googleLink).toHaveAttribute('href', expect.stringMatching(/^https:\/\/www\.google\.com\/maps/));
    expect(googleLink).toHaveAttribute('target', '_blank');

    const appleLink = screen.getByRole('link', { name: /Apple Maps/i });
    expect(appleLink).toHaveAttribute('href', expect.stringMatching(/^https:\/\/maps\.apple\.com/));

    // Logistics notes
    expect(screen.getByText(/Free parking beside Basecamp/i)).toBeInTheDocument();
    expect(screen.getByText(/Layer up and bring dry socks/i)).toBeInTheDocument();
    expect(screen.getByText(/First-aid kit and hand warmers/i)).toBeInTheDocument();

    // Optional Strava Club link shown when valid https://
    const stravaLink = screen.getByRole('link', { name: /Strava Club/i });
    expect(stravaLink).toHaveAttribute('href', 'https://www.strava.com/clubs/winter-grind-50k');

    // 10-Round schedule formatted in America/New_York (8:00 AM to 5:00 PM, finishing 6:00 PM)
    const schedule = screen.getByTestId('round-schedule-list');
    const roundItems = within(schedule).getAllByRole('listitem');
    expect(roundItems).toHaveLength(10);
    expect(within(roundItems[0]).getByText(/Round 1\b/i)).toBeInTheDocument();
    expect(within(roundItems[0]).getByText('8:00 AM')).toBeInTheDocument();
    expect(within(roundItems[9]).getByText(/Round 10\b/i)).toBeInTheDocument();
    expect(within(roundItems[9]).getByText('5:00 PM')).toBeInTheDocument();
    const scheduleSection = screen.getByRole('region', { name: /10-Round Hourly Schedule/i });
    expect(within(scheduleSection).getByText(/8:00 AM.*6:00 PM/)).toBeInTheDocument();
  });

  it('formats the 10-Round schedule in another Event timezone and hides Strava Club when unset or unsafe', () => {
    const eventUnset = makeEvent({
      timezone: 'America/Chicago', // 13:00Z = 7:00 AM CST in January
      stravaClubUrl: null,
    });
    const rounds = makeTenRounds('2027-01-09T13:00:00.000Z');

    const { rerender } = render(
      <EventInfoSection event={eventUnset} rounds={rounds} legs={[]} courses={[]} />,
    );

    const schedule = screen.getByTestId('round-schedule-list');
    const roundItems = within(schedule).getAllByRole('listitem');
    expect(within(roundItems[0]).getByText('7:00 AM')).toBeInTheDocument();
    expect(within(roundItems[9]).getByText('4:00 PM')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Strava Club/i })).not.toBeInTheDocument();

    // Unsafe Strava URL must also be hidden
    rerender(
      <EventInfoSection
        event={makeEvent({ stravaClubUrl: 'javascript:alert(1)' })}
        rounds={rounds}
        legs={[]}
        courses={[]}
      />,
    );
    expect(screen.queryByRole('link', { name: /Strava Club/i })).not.toBeInTheDocument();
  });
});
