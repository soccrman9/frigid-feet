import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import type { RealtimeChangeEvent } from './realtimeTypes';
import { useEventRealtime } from './useEventRealtime';

function setDocumentVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function createStoreAndApis() {
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
  });
  const organizerApi = new InMemoryEventApi(store);
  await organizerApi.unlockOrganizer(eventId, 'HOST50K');
  const mobileApi = new InMemoryEventApi(store);
  await mobileApi.unlockEvent('2027', 'FROST50K');
  return { store, eventId, organizerApi, mobileApi };
}

describe('useEventRealtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    setDocumentVisibility('visible');
    vi.useRealTimers();
  });

  it('opens ONE channel per active tab, forwards live changes across re-renders without resubscribing, and cleans up on unmount', async () => {
    const { store, eventId, organizerApi, mobileApi } = await createStoreAndApis();
    const received: RealtimeChangeEvent[] = [];
    const onResync = vi.fn();
    const subscribeSpy = vi.spyOn(mobileApi, 'subscribeToEvent');

    const { result, rerender, unmount } = renderHook(
      ({ onChange }) =>
        useEventRealtime({
          eventApi: mobileApi,
          eventId,
          onChange,
          onResync,
        }),
      {
        initialProps: {
          onChange: (event: RealtimeChangeEvent) => received.push(event),
        },
      },
    );

    expect(result.current.status).toBe('connected');
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    expect(onResync).not.toHaveBeenCalled();

    // Passing a fresh inline callback on rerender must NOT tear down & reopen the channel
    rerender({
      onChange: (event: RealtimeChangeEvent) => received.push(event),
    });
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);

    await act(async () => {
      await organizerApi.createAnnouncement(eventId, {
        title: 'Round 2 soon',
        body: 'Gather by the porch',
        isPinned: false,
      });
    });

    expect(received).toHaveLength(1);
    expect(received[0].table).toBe('announcements');

    unmount();
    expect(store.getActiveSubscriptionCount(eventId)).toBe(0);
  });

  it('unsubscribes after 30s hidden in mobile mode, cancels timer if foregrounded early, and resubscribes + resyncs on foreground after pause', async () => {
    const { store, eventId, mobileApi } = await createStoreAndApis();
    const onChange = vi.fn();
    const onResync = vi.fn();
    const subscribeSpy = vi.spyOn(mobileApi, 'subscribeToEvent');

    const { result } = renderHook(() =>
      useEventRealtime({
        eventApi: mobileApi,
        eventId,
        onChange,
        onResync,
      }),
    );

    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    expect(result.current.status).toBe('connected');

    // Go to background for 20s, then return BEFORE 30s -> timer cancelled, channel stays open, no resync
    act(() => {
      setDocumentVisibility('hidden');
      vi.advanceTimersByTime(20_000);
    });
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    expect(result.current.status).toBe('connected');

    act(() => {
      setDocumentVisibility('visible');
      vi.advanceTimersByTime(20_000);
    });
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(onResync).not.toHaveBeenCalled();

    // Go to background for full 30s -> unsubscribes cleanly and enters paused status
    act(() => {
      setDocumentVisibility('hidden');
      vi.advanceTimersByTime(29_999);
    });
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(store.getActiveSubscriptionCount(eventId)).toBe(0);
    expect(result.current.status).toBe('paused');
    expect(onResync).not.toHaveBeenCalled();

    // Return to foreground -> immediately resubscribes AND calls onResync() for full snapshot fetch
    act(() => {
      setDocumentVisibility('visible');
    });
    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    expect(result.current.status).toBe('connected');
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('surfaces reconnecting/disconnected status on unexpected socket drop and triggers full resync upon reconnection', async () => {
    const { store, eventId, mobileApi } = await createStoreAndApis();
    const onChange = vi.fn();
    const onResync = vi.fn();

    const { result } = renderHook(() =>
      useEventRealtime({
        eventApi: mobileApi,
        eventId,
        onChange,
        onResync,
      }),
    );

    expect(result.current.status).toBe('connected');
    expect(onResync).not.toHaveBeenCalled();

    act(() => {
      store.simulateRealtimeStatus(eventId, 'reconnecting');
    });
    expect(result.current.status).toBe('reconnecting');
    expect(onResync).not.toHaveBeenCalled();

    act(() => {
      store.simulateRealtimeStatus(eventId, 'disconnected');
    });
    expect(result.current.status).toBe('disconnected');

    act(() => {
      store.simulateRealtimeStatus(eventId, 'connected');
    });
    expect(result.current.status).toBe('connected');
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('keeps channel continuously connected when pauseOnBackground is false (Basecamp Dashboard mode) while still resyncing on reconnect', async () => {
    const { store, eventId, mobileApi } = await createStoreAndApis();
    const onChange = vi.fn();
    const onResync = vi.fn();

    const { result } = renderHook(() =>
      useEventRealtime({
        eventApi: mobileApi,
        eventId,
        pauseOnBackground: false,
        onChange,
        onResync,
      }),
    );

    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);

    act(() => {
      setDocumentVisibility('hidden');
      vi.advanceTimersByTime(120_000);
    });
    expect(store.getActiveSubscriptionCount(eventId)).toBe(1);
    expect(result.current.status).toBe('connected');

    act(() => {
      setDocumentVisibility('visible');
    });
    expect(onResync).not.toHaveBeenCalled();

    // Reconnect after drop still triggers full snapshot resync
    act(() => {
      store.simulateRealtimeStatus(eventId, 'disconnected');
      store.simulateRealtimeStatus(eventId, 'connected');
    });
    expect(onResync).toHaveBeenCalledTimes(1);
  });
});
