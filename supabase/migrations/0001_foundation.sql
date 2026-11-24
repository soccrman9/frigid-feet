-- Winter Grind 50K — Complete Phase 1 Foundation Migration
-- Canonical 13-table Event-scoped Postgres schema, RLS matrix, triggers, SECURITY DEFINER RPCs, and Realtime configuration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. TABLES (13 domain groups / 14 physical tables)
-- ============================================================================

-- 1. events
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  event_date date,
  start_time timestamptz,
  timezone text,
  is_active boolean NOT NULL DEFAULT false,
  basecamp_name text,
  basecamp_address text,
  basecamp_maps_url text,
  parking_amenities_notes text,
  cold_weather_tips text,
  safety_first_aid_notes text,
  strava_club_url text,
  recap_note text,
  chip_in_target_cents int NOT NULL DEFAULT 0,
  chip_in_suggested_cents int,
  chip_in_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  venmo_handle text,
  zelle_handle text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. event_secrets (zero client RLS access; SECURITY DEFINER RPCs only)
CREATE TABLE IF NOT EXISTS public.event_secrets (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  invite_code_hash text NOT NULL,
  organizer_passcode_hash text NOT NULL,
  dashboard_token_hash text UNIQUE NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. session_grants
CREATE TABLE IF NOT EXISTS public.session_grants (
  auth_uid uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('participant', 'organizer', 'dashboard')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_uid, event_id, scope)
);

-- 4. courses
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  distance_km numeric(4,2) NOT NULL DEFAULT 5.00,
  is_primary boolean NOT NULL DEFAULT false,
  gpx_xml text,
  external_route_url text CHECK (
    external_route_url IS NULL
    OR (external_route_url ~ '^https://' AND length(external_route_url) <= 500)
  ),
  sort_order int NOT NULL DEFAULT 0
);

-- 5. announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. rounds
CREATE TABLE IF NOT EXISTS public.rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  round_number int NOT NULL CHECK (round_number BETWEEN 1 AND 10),
  scheduled_start_at timestamptz NOT NULL,
  started_at timestamptz,
  UNIQUE (event_id, round_number)
);

-- 7. teams
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  tagline text,
  color_hex text,
  emoji text,
  is_open boolean NOT NULL DEFAULT true,
  looking_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. participants
CREATE TABLE IF NOT EXISTS public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  rsvp_status text NOT NULL CHECK (
    rsvp_status IN ('going_runner', 'going_supporter', 'maybe', 'cant_make_it')
  ),
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  available_from_round int NOT NULL DEFAULT 1 CHECK (available_from_round BETWEEN 1 AND 10),
  available_to_round int NOT NULL DEFAULT 10 CHECK (available_to_round BETWEEN 1 AND 10),
  rough_5k_minutes int,
  is_first_5k boolean NOT NULL DEFAULT false,
  dietary_notes text,
  show_times_on_leaderboard boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_from_round <= available_to_round)
);

-- 9. legs
CREATE TABLE IF NOT EXISTS public.legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  round_number int NOT NULL CHECK (round_number BETWEEN 1 AND 10),
  runner_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'out_on_course', 'completed')
  ),
  started_at timestamptz,
  finished_at timestamptz,
  duration_seconds int CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  external_activity_url text CHECK (
    external_activity_url IS NULL
    OR (external_activity_url ~ '^https://' AND length(external_activity_url) <= 500)
  ),
  client_updated_at timestamptz NOT NULL DEFAULT now(),
  last_mutation_id uuid,
  updated_by_organizer boolean NOT NULL DEFAULT false,
  UNIQUE (team_id, round_number)
);

-- 10. supply_items
CREATE TABLE IF NOT EXISTS public.supply_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('food', 'drinks', 'gear_first_aid')),
  name text NOT NULL,
  is_wishlist boolean NOT NULL DEFAULT false,
  target_slots int CHECK (target_slots IS NULL OR target_slots >= 1),
  created_by_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. supply_claims
CREATE TABLE IF NOT EXISTS public.supply_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  supply_item_id uuid NOT NULL REFERENCES public.supply_items(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. chip_ins (strictly Organizer-only RLS)
CREATE TABLE IF NOT EXISTS public.chip_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  amount_cents int NOT NULL CHECK (amount_cents > 0),
  note text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- 13a. badge_definitions
CREATE TABLE IF NOT EXISTS public.badge_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text NOT NULL,
  description text,
  is_preset boolean NOT NULL DEFAULT false
);

