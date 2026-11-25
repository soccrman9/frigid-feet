import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider, useEventData } from '../../state/EventDataContext';
import { HomeTab } from '../home/HomeTab';

function OrganizerStateProbe() {
  const { isOrganizer, organizerUnlocked, grants, snapshot } = useEventData();
  return (
    <div data-testid="organizer-probe">
      {isOrganizer ? 'org:true' : 'org:false'}|{organizerUnlocked ? 'unlocked:true' : 'unlocked:false'}|grants:
      {grants.join(',')}|chipIns:{snapshot.chipIns.length}
    </div>
  );
}

async function setupHomeFixture(options?: { preUnlockOrganizer?: boolean }) {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'SECRET-HOST-2027',
    dashboardToken: 'dash-token-2027',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
    basecampAddress: '100 Basecamp Trail, Frost Harbor',
    parkingAmenitiesNotes: 'Free parking beside Basecamp.',
    coldWeatherTips: 'Bring dry socks.',
    safetyFirstAidNotes: 'First-aid kit inside Basecamp.',
    chipInTargetCents: 30000,
    chipInSuggestedCents: 1500,
    chipInBreakdown: [{ label: 'Pavilion rental', amountCents: 20000 }],
    venmoHandle: '@wintergrind',
    zelleHandle: 'host@example.com',
  });

  const api = new InMemoryEventApi(store);
  await api.unlockEvent('2027', 'FROST-2027');
  if (options?.preUnlockOrganizer) {
    await api.unlockOrganizer(eventId, 'SECRET-HOST-2027');
  }

  const snapshot = await api.getEventSnapshot(eventId);
  const grants = await api.getSessionGrants(eventId);

  return { store, api, eventId, snapshot, grants };
}

