import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../components/AppShell';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { saveParticipantId } from '../participant/participantStorage';

function setDocumentVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function setupTwoClientFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST50K',
    organizerPasscode: 'HOST50K',
    dashboardToken: 'dash-2027',
    isActive: true,
    basecampName: 'Lakeside Pavilion',
  });

  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.unlockOrganizer(eventId, 'HOST50K');

  const course = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: 'Flat waterfront loop',
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  const team = await organizerApi.createTeam(eventId, {
    name: 'Polar Pacers',
    tagline: 'Warm hats, steady stride',
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });

  const maya = await organizerApi.createParticipant(eventId, {
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

  // Assign Maya to Round 1
  const initialOrgSnap = await organizerApi.getEventSnapshot(eventId);
  const round1Leg = initialOrgSnap.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
  await organizerApi.updateLeg(eventId, round1Leg.id, { runnerId: maya.id });

  // Mobile client (different session sharing the same backend store)
  const mobileApi = new InMemoryEventApi(store);
  await mobileApi.unlockEvent('2027', 'FROST50K');
  const initialSnapshot = await mobileApi.getEventSnapshot(eventId);
  saveParticipantId(eventId, maya.id);

  return { store, eventId, organizerApi, mobileApi, initialSnapshot, course, team, maya, round1Leg };
}

describe('Single-channel Realtime sync across EventDataContext & AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    setDocumentVisibility('visible');
    vi.useRealTimers();
  });

  it('merges live remote updates into Home, Teams, Race Day, and Supplies without manual refresh', async () => {
    const { store, eventId, organizerApi, mobileApi, initialSnapshot, round1Leg, maya } =
      await setupTwoClientFixture();
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={mobileApi}
          eventId={eventId}
          initialSnapshot={initialSnapshot}
          initialGrants={['participant']}
        >
          <AppShell initialTab="home" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // Strictly ONE Realtime channel active for the tab
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);

    // 1. HOME: remote Announcement appears immediately
    await act(async () => {
      await organizerApi.createAnnouncement(eventId, {
        title: 'Fresh Hot Cocoa',
        body: 'Two fresh carafes just arrived at Basecamp.',
        isPinned: true,
      });
    });
    expect(await screen.findByText('Fresh Hot Cocoa')).toBeInTheDocument();

    // 2. TEAMS: switch to Teams, remote Team creation appears live
    await user.click(screen.getByRole('button', { name: /^Teams$/i }));
    await act(async () => {
      await organizerApi.createTeam(eventId, {
        name: 'Glacier Gliders',
        tagline: 'Easy pace',
        colorHex: '#157A4B',
        emoji: '🧊',
        isOpen: true,
        lookingNote: '2 spots open',
      });
    });
    expect(await screen.findByRole('heading', { name: /Glacier Gliders/i })).toBeInTheDocument();

    // 3. RACE DAY: switch to Race Day, remote Round 1 mass-start updates Runner to OUT live
    await user.click(screen.getByRole('button', { name: /^Race Day$/i }));
    await act(async () => {
      await organizerApi.startRound(eventId, 1, [], new Date().toISOString());
    });
    expect(await screen.findByText(/^OUT$/i)).toBeInTheDocument();

    // Remote Leg completion updates Team 50K progress bar live
    await act(async () => {
      await organizerApi.applyLegMutation({
        eventId,
        legId: round1Leg.id,
        mutationId: 'remote-finish-1',
        status: 'completed',
        startedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
        finishedAt: new Date().toISOString(),
        durationSeconds: 1500,
        courseId: round1Leg.courseId,
        externalActivityUrl: null,
        isExplicitRevert: false,
        clientUpdatedAt: new Date(Date.now() + 5000).toISOString(),
      });
    });
    expect(await screen.findByText(/5\s*\/\s*50\s*km/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/5 km together/i)).length).toBeGreaterThan(0);

    // 4. SUPPLIES: switch to Supplies, remote wish-list Supply + claim appear live
    await user.click(screen.getByRole('button', { name: /^Supplies$/i }));
    await act(async () => {
      const item = await organizerApi.createSupplyItem(eventId, {
        category: 'drinks',
        name: 'Spiced Apple Cider',
        isWishlist: true,
        targetSlots: 2,
        createdByParticipantId: null,
      });
      await organizerApi.createSupplyClaim(eventId, {
        supplyItemId: item.id,
        participantId: maya.id,
        note: 'Warm thermos',
      });
    });
    expect(await screen.findByText('Spiced Apple Cider')).toBeInTheDocument();
    expect(await screen.findByText(/1 of 2 claimed/i)).toBeInTheDocument();
  });

  it('keeps the 48px header uncluttered when connected, surfaces calm status on socket drop, and resyncs full snapshot on reconnect', async () => {
    const { store, eventId, organizerApi, mobileApi, initialSnapshot } =
      await setupTwoClientFixture();
    const getSnapshotSpy = vi.spyOn(mobileApi, 'getEventSnapshot');

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={mobileApi}
          eventId={eventId}
          initialSnapshot={initialSnapshot}
          initialGrants={['participant']}
        >
          <AppShell initialTab="home" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    const banner = screen.getByRole('banner');
    // Uncluttered when connected
    expect(within(banner).queryByTestId('realtime-status-pill')).not.toBeInTheDocument();

    // Unexpected socket drop -> calm non-alarming status pill appears
    act(() => {
      store.simulateRealtimeStatus(eventId, 'reconnecting');
    });
    const pill = within(banner).getByTestId('realtime-status-pill');
    expect(pill).toHaveAttribute('role', 'status');
    expect(pill).toHaveTextContent(/reconnecting/i);

    act(() => {
      store.simulateRealtimeStatus(eventId, 'disconnected');
    });
    expect(within(banner).getByTestId('realtime-status-pill')).toHaveTextContent(/live paused/i);

    // Mutation directly in backend while dropped (not delivered over socket)
    const missedId = 'ann-missed-drop';
    store.announcements.set(missedId, {
      id: missedId,
      eventId,
      title: 'Recovered After Reconnect',
      body: 'Restored via full snapshot resync.',
      isPinned: true,
      createdAt: new Date().toISOString(),
    });
    expect(screen.queryByText('Recovered After Reconnect')).not.toBeInTheDocument();

    // Socket reconnects -> pill clears and full snapshot resync recovers the missed announcement
    act(() => {
      store.simulateRealtimeStatus(eventId, 'connected');
    });

    await waitFor(() => {
      expect(getSnapshotSpy).toHaveBeenCalledWith(eventId);
      expect(screen.getByText('Recovered After Reconnect')).toBeInTheDocument();
    });
    expect(within(banner).queryByTestId('realtime-status-pill')).not.toBeInTheDocument();

    // Cleanly keep organizerApi referenced
    expect(organizerApi).toBeDefined();
  });

  it('unsubscribes after background pause timeout and recovers missed updates via full snapshot resync upon returning to foreground', async () => {
    vi.useFakeTimers();
    const { store, eventId, organizerApi, mobileApi, initialSnapshot } =
      await setupTwoClientFixture();

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={mobileApi}
          eventId={eventId}
          initialSnapshot={initialSnapshot}
          initialGrants={['participant']}
          realtimeBackgroundTimeoutMs={30_000}
        >
          <AppShell initialTab="home" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);

    // Hide tab for 30s -> channel unsubscribes
    act(() => {
      setDocumentVisibility('hidden');
      vi.advanceTimersByTime(30_000);
    });
    expect(store.getActiveSubscriptionCount(eventId)).toBe(0);

    // Remote update happens while paused (channel unsubscribed, so not received yet)
    await act(async () => {
      await organizerApi.createAnnouncement(eventId, {
        title: 'Missed While Pocketed',
        body: 'Round 3 starts in 5 minutes!',
        isPinned: true,
      });
    });
    expect(screen.queryByText('Missed While Pocketed')).not.toBeInTheDocument();

    // Return to foreground -> resubscribes + triggers full snapshot resync
    await act(async () => {
      setDocumentVisibility('visible');
      await Promise.resolve();
    });

    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    expect(screen.getByText('Missed While Pocketed')).toBeInTheDocument();
  });
});
