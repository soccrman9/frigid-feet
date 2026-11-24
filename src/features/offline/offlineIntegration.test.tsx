import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { AppShell } from '../../components/AppShell';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { ThemeProvider } from '../../state/ThemeContext';
import { saveParticipantId } from '../participant/participantStorage';
import {
  clearOfflineDb,
  getEventSnapshotByEventId,
  getQueuedLegMutations,
  putQueuedLegMutation,
  saveEventSnapshot,
} from './offlineDb';
import { createManualSwUpdateController } from './useSwUpdatePrompt';

const EVENT_START_ISO = '2027-01-09T13:00:00.000Z';
const ROUND_1_NOW_MS = Date.parse('2027-01-09T13:18:00.000Z'); // 18 min into Round 1

function setNavigatorOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: online,
  });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

async function createOfflineEventFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: EVENT_START_ISO,
    timezone: 'America/New_York',
    inviteCode: 'FROST-2027',
    organizerPasscode: 'HOST-2027',
    dashboardToken: 'dash-2027',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
  });

  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.ensureSession();
  await organizerApi.unlockOrganizer(eventId, 'HOST-2027');

  const boardwalk = await organizerApi.upsertCourse(eventId, {
    name: 'Boardwalk 5K',
    description: 'Flat waterfront loop',
    distanceKm: 5,
    isPrimary: true,
    gpxXml: null,
    externalRouteUrl: null,
    sortOrder: 0,
  });

  const api = new InMemoryEventApi(store);
  await api.ensureSession();
  await api.unlockEvent('2027', 'FROST-2027');

  const team = await api.createTeam(eventId, {
    name: 'Frostbite Fighters',
    tagline: null,
    colorHex: '#163A59',
    emoji: '❄️',
    isOpen: true,
    lookingNote: null,
  });

  const maya = await api.createParticipant(eventId, {
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

  const initialSnap = await api.getEventSnapshot(eventId);
  const leg1 = initialSnap.legs.find((l) => l.teamId === team.id && l.roundNumber === 1)!;
  const leg2 = initialSnap.legs.find((l) => l.teamId === team.id && l.roundNumber === 2)!;

  await api.updateLeg(eventId, leg1.id, {
    runnerId: maya.id,
    status: 'out_on_course',
    startedAt: EVENT_START_ISO,
    courseId: boardwalk.id,
  });
  await api.updateLeg(eventId, leg2.id, {
    runnerId: maya.id,
    status: 'scheduled',
    courseId: boardwalk.id,
  });

  const snapshot = await api.getEventSnapshot(eventId);
  saveParticipantId(eventId, maya.id);

  return {
    store,
    eventId,
    api,
    organizerApi,
    snapshot,
    team,
    maya,
    leg1: snapshot.legs.find((l) => l.id === leg1.id)!,
    leg2: snapshot.legs.find((l) => l.id === leg2.id)!,
  };
}

describe('Offline cold-launch hydration, optimistic Leg queue, Undo & reconciliation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOfflineDb();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(ROUND_1_NOW_MS);
  });

  afterEach(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.useRealTimers();
    vi.restoreAllMocks();
    await clearOfflineDb();
  });

  it('hydrates immediately from IndexedDB event_snapshot on offline cold launch, overlays queued Leg mutations optimistically, and shows offline banner', async () => {
    const { eventId, api, snapshot, leg1 } = await createOfflineEventFixture();

    // Seed IndexedDB with snapshot synced 7 minutes ago + 1 pending offline Finish mutation
    const sevenMinAgoIso = new Date(ROUND_1_NOW_MS - 7 * 60_000).toISOString();
    await saveEventSnapshot(snapshot, sevenMinAgoIso);
    await putQueuedLegMutation({
      mutation_id: 'offline-finish-1',
      event_id: eventId,
      leg_id: leg1.id,
      action_type: 'finish',
      payload: {
        status: 'completed',
        started_at: leg1.startedAt,
        finished_at: new Date(ROUND_1_NOW_MS - 2 * 60_000).toISOString(),
        duration_seconds: 960,
        course_id: leg1.courseId,
        external_activity_url: null,
      },
      is_explicit_revert: false,
      client_updated_at: new Date(ROUND_1_NOW_MS - 2 * 60_000).toISOString(),
      previous_leg_snapshot: leg1,
      queued_at: new Date(ROUND_1_NOW_MS - 2 * 60_000).toISOString(),
      retry_count: 0,
      sync_state: 'pending',
    });

    // Simulate offline cold launch on /e/2027 (network calls would fail if attempted)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const getSnapSpy = vi
      .spyOn(api, 'getEventSnapshot')
      .mockRejectedValue(new Error('Network unavailable'));
    vi.spyOn(api, 'getGrantedEventBySlug').mockRejectedValue(new Error('Network unavailable'));

    window.history.replaceState(null, '', '/e/2027');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<App eventApi={api} />);

    // Offline banner shows last saved timestamp
    const offlineBanner = await screen.findByTestId('offline-banner');
    expect(offlineBanner).toHaveTextContent(/offline — showing last saved view \(updated 7m ago\)/i);

    // Tappable "Saved locally (1) — Sync now" pill is visible in chrome
    const syncPill = screen.getByTestId('sync-queue-pill');
    expect(syncPill).toHaveTextContent(/saved locally \(1\) — sync now/i);

    // Switch to Race Day -> optimistic overlay already shows Round 1 Leg as completed!
    await user.click(screen.getByRole('button', { name: /^Race Day$/i }));
    const leg1Row = await screen.findByTestId(`leg-row-${leg1.id}`);
    expect(leg1Row).toHaveAttribute('data-leg-status', 'completed');
    expect(getSnapSpy).not.toHaveBeenCalled();
  });

  it('queues offline Race-Day Leg tap with optimistic UI, supports zero-network pre-flush Undo, and supports post-flush compensating revert', async () => {
    const { eventId, api, snapshot, leg1 } = await createOfflineEventFixture();
    const applySpy = vi.spyOn(api, 'applyLegMutation');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // Initial snapshot was persisted to IndexedDB
    await waitFor(async () => {
      const saved = await getEventSnapshotByEventId(eventId);
      expect(saved?.event_id).toBe(eventId);
    });

    // Go offline
    act(() => {
      setNavigatorOnline(false);
    });
    expect(screen.getByTestId('offline-banner')).toBeInTheDocument();

    // Tap "Finish My 5K Leg" while offline -> optimistic UI immediately shows completed + Saved locally (1)
    const dock = screen.getByTestId('thumb-action-dock');
    await user.click(within(dock).getByRole('button', { name: /finish my 5k leg/i }));

    expect(screen.getByTestId(`leg-row-${leg1.id}`)).toHaveAttribute('data-leg-status', 'completed');
    expect(screen.getByTestId('sync-queue-pill')).toHaveTextContent(/saved locally \(1\) — sync now/i);
    expect(applySpy).not.toHaveBeenCalled();

    // Tap Undo while still pending locally -> deletes from queue & restores out_on_course with ZERO network call!
    const undoToast = screen.getByTestId('undo-toast');
    await user.click(within(undoToast).getByRole('button', { name: /^undo$/i }));

    expect(screen.getByTestId(`leg-row-${leg1.id}`)).toHaveAttribute(
      'data-leg-status',
      'out_on_course',
    );
    expect(screen.queryByTestId('sync-queue-pill')).not.toBeInTheDocument();
    expect(applySpy).not.toHaveBeenCalled();
    expect(await getQueuedLegMutations(eventId)).toEqual([]);

    // Now come back online, Finish leg1 (flushes immediately), then tap Undo post-flush -> compensating revert with isExplicitRevert=true!
    act(() => {
      setNavigatorOnline(true);
    });
    await user.click(within(dock).getByRole('button', { name: /finish my 5k leg/i }));
    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledTimes(1);
    });

    const undoToastPostFlush = screen.getByTestId('undo-toast');
    await user.click(within(undoToastPostFlush).getByRole('button', { name: /^undo$/i }));

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledTimes(2);
    });
    expect(applySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        legId: leg1.id,
        status: 'out_on_course',
        isExplicitRevert: true,
      }),
    );
    expect(screen.getByTestId(`leg-row-${leg1.id}`)).toHaveAttribute(
      'data-leg-status',
      'out_on_course',
    );
  });

  it('flushes queued Leg tap via manual "Sync now" pill, reconciles stale_or_overridden with neutral toast, and defers SW update prompt until queue empties', async () => {
    const { eventId, api, organizerApi, snapshot, leg1 } = await createOfflineEventFixture();
    const updateSwSpy = vi.fn().mockResolvedValue(undefined);
    const swController = createManualSwUpdateController(updateSwSpy);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant']}
          swUpdateAdapter={swController.adapter}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // Go offline and tap Finish My 5K Leg
    act(() => {
      setNavigatorOnline(false);
    });
    await user.click(screen.getByRole('button', { name: /finish my 5k leg/i }));
    expect(screen.getByTestId('sync-queue-pill')).toHaveTextContent(/saved locally \(1\) — sync now/i);

    // Service Worker announces an update while 1 Leg mutation is queued -> MUST stay deferred!
    act(() => {
      swController.setNeedRefresh(true);
    });
    expect(screen.queryByTestId('sw-update-prompt')).not.toBeInTheDocument();

    // Organizer overrides leg1 on the server with a newer timestamp & watch time
    const orgFinishIso = new Date(ROUND_1_NOW_MS + 60_000).toISOString();
    await organizerApi.applyLegMutation({
      eventId,
      legId: leg1.id,
      mutationId: 'org-override-1',
      status: 'completed',
      startedAt: leg1.startedAt,
      finishedAt: orgFinishIso,
      durationSeconds: 1140, // 19:00
      courseId: leg1.courseId,
      externalActivityUrl: null,
      isExplicitRevert: false,
      clientUpdatedAt: orgFinishIso,
    });

    // Reconnect and click "Saved locally (1) — Sync now"
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await user.click(screen.getByTestId('sync-queue-pill'));

    // Stale override toast appears with calm neutral text and Leg syncs to server duration (19:00)
    const staleToast = await screen.findByTestId('stale-override-toast');
    expect(staleToast).toHaveTextContent(/updated to latest basecamp status/i);
    expect(screen.getByTestId(`leg-result-${leg1.id}`)).toHaveTextContent('19:00');
    expect(screen.queryByTestId('sync-queue-pill')).not.toBeInTheDocument();

    // Now that leg_mutation_queue is empty, the gentle "Update available — Reload" prompt surfaces!
    const swBanner = await screen.findByTestId('sw-update-prompt');
    expect(swBanner).toHaveTextContent(/update available — reload/i);
    await user.click(within(swBanner).getByRole('button', { name: /reload/i }));
    expect(updateSwSpy).toHaveBeenCalledWith(true);
  });

  it('preserves queued Leg mutations intact when session is revoked and flushes them after Participant re-unlocks', async () => {
    const { eventId, api, organizerApi, snapshot, leg1 } = await createOfflineEventFixture();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ThemeProvider>
        <EventDataProvider
          eventApi={api}
          eventId={eventId}
          initialSnapshot={snapshot}
          initialGrants={['participant']}
        >
          <AppShell initialTab="race-day" />
        </EventDataProvider>
      </ThemeProvider>,
    );

    // Go offline and queue a Finish tap
    act(() => {
      setNavigatorOnline(false);
    });
    await user.click(screen.getByRole('button', { name: /finish my 5k leg/i }));
    expect(screen.getByTestId('sync-queue-pill')).toHaveTextContent(/saved locally \(1\) — sync now/i);

    // Organizer rotates Event invite code -> revokes Participant session!
    await organizerApi.rotateEventSecret(eventId, 'invite_code', 'WINTER-FRESH');

    // Reconnect -> flush encounters auth error -> queue stays intact and calm re-unlock prompt appears
    act(() => {
      setNavigatorOnline(true);
    });

    const reunlockBanner = await screen.findByTestId('session-reunlock-banner');
    expect(reunlockBanner).toHaveTextContent(/saved locally|re-unlock/i);
    expect(await getQueuedLegMutations(eventId)).toHaveLength(1);

    // Participant enters the new invite code and taps Re-unlock & Sync -> preserved Leg flushes!
    await user.type(within(reunlockBanner).getByLabelText(/invite code/i), 'WINTER-FRESH');
    await user.click(within(reunlockBanner).getByRole('button', { name: /re-unlock & sync/i }));

    await waitFor(async () => {
      expect(await getQueuedLegMutations(eventId)).toEqual([]);
    });
    expect(screen.queryByTestId('session-reunlock-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sync-queue-pill')).not.toBeInTheDocument();

    const serverSnap = await api.getEventSnapshot(eventId);
    expect(serverSnap.legs.find((l) => l.id === leg1.id)?.status).toBe('completed');
  });
});
