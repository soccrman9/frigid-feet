import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryEventApi, InMemoryEventStore } from '../../lib/inMemoryEventApi';
import { SupabaseEventApi } from '../../lib/supabaseEventApi';
import { EventDataProvider } from '../../state/EventDataContext';
import { HomeTab } from '../home/HomeTab';

async function setupExportFixture() {
  const store = new InMemoryEventStore();
  const eventId = store.createEvent({
    slug: '2027',
    name: 'Winter Grind 50K 2027',
    eventDate: '2027-01-09',
    startTime: '2027-01-09T13:00:00.000Z',
    timezone: 'America/New_York',
    inviteCode: 'FROST-INVITE-CODE',
    organizerPasscode: 'HOST-PASS-2027',
    dashboardToken: 'DASH-TOKEN-2027',
    isActive: true,
    basecampName: 'Lakeside Warming Pavilion',
    coldWeatherTips: 'Bring "warm" mittens,\nand dry socks.',
  });

  const api = new InMemoryEventApi(store);
  await api.unlockOrganizer(eventId, 'HOST-PASS-2027');

  const runner = await api.createParticipant(eventId, {
    displayName: 'Alex, "Ace" Rivera',
    rsvpStatus: 'going_runner',
    teamId: null,
    availableFromRound: 1,
    availableToRound: 10,
    rough5kMinutes: 25,
    isFirst5k: false,
    dietaryNotes: 'No nuts, vegetarian',
    showTimesOnLeaderboard: false,
  });

  await api.createChipIn(eventId, {
    participantId: runner.id,
    amountCents: 2500,
    note: 'Venmo, thanks!',
  });

  const snapshot = await api.getEventSnapshot(eventId);
  const grants = await api.getSessionGrants(eventId);
  return { store, api, eventId, snapshot, grants, runner };
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read Blob'));
    reader.readAsText(blob, 'utf-8');
  });
}

describe('OrganizerModePanel — One-Tap Event Snapshot Export (JSON & CSV)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers clean UTF-8 JSON and RFC 4180 CSV client-side downloads from Organizer Mode including chip_ins and excluding event_secrets', async () => {
    const user = userEvent.setup();
    const { api, eventId, snapshot, grants } = await setupExportFixture();

    const capturedDownloads: Array<{ blob: Blob; filename: string }> = [];
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    let lastBlob: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      lastBlob = blob as Blob;
      return 'blob:snapshot-test';
    });
    URL.revokeObjectURL = vi.fn();

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        if (lastBlob) {
          capturedDownloads.push({ blob: lastBlob, filename: this.download });
        }
      });

    try {
      const snapshotSpy = vi.spyOn(api, 'getEventSnapshot');

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

      // Open Export tab inside Organizer Mode
      await user.click(screen.getByRole('tab', { name: /Export/i }));

      const jsonBtn = screen.getByRole('button', { name: /Export Event Snapshot \(JSON\)/i });
      const csvBtn = screen.getByRole('button', { name: /Export Event Snapshot \(CSV\)/i });
      expect(jsonBtn.className).toContain('min-h-[44px]');
      expect(csvBtn.className).toContain('min-h-[44px]');

      // 1. Trigger JSON download
      await user.click(jsonBtn);
      await waitFor(() => {
        expect(capturedDownloads).toHaveLength(1);
      });
      expect(snapshotSpy).toHaveBeenCalledWith(eventId);
      expect(capturedDownloads[0].filename).toMatch(/^winter-grind-2027-snapshot-\d{4}-\d{2}-\d{2}\.json$/);
      expect(capturedDownloads[0].blob.type).toBe('application/json;charset=utf-8');

      const jsonText = await readBlobText(capturedDownloads[0].blob);
      const parsedJson = JSON.parse(jsonText) as { tables: Record<string, unknown[]> };
      expect(Object.keys(parsedJson.tables)).toEqual([
        'events',
        'courses',
        'announcements',
        'rounds',
        'teams',
        'participants',
        'legs',
        'supply_items',
        'supply_claims',
        'chip_ins',
        'badge_definitions',
        'badge_awards',
      ]);
      expect(parsedJson.tables.chip_ins).toHaveLength(1);
      expect(jsonText).not.toContain('event_secrets');
      expect(jsonText).not.toContain('FROST-INVITE-CODE');
      expect(jsonText).not.toContain('HOST-PASS-2027');
      expect(jsonText).not.toContain('DASH-TOKEN-2027');

      // 2. Trigger CSV download
      await user.click(csvBtn);
      await waitFor(() => {
        expect(capturedDownloads).toHaveLength(2);
      });
      expect(capturedDownloads[1].filename).toMatch(/^winter-grind-2027-snapshot-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(capturedDownloads[1].blob.type).toBe('text/csv;charset=utf-8');

      const csvText = await readBlobText(capturedDownloads[1].blob);
      expect(csvText).toContain('table,events');
      expect(csvText).toContain('table,chip_ins');
      expect(csvText).toContain('"Alex, ""Ace"" Rivera"');
      expect(csvText).toContain('"Venmo, thanks!"');
      expect(csvText).not.toContain('event_secrets');
      expect(csvText).not.toContain('FROST-INVITE-CODE');
      expect(csvText).not.toContain('HOST-PASS-2027');
      expect(csvText).not.toContain('DASH-TOKEN-2027');
      expect(clickSpy).toHaveBeenCalledTimes(2);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('disables Event Snapshot export actions with Requires connection when offline', async () => {
    const user = userEvent.setup();
    const { api, eventId, snapshot, grants } = await setupExportFixture();

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

    await user.click(screen.getByRole('tab', { name: /Export/i }));

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    const jsonBtn = screen.getByRole('button', { name: /Export Event Snapshot \(JSON\)/i });
    const csvBtn = screen.getByRole('button', { name: /Export Event Snapshot \(CSV\)/i });
    expect(jsonBtn).toBeDisabled();
    expect(csvBtn).toBeDisabled();
    expect(screen.getByText(/Requires connection/i)).toBeInTheDocument();
  });

  it('verifies SupabaseEventApi.getEventSnapshot queries only standard RLS-protected tables and never touches event_secrets', async () => {
    const api = new SupabaseEventApi('https://example.supabase.co', 'anon-key');
    const queriedTables: string[] = [];

    const makeChain = (table: string) => {
      const rowForSingle = {
        id: 'ev-1',
        slug: '2027',
        name: 'Winter Grind 50K 2027',
        created_at: '2027-01-01T00:00:00.000Z',
        is_active: true,
        chip_in_target_cents: 0,
        chip_in_breakdown: [],
      };
      const rows = table === 'session_grants' ? [{ scope: 'organizer' }] : [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        single: () => Promise.resolve({ data: rowForSingle, error: null }),
        then: (resolve: (value: { data: unknown; error: null }) => void) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return chain;
    };

    vi.spyOn(api.client, 'from').mockImplementation((table: string) => {
      queriedTables.push(table);
      return makeChain(table) as never;
    });
    vi.spyOn(api.client, 'rpc').mockResolvedValue({ data: 0, error: null } as never);

    await api.getEventSnapshot('ev-1');

    expect(queriedTables).not.toContain('event_secrets');
    expect(queriedTables).toEqual(
      expect.arrayContaining([
        'events',
        'courses',
        'announcements',
        'rounds',
        'teams',
        'participants',
        'legs',
        'supply_items',
        'supply_claims',
        'chip_ins',
        'badge_definitions',
        'badge_awards',
      ]),
    );
  });
});
