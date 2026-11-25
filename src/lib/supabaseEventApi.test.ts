import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { EventAccessError } from '../types/domain';
import {
  createEventApiFromEnv,
  EventConfigurationError,
  SupabaseEventApi,
} from './supabaseEventApi';

function createMockSupabaseClient({
  sessionUserId = 'user-1',
  eventsSingleResult = { data: null, error: null },
  eventsMaybeSingleResult = { data: { id: 'evt-1' }, error: null },
  grantsResult = { data: [], error: null },
  rpcResult = { data: null, error: null },
}: {
  sessionUserId?: string | null;
  eventsSingleResult?: { data: unknown; error: unknown };
  eventsMaybeSingleResult?: { data: unknown; error: unknown };
  grantsResult?: { data: unknown; error: unknown };
  rpcResult?: { data: unknown; error: unknown };
}) {
  const from = vi.fn((table: string) => {
    if (table === 'session_grants') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(grantsResult),
        }),
      };
    }
    if (table === 'events') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(eventsSingleResult),
            maybeSingle: vi.fn().mockResolvedValue(eventsMaybeSingleResult),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
          }),
          then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
        }),
      }),
    };
  });

  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
      }),
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { user: sessionUserId ? { id: sessionUserId } : null },
        error: null,
      }),
    },
    from,
    rpc: vi.fn().mockResolvedValue(rpcResult),
  };

  return client as unknown as SupabaseClient;
}

describe('SupabaseEventApi — auth expiry, RLS revocation, dashboard scope & production config', () => {
  it('maps PostgREST JWT-expired / auth errors (PGRST301, 401, jwt expired) to UNAUTHORIZED', async () => {
    const expiredClient = createMockSupabaseClient({
      rpcResult: {
        data: null,
        error: { code: 'PGRST301', message: 'JWT expired' },
      },
    });
    const api = new SupabaseEventApi(expiredClient);

    await expect(api.getChipInSummary('evt-1')).rejects.toMatchObject({
      name: 'EventAccessError',
      code: 'UNAUTHORIZED',
    });

    const invalidJwtClient = createMockSupabaseClient({
      rpcResult: {
        data: null,
        error: { code: '401', message: 'Invalid JWT token' },
      },
    });
    const api2 = new SupabaseEventApi(invalidJwtClient);

    await expect(api2.startRound('evt-1', 1)).rejects.toMatchObject({
      name: 'EventAccessError',
      code: 'UNAUTHORIZED',
    });
  });

  it('maps PGRST116 on getEventSnapshot events query to FORBIDDEN when authenticated or UNAUTHORIZED when session expired', async () => {
    // Active session whose grant was revoked -> RLS returns 0 rows (PGRST116) -> FORBIDDEN
    const revokedGrantClient = createMockSupabaseClient({
      sessionUserId: 'user-1',
      eventsSingleResult: {
        data: null,
        error: {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
        },
      },
    });
    const apiRevoked = new SupabaseEventApi(revokedGrantClient);

    await expect(apiRevoked.getEventSnapshot('evt-1')).rejects.toSatisfy(
      (err: unknown) => err instanceof EventAccessError && err.code === 'FORBIDDEN',
    );

    // Expired/missing auth session -> RLS returns 0 rows (PGRST116) -> UNAUTHORIZED
    const noSessionClient = createMockSupabaseClient({
      sessionUserId: null,
      eventsSingleResult: {
        data: null,
        error: {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
        },
      },
    });
    const apiNoSession = new SupabaseEventApi(noSessionClient);

    await expect(apiNoSession.getEventSnapshot('evt-1')).rejects.toSatisfy(
      (err: unknown) => err instanceof EventAccessError && err.code === 'UNAUTHORIZED',
    );
  });

  it('requires a participant or organizer grant in getGrantedEventBySlug (never accepts dashboard-only scope)', async () => {
    const dashboardOnlyClient = createMockSupabaseClient({
      sessionUserId: 'user-dash',
      eventsMaybeSingleResult: { data: { id: 'evt-1' }, error: null },
      grantsResult: { data: [{ scope: 'dashboard' }], error: null },
    });
    const apiDashOnly = new SupabaseEventApi(dashboardOnlyClient);
    await expect(apiDashOnly.getGrantedEventBySlug('2027')).resolves.toBeNull();

    const participantClient = createMockSupabaseClient({
      sessionUserId: 'user-p',
      eventsMaybeSingleResult: { data: { id: 'evt-1' }, error: null },
      grantsResult: { data: [{ scope: 'dashboard' }, { scope: 'participant' }], error: null },
    });
    const apiParticipant = new SupabaseEventApi(participantClient);
    await expect(apiParticipant.getGrantedEventBySlug('2027')).resolves.toEqual({
      eventId: 'evt-1',
      grants: ['dashboard', 'participant'],
    });
  });

  it('refuses to fall back to seeded demo secrets in production when Supabase env vars are missing or placeholder', () => {
    expect(() =>
      createEventApiFromEnv({
        DEV: false,
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
      }),
    ).toThrow(EventConfigurationError);

    expect(() =>
      createEventApiFromEnv({
        DEV: false,
        VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'your-anon-key',
      }),
    ).toThrow(EventConfigurationError);

    expect(() =>
      createEventApiFromEnv({
        DEV: false,
        VITE_USE_MOCK_API: 'true',
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
      }),
    ).toThrow(EventConfigurationError);

    // Valid production Supabase config returns SupabaseEventApi
    const prodApi = createEventApiFromEnv({
      DEV: false,
      VITE_SUPABASE_URL: 'https://realproject123.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real',
    });
    expect(prodApi).toBeInstanceOf(SupabaseEventApi);
  });
});
