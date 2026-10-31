-- Migration: 20261031_commands_dev_policies.sql
-- DEV ONLY. `commands` has RLS enabled and no policy, so the web app (anon / authenticated
-- keys) can neither write orders nor receive them through realtime.
-- These policies mirror the permissive ones already used on `events`.
-- Replace them before production (e.g. INSERT only for operators assigned to the robot's mission).
-- Structure of the table is untouched. Idempotent.

DROP POLICY IF EXISTS "dev read commands" ON public.commands;
CREATE POLICY "dev read commands" ON public.commands
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "dev insert commands" ON public.commands;
CREATE POLICY "dev insert commands" ON public.commands
    FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Lets a robot bridge using the anon key report progress (queued -> accepted -> completed).
-- Not needed if the bridge uses the service role key.
DROP POLICY IF EXISTS "dev update commands" ON public.commands;
CREATE POLICY "dev update commands" ON public.commands
    FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
