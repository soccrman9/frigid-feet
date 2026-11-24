import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('Foundation migration and deployment artifacts', () => {
  it('defines the complete 13-group (14-table) Postgres schema, RLS matrix, trigger, RPCs, and Realtime setup', () => {
    const foundationSql = readRepoFile('supabase/migrations/0001_foundation.sql');

    const requiredTables = [
      'events',
      'event_secrets',
      'session_grants',
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
    ];

    for (const table of requiredTables) {
      expect(foundationSql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`));
      expect(foundationSql).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`),
      );
    }

    // Zero client access on event_secrets
    expect(foundationSql).toMatch(
      /REVOKE ALL ON public\.event_secrets FROM PUBLIC, anon, authenticated;/,
    );
    expect(foundationSql).not.toMatch(/CREATE POLICY .* ON public\.event_secrets/);

    // has_grant helper & wish-list Supply protection
    expect(foundationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.has_grant\(/);
    expect(foundationSql).toMatch(/is_wishlist = false/);

    // Team leg pre-seeding trigger
    expect(foundationSql).toMatch(/CREATE TRIGGER trg_seed_team_legs/);
    expect(foundationSql).toMatch(/AFTER INSERT ON public\.teams/);

    // Required SECURITY DEFINER RPC surface
    const requiredRpcs = [
      'create_event',
      'get_active_event_slug',
      'unlock_event',
      'unlock_organizer',
      'unlock_dashboard',
      'rotate_event_secret',
      'get_chip_in_summary',
      'leave_team',
      'start_round',
      'apply_leg_mutation',
      'ping_heartbeat',
    ];
    for (const rpc of requiredRpcs) {
      expect(foundationSql).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\(`));
    }

    // Realtime & REPLICA IDENTITY FULL
    expect(foundationSql).toMatch(/supabase_realtime/);
    expect(foundationSql).toMatch(/ALTER TABLE public\.legs REPLICA IDENTITY FULL;/);
    expect(foundationSql).toMatch(/ALTER TABLE public\.teams REPLICA IDENTITY FULL;/);
    expect(foundationSql).toMatch(/ALTER TABLE public\.supply_claims REPLICA IDENTITY FULL;/);
  });

  it('configures Cloudflare Pages SPA fallback, public-only env vars, and 3-day heartbeat workflow', () => {
    const redirectsFile = readRepoFile('public/_redirects');
    expect(redirectsFile.trim()).toBe('/* /index.html 200');

    const envExample = readRepoFile('.env.example');
    const envKeys = envExample
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=')[0]);
    expect(envKeys).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);

    const heartbeatWorkflow = readRepoFile('.github/workflows/supabase-heartbeat.yml');
    expect(heartbeatWorkflow).toContain("cron: '0 6 */3 * *'");
    expect(heartbeatWorkflow).toContain('/rest/v1/rpc/ping_heartbeat');
  });
});