-- 13b. badge_awards
CREATE TABLE IF NOT EXISTS public.badge_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  badge_definition_id uuid NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.participants(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  note text,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((participant_id IS NOT NULL) <> (team_id IS NOT NULL))
);

-- Helpful indexes for Event-scoped reads & Realtime filtering
CREATE INDEX IF NOT EXISTS idx_session_grants_lookup ON public.session_grants (auth_uid, event_id, scope);
CREATE INDEX IF NOT EXISTS idx_courses_event_id ON public.courses (event_id);
CREATE INDEX IF NOT EXISTS idx_announcements_event_id ON public.announcements (event_id);
CREATE INDEX IF NOT EXISTS idx_rounds_event_id ON public.rounds (event_id);
CREATE INDEX IF NOT EXISTS idx_teams_event_id ON public.teams (event_id);
CREATE INDEX IF NOT EXISTS idx_participants_event_id ON public.participants (event_id);
CREATE INDEX IF NOT EXISTS idx_participants_team_id ON public.participants (team_id);
CREATE INDEX IF NOT EXISTS idx_legs_event_id ON public.legs (event_id);
CREATE INDEX IF NOT EXISTS idx_legs_event_round ON public.legs (event_id, round_number);
CREATE INDEX IF NOT EXISTS idx_supply_items_event_id ON public.supply_items (event_id);
CREATE INDEX IF NOT EXISTS idx_supply_claims_event_id ON public.supply_claims (event_id);
CREATE INDEX IF NOT EXISTS idx_chip_ins_event_id ON public.chip_ins (event_id);
CREATE INDEX IF NOT EXISTS idx_badge_definitions_event_id ON public.badge_definitions (event_id);
CREATE INDEX IF NOT EXISTS idx_badge_awards_event_id ON public.badge_awards (event_id);

-- ============================================================================
-- 2. GRANT HELPER & ROW-LEVEL SECURITY (RLS) MATRIX
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_grant(p_event_id uuid, p_scopes text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.session_grants sg
    WHERE sg.auth_uid = auth.uid()
      AND sg.event_id = p_event_id
      AND sg.scope = ANY(p_scopes)
  );
$$;

REVOKE ALL ON FUNCTION public.has_grant(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_grant(uuid, text[]) TO anon, authenticated;

-- Enable RLS on every table
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chip_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_awards ENABLE ROW LEVEL SECURITY;

-- event_secrets: zero client access
REVOKE ALL ON public.event_secrets FROM PUBLIC, anon, authenticated;

-- session_grants: own SELECT only; mutations via SECURITY DEFINER RPCs only
REVOKE INSERT, UPDATE, DELETE ON public.session_grants FROM PUBLIC, anon, authenticated;
CREATE POLICY session_grants_select_own ON public.session_grants
  FOR SELECT
  USING (auth_uid = auth.uid());

-- events: dashboard/participant SELECT; organizer full access
CREATE POLICY events_select ON public.events
  FOR SELECT
  USING (public.has_grant(id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY events_insert_organizer ON public.events
  FOR INSERT
  WITH CHECK (public.has_grant(id, ARRAY['organizer']));
CREATE POLICY events_update_organizer ON public.events
  FOR UPDATE
  USING (public.has_grant(id, ARRAY['organizer']))
  WITH CHECK (public.has_grant(id, ARRAY['organizer']));
CREATE POLICY events_delete_organizer ON public.events
  FOR DELETE
  USING (public.has_grant(id, ARRAY['organizer']));

-- courses: dashboard/participant SELECT; organizer full access
CREATE POLICY courses_select ON public.courses
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY courses_insert_organizer ON public.courses
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY courses_update_organizer ON public.courses
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY courses_delete_organizer ON public.courses
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['organizer']));

-- announcements: dashboard/participant SELECT; organizer full access
CREATE POLICY announcements_select ON public.announcements
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY announcements_insert_organizer ON public.announcements
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY announcements_update_organizer ON public.announcements
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY announcements_delete_organizer ON public.announcements
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['organizer']));

