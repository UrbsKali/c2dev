-- Migration: 20261031_commands_realtime_and_telemetry_fields.sql
-- Does NOT change the structure of `commands` (columns, types, policies, RLS state).
-- It only adds:
--   1. realtime on `commands`  -> robots / bridges receive new orders instantly
--   2. two indexes on `commands` -> fast "pending orders for this robot" lookups
--   3. three nullable columns on `telemetry_points` -> battery alerts + robot-announced control profile
-- Idempotent: safe to run several times.

-- 1. Realtime on commands
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'commands'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.commands;
    END IF;
END $$;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_commands_robot_status ON public.commands(robot_id, status);
CREATE INDEX IF NOT EXISTS idx_commands_issued_at ON public.commands(issued_at DESC);

-- 3. Optional telemetry fields (the app works without them, it just sees no battery / profile)
ALTER TABLE public.telemetry_points ADD COLUMN IF NOT EXISTS battery REAL;             -- percent
ALTER TABLE public.telemetry_points ADD COLUMN IF NOT EXISTS control_profile TEXT;     -- profile id announced by the robot
ALTER TABLE public.telemetry_points ADD COLUMN IF NOT EXISTS control_descriptor JSONB; -- full device profile announced by the robot
