-- Migration: 20261030_events_and_commands.sql
-- Description: Creates the events table for Task 2 (Alerts & Notifications),
-- configures RLS policies, and enables Supabase Realtime replication.

-- 1. Create the events table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_id TEXT,
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'error')),
    title TEXT NOT NULL,
    message TEXT,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for efficient querying by robot and chronological ordering
CREATE INDEX IF NOT EXISTS idx_events_robot_id ON public.events(robot_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_acknowledged ON public.events(acknowledged);

-- 2. Enable Row-Level Security (RLS)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view all events
CREATE POLICY "Allow authenticated users to read events"
    ON public.events
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users to create events
CREATE POLICY "Allow authenticated users to insert events"
    ON public.events
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow authenticated users to update events (e.g. acknowledge)
CREATE POLICY "Allow authenticated users to update events"
    ON public.events
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow public anon read/insert if operating in local dev mode without strict auth
CREATE POLICY "Allow anon read events"
    ON public.events
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "Allow anon insert events"
    ON public.events
    FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "Allow anon update events"
    ON public.events
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- 3. Enable Realtime Replication on the events table
-- This enables frontend clients to receive real-time postgres_changes notifications
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
    END IF;
END $$;