-- rounds: dashboard/participant SELECT; organizer full access
CREATE POLICY rounds_select ON public.rounds
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY rounds_insert_organizer ON public.rounds
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY rounds_update_organizer ON public.rounds
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY rounds_delete_organizer ON public.rounds
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['organizer']));

-- badge_definitions: dashboard/participant SELECT; organizer full access
CREATE POLICY badge_definitions_select ON public.badge_definitions
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY badge_definitions_insert_organizer ON public.badge_definitions
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY badge_definitions_update_organizer ON public.badge_definitions
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY badge_definitions_delete_organizer ON public.badge_definitions
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['organizer']));

-- badge_awards: dashboard/participant SELECT; organizer full access
CREATE POLICY badge_awards_select ON public.badge_awards
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY badge_awards_insert_organizer ON public.badge_awards
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY badge_awards_update_organizer ON public.badge_awards
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY badge_awards_delete_organizer ON public.badge_awards
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['organizer']));

-- participants: dashboard SELECT; participant/organizer full access
CREATE POLICY participants_select ON public.participants
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY participants_insert ON public.participants
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['participant', 'organizer']));
CREATE POLICY participants_update ON public.participants
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['participant', 'organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['participant', 'organizer']));
CREATE POLICY participants_delete ON public.participants
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['participant', 'organizer']));

-- teams: dashboard SELECT; participant/organizer full access
CREATE POLICY teams_select ON public.teams
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY teams_insert ON public.teams
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['participant', 'organizer']));
CREATE POLICY teams_update ON public.teams
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['participant', 'organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['participant', 'organizer']));
CREATE POLICY teams_delete ON public.teams
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['participant', 'organizer']));

-- legs: dashboard SELECT; participant/organizer full access
CREATE POLICY legs_select ON public.legs
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY legs_insert ON public.legs
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['participant', 'organizer']));
CREATE POLICY legs_update ON public.legs
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['participant', 'organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['participant', 'organizer']));
CREATE POLICY legs_delete ON public.legs
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['participant', 'organizer']));

-- supply_claims: dashboard SELECT; participant/organizer full access
CREATE POLICY supply_claims_select ON public.supply_claims
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY supply_claims_insert ON public.supply_claims
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['participant', 'organizer']));
CREATE POLICY supply_claims_update ON public.supply_claims
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['participant', 'organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['participant', 'organizer']));
CREATE POLICY supply_claims_delete ON public.supply_claims
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['participant', 'organizer']));

-- supply_items: dashboard SELECT; participant write ONLY where is_wishlist = false; organizer full access
CREATE POLICY supply_items_select ON public.supply_items
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['dashboard', 'participant', 'organizer']));
CREATE POLICY supply_items_insert ON public.supply_items
  FOR INSERT
  WITH CHECK (
    public.has_grant(event_id, ARRAY['organizer'])
    OR (public.has_grant(event_id, ARRAY['participant']) AND is_wishlist = false)
  );
CREATE POLICY supply_items_update ON public.supply_items
  FOR UPDATE
  USING (
    public.has_grant(event_id, ARRAY['organizer'])
    OR (public.has_grant(event_id, ARRAY['participant']) AND is_wishlist = false)
  )
  WITH CHECK (
    public.has_grant(event_id, ARRAY['organizer'])
    OR (public.has_grant(event_id, ARRAY['participant']) AND is_wishlist = false)
  );
CREATE POLICY supply_items_delete ON public.supply_items
  FOR DELETE
  USING (
    public.has_grant(event_id, ARRAY['organizer'])
    OR (public.has_grant(event_id, ARRAY['participant']) AND is_wishlist = false)
  );