describe('OrganizerModePanel & EventDataContext Organizer state', () => {
  it('shows discreet Organizer Mode entry on Home, rejects wrong passcode cleanly, unlocks on valid passcode, and locks/exits cleanly', async () => {
    const user = userEvent.setup();
    const { api, eventId, snapshot, grants } = await setupHomeFixture();

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <OrganizerStateProbe />
        <HomeTab />
      </EventDataProvider>,
    );

    // Initially locked
    expect(screen.getByTestId('organizer-probe')).toHaveTextContent('org:false|unlocked:false');
    expect(screen.queryByText(/Organizer Mode Active/i)).not.toBeInTheDocument();

    // Open discreet Organizer Mode passcode prompt
    await user.click(screen.getByRole('button', { name: /Organizer Mode/i }));
    const passcodeInput = screen.getByLabelText(/Organizer passcode/i);

    // Wrong passcode shows neutral error without revealing the real passcode
    await user.type(passcodeInput, 'WRONG-CODE');
    await user.click(screen.getByRole('button', { name: /Unlock Organizer Mode/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/did not match/i);
    expect(alert.textContent).not.toContain('SECRET-HOST-2027');
    expect(screen.getByTestId('organizer-probe')).toHaveTextContent('org:false|unlocked:false');

    // Valid passcode unlocks Organizer Mode and exposes isOrganizer + organizerUnlocked
    await user.clear(passcodeInput);
    await user.type(passcodeInput, 'SECRET-HOST-2027');
    await user.click(screen.getByRole('button', { name: /Unlock Organizer Mode/i }));

    await waitFor(() => {
      expect(screen.getByTestId('organizer-probe')).toHaveTextContent('org:true|unlocked:true');
    });
    expect(screen.getByText(/Organizer Mode Active/i)).toBeInTheDocument();

    // Quick lock / exit clears client Organizer UI mode cleanly
    await user.click(screen.getByRole('button', { name: /Lock \/ Exit/i }));

    expect(screen.getByTestId('organizer-probe')).toHaveTextContent('org:false|unlocked:false');
    expect(screen.queryByText(/Organizer Mode Active/i)).not.toBeInTheDocument();
  });

  it('edits Event, Basecamp, and chip-in display settings (including cost breakdown JSON items) and updates Home immediately', async () => {
    const user = userEvent.setup();
    const { api, eventId, snapshot, grants } = await setupHomeFixture({ preUnlockOrganizer: true });

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <HomeTab />
      </EventDataProvider>,
    );

    const eventNameInput = screen.getByLabelText(/^Event name$/i);
    fireEvent.change(eventNameInput, { target: { value: 'Winter Grind 50K 2027 — Updated' } });

    const basecampNameInput = screen.getByLabelText(/Basecamp name/i);
    fireEvent.change(basecampNameInput, { target: { value: 'North Shore Warming Lodge' } });

    const basecampMapsInput = screen.getByLabelText(/Basecamp maps URL/i);
    fireEvent.change(basecampMapsInput, { target: { value: 'http://insecure.example.com/map' } });

    // Rejects non-https URL before persisting
    await user.click(screen.getByRole('button', { name: /Save Event Settings/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/https:\/\//i);

    fireEvent.change(basecampMapsInput, {
      target: { value: 'https://maps.google.com/?q=North+Shore+Lodge' },
    });

    const stravaInput = screen.getByLabelText(/Strava Club URL/i);
    fireEvent.change(stravaInput, {
      target: { value: 'https://www.strava.com/clubs/winter-grind-50k' },
    });

    const recapInput = screen.getByLabelText(/Post-Event recap note/i);
    fireEvent.change(recapInput, {
      target: { value: 'What an unforgettable snowy 50K!' },
    });

    const targetInput = screen.getByLabelText(/Chip-in target/i);
    fireEvent.change(targetInput, { target: { value: '425.50' } });

    const suggestedInput = screen.getByLabelText(/Suggested amount/i);
    fireEvent.change(suggestedInput, { target: { value: '20' } });

    const venmoInput = screen.getByLabelText(/Venmo handle/i);
    fireEvent.change(venmoInput, { target: { value: '@wintergrind-2027' } });

    const zelleInput = screen.getByLabelText(/Zelle handle/i);
    fireEvent.change(zelleInput, { target: { value: 'zelle@wintergrind.test' } });

    // Add a second cost breakdown item
    await user.click(screen.getByRole('button', { name: /Add breakdown item/i }));
    const labelInputs = screen.getAllByLabelText(/Breakdown item label/i);
    const amountInputs = screen.getAllByLabelText(/Breakdown item amount/i);
    fireEvent.change(labelInputs[1], { target: { value: 'Hot cocoa & cups' } });
    fireEvent.change(amountInputs[1], { target: { value: '45.00' } });

    await user.click(screen.getByRole('button', { name: /Save Event Settings/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Event settings saved/i);

    // Home Event Info immediately reflects the updated Event & Basecamp fields
    expect(
      screen.getByRole('heading', { name: 'Winter Grind 50K 2027 — Updated' }),
    ).toBeInTheDocument();
    expect(screen.getByText('North Shore Warming Lodge')).toBeInTheDocument();

    // Persisted in API
    const latest = await api.getEventSnapshot(eventId);
    expect(latest.event.basecampMapsUrl).toBe('https://maps.google.com/?q=North+Shore+Lodge');
    expect(latest.event.stravaClubUrl).toBe('https://www.strava.com/clubs/winter-grind-50k');
    expect(latest.event.recapNote).toBe('What an unforgettable snowy 50K!');
    expect(latest.event.chipInTargetCents).toBe(42550);
    expect(latest.event.chipInSuggestedCents).toBe(2000);
    expect(latest.event.venmoHandle).toBe('@wintergrind-2027');
    expect(latest.event.zelleHandle).toBe('zelle@wintergrind.test');
    expect(latest.event.chipInBreakdown).toEqual([
      { label: 'Pavilion rental', amountCents: 20000 },
      { label: 'Hot cocoa & cups', amountCents: 4500 },
    ]);
  });

  it('adds, edits, reorders, toggles single primary Course, validates https:// external URL, uploads/pastes GPX XML, and deletes Courses', async () => {
    const user = userEvent.setup();
    const { api, eventId, snapshot, grants } = await setupHomeFixture({ preUnlockOrganizer: true });

    const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Park Loop</name><trkseg>
    <trkpt lat="44.4759" lon="-73.2121" />
    <trkpt lat="44.4810" lon="-73.2195" />
  </trkseg></trk>
</gpx>`;

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <HomeTab />
      </EventDataProvider>,
    );

    // Switch to Courses tab inside Organizer workspace
    await user.click(screen.getByRole('tab', { name: /^Courses$/i }));

    // Add first Course (primary) with pasted GPX and invalid URL first to test https:// guard
    await user.click(screen.getByRole('button', { name: /Add Course/i }));
    fireEvent.change(screen.getByLabelText(/Course name/i), { target: { value: 'Boardwalk 5K' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Flat lakefront loop.' } });
    fireEvent.change(screen.getByLabelText(/Distance \(km\)/i), { target: { value: '5.1' } });
    fireEvent.change(screen.getByLabelText(/External Course URL/i), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.change(screen.getByLabelText(/GPX XML/i), { target: { value: sampleGpx } });
    await user.click(screen.getByLabelText(/Primary Course/i));
    await user.click(screen.getByRole('button', { name: /Save Course/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/https:\/\//i);

    // Fix URL and save
    fireEvent.change(screen.getByLabelText(/External Course URL/i), {
      target: { value: 'https://www.strava.com/routes/101' },
    });
    await user.click(screen.getByRole('button', { name: /Save Course/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Course saved/i);
    expect(screen.getByRole('heading', { name: 'Boardwalk 5K' })).toBeInTheDocument();

    // Add second Course via .gpx file upload and mark as primary -> should unset Boardwalk 5K as primary!
    await user.click(screen.getByRole('button', { name: /Add Course/i }));
    fireEvent.change(screen.getByLabelText(/Course name/i), { target: { value: 'Hilltop 5K' } });
    const gpxFile = new File([sampleGpx], 'hilltop-5k.gpx', { type: 'application/gpx+xml' });
    const fileInput = screen.getByLabelText(/Upload \.gpx file/i);
    await user.upload(fileInput, gpxFile);
    await waitFor(() => {
      expect((screen.getByLabelText(/GPX XML/i) as HTMLTextAreaElement).value).toContain('<trkpt');
    });
    await user.click(screen.getByLabelText(/Primary Course/i));
    await user.click(screen.getByRole('button', { name: /Save Course/i }));

    await waitFor(async () => {
      const snap = await api.getEventSnapshot(eventId);
      expect(snap.courses).toHaveLength(2);
      const primaries = snap.courses.filter((c) => c.isPrimary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0].name).toBe('Hilltop 5K');
    });

    // Reorder Hilltop 5K up so it becomes first (sortOrder 0)
    await user.click(screen.getByRole('button', { name: /Move Hilltop 5K up/i }));
    await waitFor(async () => {
      const snap = await api.getEventSnapshot(eventId);
      expect(snap.courses.map((c) => c.name)).toEqual(['Hilltop 5K', 'Boardwalk 5K']);
    });

    // Edit Boardwalk 5K name
    await user.click(screen.getByRole('button', { name: /Edit Boardwalk 5K/i }));
    fireEvent.change(screen.getByLabelText(/Course name/i), {
      target: { value: 'Boardwalk 5K Classic' },
    });
    await user.click(screen.getByRole('button', { name: /Save Course/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Boardwalk 5K Classic' })).toBeInTheDocument();
    });

    // Delete Boardwalk 5K Classic
    await user.click(screen.getByRole('button', { name: /Delete Boardwalk 5K Classic/i }));
    await waitFor(async () => {
      const snap = await api.getEventSnapshot(eventId);
      expect(snap.courses.map((c) => c.name)).toEqual(['Hilltop 5K']);
    });
  });

  it('creates, edits, pins/unpins, and deletes Announcements, updating the Home Announcements feed immediately', async () => {
    const user = userEvent.setup();
    const { api, eventId, snapshot, grants } = await setupHomeFixture({ preUnlockOrganizer: true });

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <HomeTab />
      </EventDataProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /^Announcements$/i }));

    // Create a pinned announcement
    fireEvent.change(screen.getByLabelText(/Announcement title/i), {
      target: { value: 'Ice Watch on Turnaround' },
    });
    fireEvent.change(screen.getByLabelText(/Announcement message/i), {
      target: { value: 'Take the north corner gently during Round 1.' },
    });
    await user.click(screen.getByLabelText(/Pin to top of Home/i));
    await user.click(screen.getByRole('button', { name: /Post Announcement/i }));

    // Appears immediately in Home Announcements feed as Pinned
    const homeAnnouncements = screen.getByRole('region', { name: /^Announcements$/i });
    await waitFor(() => {
      expect(
        within(homeAnnouncements).getByRole('heading', { name: 'Ice Watch on Turnaround' }),
      ).toBeInTheDocument();
    });
    expect(
      within(homeAnnouncements).getByText('Take the north corner gently during Round 1.'),
    ).toBeInTheDocument();
    expect(within(homeAnnouncements).getByText('Pinned')).toBeInTheDocument();

    // Unpin it
    await user.click(screen.getByRole('button', { name: /Unpin Ice Watch on Turnaround/i }));
    await waitFor(() => {
      expect(within(homeAnnouncements).queryByText('Pinned')).not.toBeInTheDocument();
    });

    // Pin it back
    await user.click(screen.getByRole('button', { name: /Pin Ice Watch on Turnaround/i }));
    await waitFor(() => {
      expect(within(homeAnnouncements).getByText('Pinned')).toBeInTheDocument();
    });

    // Edit the announcement
    await user.click(screen.getByRole('button', { name: /Edit Ice Watch on Turnaround/i }));
    fireEvent.change(screen.getByLabelText(/Edit announcement message/i), {
      target: { value: 'Path has been salted — good traction now!' },
    });
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(
        within(homeAnnouncements).getByText('Path has been salted — good traction now!'),
      ).toBeInTheDocument();
    });

    // Delete the announcement
    await user.click(screen.getByRole('button', { name: /Delete Ice Watch on Turnaround/i }));
    await waitFor(() => {
      expect(
        within(homeAnnouncements).queryByRole('heading', { name: 'Ice Watch on Turnaround' }),
      ).not.toBeInTheDocument();
    });
  });

  it('rotates Event secrets, preserves calling Organizer session, and generates shareable invite URL, scannable SVG QR code, and Dashboard link', async () => {
    const user = userEvent.setup();
    const { store, api, eventId, snapshot, grants } = await setupHomeFixture({
      preUnlockOrganizer: true,
    });

    // Seed another Participant, another Organizer, and a Dashboard session to observe revocations
    const otherParticipant = new InMemoryEventApi(store);
    await otherParticipant.unlockEvent('2027', 'FROST-2027');
    const otherOrganizer = new InMemoryEventApi(store);
    await otherOrganizer.unlockOrganizer(eventId, 'SECRET-HOST-2027');
    const dashboardClient = new InMemoryEventApi(store);
    await dashboardClient.unlockDashboard('dash-token-2027');

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <OrganizerStateProbe />
        <HomeTab />
      </EventDataProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /Access & QR/i }));

    // 1. Rotate invite code -> generates /e/2027?code=SNOWDAY-2027 + scannable SVG QR
    fireEvent.change(screen.getByLabelText(/Event invite code/i), {
      target: { value: 'SNOWDAY-2027' },
    });
    await user.click(screen.getByRole('button', { name: /Rotate Invite Code/i }));

    await waitFor(() => {
      expect(screen.getByText(/\/e\/2027\?code=SNOWDAY-2027/)).toBeInTheDocument();
    });

    // Scannable SVG QR rendered with path data
    const qrContainer = screen.getByTestId('invite-qr-preview');
    expect(qrContainer.querySelector('svg')).not.toBeNull();
    expect(qrContainer.querySelector('svg path')).not.toBeNull();

    // Copy invite link button works
    await user.click(screen.getByRole('button', { name: /Copy Invite Link/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/e/2027?code=SNOWDAY-2027'));

    // Download QR button is present
    expect(screen.getByRole('button', { name: /Download QR/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print QR/i })).toBeInTheDocument();

    // Other participant's session was revoked
    await expect(otherParticipant.getEventSnapshot(eventId)).rejects.toThrow();

    // 2. Rotate Dashboard token -> generates /dashboard/basecamp-fresh-999 and revokes old Dashboard
    fireEvent.change(screen.getByLabelText(/Basecamp Dashboard token/i), {
      target: { value: 'basecamp-fresh-999' },
    });
    await user.click(screen.getByRole('button', { name: /Rotate Dashboard Token/i }));

    await waitFor(() => {
      expect(screen.getByText(/\/dashboard\/basecamp-fresh-999/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Copy Dashboard Link/i }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/dashboard/basecamp-fresh-999'),
    );
    await expect(dashboardClient.getEventSnapshot(eventId)).rejects.toThrow();

    // 3. Rotate Organizer passcode -> revokes other Organizer while keeping caller active!
    fireEvent.change(screen.getByLabelText(/New Organizer passcode/i), {
      target: { value: 'ROTATED-HOST-999' },
    });
    await user.click(screen.getByRole('button', { name: /Rotate Organizer Passcode/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Organizer passcode rotated/i);
    });
    expect(screen.getByTestId('organizer-probe')).toHaveTextContent('org:true|unlocked:true');
    expect(await otherOrganizer.getSessionGrants(eventId)).not.toContain('organizer');
  });

  it('revokes server organizer grant, clears in-memory chipIns, and stops marking Legs updatedByOrganizer after Lock / Exit', async () => {
    const user = userEvent.setup();
    const { api, eventId } = await setupHomeFixture({ preUnlockOrganizer: true });

    await api.createChipIn(eventId, {
      participantId: null,
      amountCents: 3500,
      note: 'Private Venmo chip-in',
    });
    const team = await api.createTeam(eventId, {
      name: 'Glacier Gliders',
      tagline: null,
      colorHex: '#163A59',
      emoji: '🏔️',
      isOpen: true,
      lookingNote: null,
    });
    const runner = await api.createParticipant(eventId, {
      displayName: 'Maya Chen',
      rsvpStatus: 'going_runner',
      teamId: team.id,
      availableFromRound: 1,
      availableToRound: 10,
      rough5kMinutes: 28,
      isFirst5k: false,
      dietaryNotes: null,
      showTimesOnLeaderboard: false,
    });

    const freshSnapshot = await api.getEventSnapshot(eventId);
    const leg1 = freshSnapshot.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
    await api.updateLeg(eventId, leg1.id, { runnerId: runner.id });
    const snapshot = await api.getEventSnapshot(eventId);
    const grants = await api.getSessionGrants(eventId);

    render(
      <EventDataProvider
        eventApi={api}
        eventId={eventId}
        initialSnapshot={snapshot}
        initialGrants={grants}
      >
        <OrganizerStateProbe />
        <HomeTab />
      </EventDataProvider>,
    );

    expect(screen.getByTestId('organizer-probe')).toHaveTextContent(
      'org:true|unlocked:true|grants:participant,organizer|chipIns:1',
    );

    await user.click(screen.getByRole('button', { name: /Lock \/ Exit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('organizer-probe')).toHaveTextContent(
        'org:false|unlocked:false|grants:participant|chipIns:0',
      );
    });

    // Server/API session grant no longer contains 'organizer'
    expect(await api.getSessionGrants(eventId)).toEqual(['participant']);

    // Post-lock Leg mutation must NOT stamp updatedByOrganizer = true
    const result = await api.applyLegMutation({
      eventId,
      legId: leg1.id,
      mutationId: 'post-lock-mut-1',
      status: 'out_on_course',
      startedAt: '2027-01-09T13:05:00.000Z',
      finishedAt: null,
      durationSeconds: null,
      courseId: leg1.courseId,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: '2027-01-09T13:05:00.000Z',
    });
    expect(result.applied).toBe(true);
    expect(result.leg.updatedByOrganizer).toBe(false);
  });
});
