import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { HomeTab } from './HomeTab';

const SAMPLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Boardwalk 5K</name>
    <trkseg>
      <trkpt lat="44.4759" lon="-73.2121" />
      <trkpt lat="44.4810" lon="-73.2195" />
    </trkseg>
  </trk>
</gpx>`;

describe('HomeTab integration', () => {
  it('composes Event info, collective km, pinned Announcements, and interactive Courses from EventDataContext', async () => {
    const store = new InMemoryEventStore();
    const eventId = store.createEvent({
      slug: '2027',
      name: 'Winter Grind 50K 2027',
      eventDate: '2027-01-09',
      startTime: '2027-01-09T13:00:00.000Z',
      timezone: 'America/New_York',
      inviteCode: 'WINTER50K',
      organizerPasscode: 'HOST50K',
      dashboardToken: 'dash-2027',
      isActive: true,
      basecampName: 'Lakeside Warming Pavilion',
      basecampAddress: '100 Basecamp Trail, Frost Harbor',
      parkingAmenitiesNotes: 'Heated restrooms and hot water kettle inside Basecamp.',
      coldWeatherTips: 'Bring dry gloves for Rounds 6 through 10.',
      safetyFirstAidNotes: 'First-aid kit sits beside the kettle.',
      stravaClubUrl: 'https://www.strava.com/clubs/winter-grind-50k',
    });

    const api = new InMemoryEventApi(store);
    await api.unlockOrganizer(eventId, 'HOST50K');

    const primaryCourse = await api.upsertCourse(eventId, {
      name: 'Boardwalk 5K',
      description: 'Flat waterfront out-and-back.',
      distanceKm: 5.0,
      isPrimary: true,
      gpxXml: SAMPLE_GPX,
      externalRouteUrl: 'https://www.strava.com/routes/999',
      sortOrder: 1,
    });

    await api.createAnnouncement(eventId, {
      title: 'Coffee is brewing',
      body: 'Arrive 15 minutes before Round 1.',
      isPinned: true,
    });

    const team = await api.createTeam(eventId, {
      name: 'Frostbite Fighters',
      tagline: null,
      colorHex: null,
      emoji: null,
      isOpen: true,
      lookingNote: null,
    });

    const preSnapshot = await api.getEventSnapshot(eventId);
    const firstLeg = preSnapshot.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
    await api.updateLeg(eventId, firstLeg.id, {
      courseId: primaryCourse.id,
      status: 'completed',
    });

    const snapshot = await api.getEventSnapshot(eventId);

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={['participant', 'organizer']}
      >
        <HomeTab />
      </EventDataProvider>,
    );

    // Event Info + Collective km + Schedule
    expect(screen.getByRole('heading', { name: 'Winter Grind 50K 2027' })).toBeInTheDocument();
    expect(screen.getByTestId('collective-km-card')).toHaveTextContent('5.0 km');
    expect(screen.getByText('Lakeside Warming Pavilion')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /10-Round Hourly Schedule/i })).toBeInTheDocument();

    // Announcements
    expect(screen.getByRole('heading', { name: /Announcements/i })).toBeInTheDocument();
    expect(screen.getByText('Coffee is brewing')).toBeInTheDocument();

    // Courses
    expect(screen.getByRole('heading', { name: /Courses/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Boardwalk 5K' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download \.gpx/i })).toBeInTheDocument();
    expect(
      screen.getByText(/How to load this Course on your watch or phone/i),
    ).toBeInTheDocument();
  });
});