-- chip_ins: strictly Organizer-only
CREATE POLICY chip_ins_select_organizer ON public.chip_ins
  FOR SELECT
  USING (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY chip_ins_insert_organizer ON public.chip_ins
  FOR INSERT
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY chip_ins_update_organizer ON public.chip_ins
  FOR UPDATE
  USING (public.has_grant(event_id, ARRAY['organizer']))
  WITH CHECK (public.has_grant(event_id, ARRAY['organizer']));
CREATE POLICY chip_ins_delete_organizer ON public.chip_ins
  FOR DELETE
  USING (public.has_grant(event_id, ARRAY['organizer']));

-- ============================================================================
-- 3. TRIGGER: PRE-SEED 10 PLACEHOLDER LEGS ON TEAM CREATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_team_legs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_primary_course_id uuid;
BEGIN
  SELECT id
  INTO v_primary_course_id
  FROM public.courses
  WHERE event_id = NEW.event_id
  ORDER BY is_primary DESC, sort_order ASC, id ASC
  LIMIT 1;

  INSERT INTO public.legs (
    event_id,
    team_id,
    round_number,
    runner_id,
    course_id,
    status
  )
  SELECT
    NEW.event_id,
    NEW.id,
    gs.round_number,
    NULL,
    v_primary_course_id,
    'scheduled'
  FROM generate_series(1, 10) AS gs(round_number)
  ON CONFLICT (team_id, round_number) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_team_legs ON public.teams;
CREATE TRIGGER trg_seed_team_legs
  AFTER INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_team_legs();

-- ============================================================================
-- 4. SECURITY DEFINER RPC SURFACE
-- ============================================================================

-- 4.1 Provisioning helper (run in Supabase SQL Editor / service_role only)
CREATE OR REPLACE FUNCTION public.create_event(
  p_slug text,
  p_name text,
  p_event_date date,
  p_start_time timestamptz,
  p_timezone text,
  p_invite_code text,
  p_organizer_passcode text,
  p_dashboard_token text,
  p_is_active boolean DEFAULT true,
  p_basecamp_name text DEFAULT NULL,
  p_basecamp_address text DEFAULT NULL,
  p_basecamp_maps_url text DEFAULT NULL,
  p_parking_amenities_notes text DEFAULT NULL,
  p_cold_weather_tips text DEFAULT NULL,
  p_safety_first_aid_notes text DEFAULT NULL,
  p_strava_club_url text DEFAULT NULL,
  p_chip_in_target_cents int DEFAULT 0,
  p_chip_in_suggested_cents int DEFAULT NULL,
  p_chip_in_breakdown jsonb DEFAULT '[]'::jsonb,
  p_venmo_handle text DEFAULT NULL,
  p_zelle_handle text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_is_active THEN
    UPDATE public.events SET is_active = false WHERE is_active = true;
  END IF;

  INSERT INTO public.events (
    slug,
    name,
    event_date,
    start_time,
    timezone,
    is_active,
    basecamp_name,
    basecamp_address,
    basecamp_maps_url,
    parking_amenities_notes,
    cold_weather_tips,
    safety_first_aid_notes,
    strava_club_url,
    chip_in_target_cents,
    chip_in_suggested_cents,
    chip_in_breakdown,
    venmo_handle,
    zelle_handle
  )
  VALUES (
    p_slug,
    p_name,
    p_event_date,
    p_start_time,
    p_timezone,
    p_is_active,
    p_basecamp_name,
    p_basecamp_address,
    p_basecamp_maps_url,
    p_parking_amenities_notes,
    p_cold_weather_tips,
    p_safety_first_aid_notes,
    p_strava_club_url,
    COALESCE(p_chip_in_target_cents, 0),
    p_chip_in_suggested_cents,
    COALESCE(p_chip_in_breakdown, '[]'::jsonb),
    p_venmo_handle,
    p_zelle_handle
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.event_secrets (
    event_id,
    invite_code_hash,
    organizer_passcode_hash,
    dashboard_token_hash
  )
  VALUES (
    v_event_id,
    crypt(p_invite_code, gen_salt('bf')),
    crypt(p_organizer_passcode, gen_salt('bf')),
    encode(digest(p_dashboard_token, 'sha256'), 'hex')
  );

  -- Pre-seed 10 hourly Rounds (Round 1 through Round 10)
  INSERT INTO public.rounds (event_id, round_number, scheduled_start_at)
  SELECT
    v_event_id,
    gs.round_number,
    p_start_time + ((gs.round_number - 1) * interval '1 hour')
  FROM generate_series(1, 10) AS gs(round_number);

  -- Pre-seed 5 Organizer superlative Badge definitions
  INSERT INTO public.badge_definitions (event_id, name, emoji, description, is_preset)
  VALUES
    (v_event_id, 'Best Cold-Weather Outfit', '🧣', 'Most iconic winter running kit on the Course.', true),
    (v_event_id, 'Cheer Squad MVP', '📣', 'Brought unmatched energy and encouragement at Basecamp.', true),
    (v_event_id, 'Best Snack Contributor', '🥨', 'Kept Basecamp fueled with top-tier Supplies.', true),
    (v_event_id, 'Most Encouraging', '💛', 'Lifted up Runners all day across every Round.', true),
    (v_event_id, 'Best Vibes at Basecamp', '🔥', 'Made Basecamp the warmest place to hang out between Rounds.', true);

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_event(
  text, text, date, timestamptz, text, text, text, text,
  boolean, text, text, text, text, text, text, text, int, int, jsonb, text, text
) FROM PUBLIC, anon, authenticated;

-- 4.2 Read-only active Event slug lookup (returns ONLY slug; zero private Event details leaked)
CREATE OR REPLACE FUNCTION public.get_active_event_slug()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT slug
  FROM public.events
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_event_slug() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_event_slug() TO anon, authenticated;

-- 4.3 Unlock Event with invite code -> grants 'participant' scope
CREATE OR REPLACE FUNCTION public.unlock_event(p_slug text, p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_event_id uuid;
  v_invite_hash text;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication session required' USING ERRCODE = '42501';
  END IF;

  SELECT e.id, s.invite_code_hash
  INTO v_event_id, v_invite_hash
  FROM public.events e
  JOIN public.event_secrets s ON s.event_id = e.id
  WHERE e.slug = p_slug;

  IF v_event_id IS NULL OR p_code IS NULL OR crypt(p_code, v_invite_hash) <> v_invite_hash THEN
    RAISE EXCEPTION 'Invalid invite code' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.session_grants (auth_uid, event_id, scope)
  VALUES (v_auth_uid, v_event_id, 'participant')
  ON CONFLICT (auth_uid, event_id, scope) DO UPDATE
    SET granted_at = now();

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_event(text, text) TO authenticated;

-- 4.4 Unlock Organizer Mode -> grants 'participant' + 'organizer' scopes
CREATE OR REPLACE FUNCTION public.unlock_organizer(p_event_id uuid, p_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_passcode_hash text;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication session required' USING ERRCODE = '42501';
  END IF;

  SELECT organizer_passcode_hash
  INTO v_passcode_hash
  FROM public.event_secrets
  WHERE event_id = p_event_id;

  IF v_passcode_hash IS NULL OR p_passcode IS NULL OR crypt(p_passcode, v_passcode_hash) <> v_passcode_hash THEN
    RETURN false;
  END IF;

  INSERT INTO public.session_grants (auth_uid, event_id, scope)
  VALUES
    (v_auth_uid, p_event_id, 'participant'),
    (v_auth_uid, p_event_id, 'organizer')
  ON CONFLICT (auth_uid, event_id, scope) DO UPDATE
    SET granted_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_organizer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_organizer(uuid, text) TO authenticated;

-- 4.5 Unlock Basecamp Dashboard -> grants read-only 'dashboard' scope
CREATE OR REPLACE FUNCTION public.unlock_dashboard(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_event_id uuid;
  v_token_hash text;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication session required' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid dashboard token' USING ERRCODE = '28000';
  END IF;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT event_id
  INTO v_event_id
  FROM public.event_secrets
  WHERE dashboard_token_hash = v_token_hash;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Invalid dashboard token' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.session_grants (auth_uid, event_id, scope)
  VALUES (v_auth_uid, v_event_id, 'dashboard')
  ON CONFLICT (auth_uid, event_id, scope) DO UPDATE
    SET granted_at = now();

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_dashboard(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_dashboard(text) TO authenticated;

-- 4.6 Rotate Event secret (Organizer only)
CREATE OR REPLACE FUNCTION public.rotate_event_secret(
  p_event_id uuid,
  p_secret_type text,
  p_new_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.has_grant(p_event_id, ARRAY['organizer']) THEN
    RAISE EXCEPTION 'Organizer permission required' USING ERRCODE = '42501';
  END IF;

  IF p_new_value IS NULL OR length(trim(p_new_value)) = 0 THEN
    RAISE EXCEPTION 'New secret value cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF p_secret_type = 'invite_code' THEN
    UPDATE public.event_secrets
    SET invite_code_hash = crypt(p_new_value, gen_salt('bf')),
        updated_at = now()
    WHERE event_id = p_event_id;

    DELETE FROM public.session_grants
    WHERE event_id = p_event_id
      AND scope = 'participant';

  ELSIF p_secret_type = 'organizer_passcode' THEN
    UPDATE public.event_secrets
    SET organizer_passcode_hash = crypt(p_new_value, gen_salt('bf')),
        updated_at = now()
    WHERE event_id = p_event_id;

    DELETE FROM public.session_grants
    WHERE event_id = p_event_id
      AND scope = 'organizer'
      AND auth_uid <> auth.uid();

  ELSIF p_secret_type = 'dashboard_token' THEN
    UPDATE public.event_secrets
    SET dashboard_token_hash = encode(digest(p_new_value, 'sha256'), 'hex'),
        updated_at = now()
    WHERE event_id = p_event_id;

    DELETE FROM public.session_grants
    WHERE event_id = p_event_id
      AND scope = 'dashboard';

  ELSE
    RAISE EXCEPTION 'Unsupported secret type: %', p_secret_type USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_event_secret(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_event_secret(uuid, text, text) TO authenticated;

-- 4.7 Aggregate chip-in total (Participant or Organizer; never reveals individual rows/counts)
CREATE OR REPLACE FUNCTION public.get_chip_in_summary(p_event_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_total int;
BEGIN
  IF NOT public.has_grant(p_event_id, ARRAY['participant', 'organizer']) THEN
    RAISE EXCEPTION 'Event access required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0)::int
  INTO v_total
  FROM public.chip_ins
  WHERE event_id = p_event_id;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.get_chip_in_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chip_in_summary(uuid) TO authenticated;

-- 4.8 Atomic leave_team + empty-Team cleanup
CREATE OR REPLACE FUNCTION public.leave_team(p_participant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_event_id uuid;
  v_team_id uuid;
  v_remaining_participants int;
  v_completed_legs int;
BEGIN
  SELECT event_id, team_id
  INTO v_event_id, v_team_id
  FROM public.participants
  WHERE id = p_participant_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_grant(v_event_id, ARRAY['participant', 'organizer']) THEN
    RAISE EXCEPTION 'Event access required' USING ERRCODE = '42501';
  END IF;

  IF v_team_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.participants
  SET team_id = NULL
  WHERE id = p_participant_id;

  UPDATE public.legs
  SET runner_id = NULL
  WHERE team_id = v_team_id
    AND runner_id = p_participant_id
    AND status = 'scheduled';

  SELECT COUNT(*) INTO v_remaining_participants
  FROM public.participants
  WHERE team_id = v_team_id;

  SELECT COUNT(*) INTO v_completed_legs
  FROM public.legs
  WHERE team_id = v_team_id
    AND status = 'completed';

  IF v_remaining_participants = 0 AND v_completed_legs = 0 THEN
    DELETE FROM public.teams
    WHERE id = v_team_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_team(uuid) TO authenticated;

-- 4.9 Organizer mass-start for a Round
CREATE OR REPLACE FUNCTION public.start_round(
  p_event_id uuid,
  p_round_number int,
  p_exclude_leg_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_started_at timestamptz DEFAULT now()
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_started_count int;
BEGIN
  IF NOT public.has_grant(p_event_id, ARRAY['organizer']) THEN
    RAISE EXCEPTION 'Organizer permission required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.rounds
  SET started_at = p_started_at
  WHERE event_id = p_event_id
    AND round_number = p_round_number;

  UPDATE public.legs
  SET status = 'out_on_course',
      started_at = p_started_at,
      client_updated_at = p_started_at,
      updated_by_organizer = true
  WHERE event_id = p_event_id
    AND round_number = p_round_number
    AND status = 'scheduled'
    AND runner_id IS NOT NULL
    AND NOT (id = ANY(COALESCE(p_exclude_leg_ids, ARRAY[]::uuid[])));

  GET DIAGNOSTICS v_started_count = ROW_COUNT;
  RETURN v_started_count;
END;
$$;

REVOKE ALL ON FUNCTION public.start_round(uuid, int, uuid[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_round(uuid, int, uuid[], timestamptz) TO authenticated;

-- 4.10 Idempotent Leg mutation RPC with conflict resolution
CREATE OR REPLACE FUNCTION public.apply_leg_mutation(
  p_event_id uuid,
  p_leg_id uuid,
  p_mutation_id uuid,
  p_status text,
  p_started_at timestamptz DEFAULT NULL,
  p_finished_at timestamptz DEFAULT NULL,
  p_duration_seconds int DEFAULT NULL,
  p_course_id uuid DEFAULT NULL,
  p_external_activity_url text DEFAULT NULL,
  p_is_explicit_revert boolean DEFAULT false,
  p_client_updated_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_organizer boolean;
  v_current public.legs%ROWTYPE;
  v_updated public.legs%ROWTYPE;
BEGIN
  IF NOT public.has_grant(p_event_id, ARRAY['participant', 'organizer']) THEN
    RAISE EXCEPTION 'Event access required' USING ERRCODE = '42501';
  END IF;

  v_is_organizer := public.has_grant(p_event_id, ARRAY['organizer']);

  SELECT *
  INTO v_current
  FROM public.legs
  WHERE id = p_leg_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leg not found' USING ERRCODE = 'P0002';
  END IF;

  -- Rule 1: Idempotency
  IF v_current.last_mutation_id IS NOT NULL AND v_current.last_mutation_id = p_mutation_id THEN
    RETURN jsonb_build_object(
      'applied', true,
      'reason', 'duplicate',
      'leg', to_jsonb(v_current)
    );
  END IF;

  -- Rule 2: Organizer precedence
  IF NOT v_is_organizer AND v_current.updated_by_organizer AND p_client_updated_at <= v_current.client_updated_at THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'stale_or_overridden',
      'leg', to_jsonb(v_current)
    );
  END IF;

  -- Rule 3: Participant vs Participant (newest client_updated_at wins + no-regress guard)
  IF NOT v_is_organizer THEN
    IF p_client_updated_at < v_current.client_updated_at THEN
      RETURN jsonb_build_object(
        'applied', false,
        'reason', 'stale_or_overridden',
        'leg', to_jsonb(v_current)
      );
    END IF;

    IF v_current.status = 'completed' AND p_status = 'out_on_course' AND NOT COALESCE(p_is_explicit_revert, false) THEN
      RETURN jsonb_build_object(
        'applied', false,
        'reason', 'stale_or_overridden',
        'leg', to_jsonb(v_current)
      );
    END IF;
  END IF;

  UPDATE public.legs
  SET status = p_status,
      started_at = p_started_at,
      finished_at = p_finished_at,
      duration_seconds = p_duration_seconds,
      course_id = COALESCE(p_course_id, course_id),
      external_activity_url = p_external_activity_url,
      client_updated_at = p_client_updated_at,
      last_mutation_id = p_mutation_id,
      updated_by_organizer = v_is_organizer
  WHERE id = p_leg_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object(
    'applied', true,
    'reason', 'applied',
    'leg', to_jsonb(v_updated)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_leg_mutation(
  uuid, uuid, uuid, text, timestamptz, timestamptz, int, uuid, text, boolean, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_leg_mutation(
  uuid, uuid, uuid, text, timestamptz, timestamptz, int, uuid, text, boolean, timestamptz
) TO authenticated;

-- 4.11 Lightweight heartbeat RPC for 3-day GitHub Actions pause prevention
CREATE OR REPLACE FUNCTION public.ping_heartbeat()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT true;
$$;

REVOKE ALL ON FUNCTION public.ping_heartbeat() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ping_heartbeat() TO anon, authenticated;

-- ============================================================================
-- 5. REALTIME PUBLICATION & REPLICA IDENTITY FULL
-- ============================================================================

ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER TABLE public.courses REPLICA IDENTITY FULL;
ALTER TABLE public.announcements REPLICA IDENTITY FULL;
ALTER TABLE public.rounds REPLICA IDENTITY FULL;
ALTER TABLE public.teams REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.legs REPLICA IDENTITY FULL;
ALTER TABLE public.supply_items REPLICA IDENTITY FULL;
ALTER TABLE public.supply_claims REPLICA IDENTITY FULL;
ALTER TABLE public.chip_ins REPLICA IDENTITY FULL;
ALTER TABLE public.badge_definitions REPLICA IDENTITY FULL;
ALTER TABLE public.badge_awards REPLICA IDENTITY FULL;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'legs',
    'rounds',
    'teams',
    'participants',
    'announcements',
    'badge_awards',
    'badge_definitions',
    'supply_items',
    'supply_claims',
    'events',
    'courses'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY v_tables LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;
