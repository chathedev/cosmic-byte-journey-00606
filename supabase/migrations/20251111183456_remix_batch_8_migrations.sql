
-- Migration: 20251010055645
-- Create meetings table
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  transcript TEXT NOT NULL,
  protocol TEXT,
  folder TEXT NOT NULL DEFAULT 'Allmänt',
  "userId" TEXT NOT NULL,
  "isCompleted" BOOLEAN DEFAULT false,
  "protocolCount" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create folders table
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE("userId", name)
);

-- Enable RLS
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- Meetings RLS policies (public access for now - can be restricted later)
CREATE POLICY "Allow all access to meetings" 
ON public.meetings 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Folders RLS policies (public access for now - can be restricted later)
CREATE POLICY "Allow all access to folders" 
ON public.folders 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates on meetings
CREATE TRIGGER update_meetings_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- Migration: 20251010093518
-- Add a counted flag to ensure each meeting increments usage only once
ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS counted boolean NOT NULL DEFAULT false;

-- Migration: 20251024092518
-- Create meeting_agendas table for storing reusable meeting templates
CREATE TABLE public.meeting_agendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  createdAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.meeting_agendas ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own agendas" 
ON public.meeting_agendas 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create their own agendas" 
ON public.meeting_agendas 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update their own agendas" 
ON public.meeting_agendas 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete their own agendas" 
ON public.meeting_agendas 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_meeting_agendas_updated_at
BEFORE UPDATE ON public.meeting_agendas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add agenda field to meetings table
ALTER TABLE public.meetings 
ADD COLUMN agendaId UUID REFERENCES public.meeting_agendas(id) ON DELETE SET NULL;

-- Migration: 20251102144120
-- Create roles table for admin/owner management
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now(),
  created_by text
);

-- Enable RLS
alter table public.user_roles enable row level security;

-- Policies
-- 1) Anyone can read their own role; owner can read all
create policy "read_own_or_owner_read_all" on public.user_roles
for select using (
  (auth.jwt() ->> 'email') = email
  or lower((auth.jwt() ->> 'email')) = lower('vildewretling@gmail.com')
);

-- 2) Only owner can insert admin/owner roles
create policy "owner_can_insert_roles" on public.user_roles
for insert with check (
  lower((auth.jwt() ->> 'email')) = lower('vildewretling@gmail.com')
);

-- 3) Only owner can update roles
create policy "owner_can_update_roles" on public.user_roles
for update using (
  lower((auth.jwt() ->> 'email')) = lower('vildewretling@gmail.com')
);

-- 4) Only owner can delete roles
create policy "owner_can_delete_roles" on public.user_roles
for delete using (
  lower((auth.jwt() ->> 'email')) = lower('vildewretling@gmail.com')
);

-- Seed owner role if missing
insert into public.user_roles (email, role, created_by)
select 'vildewretling@gmail.com', 'owner', 'system'
where not exists (
  select 1 from public.user_roles where lower(email) = lower('vildewretling@gmail.com')
);

-- Optional: add to realtime publication
alter publication supabase_realtime add table public.user_roles;

-- Migration: 20251102144153
-- Fix search_path security for update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$function$;

-- Migration: 20251102144649
-- Drop existing policies
DROP POLICY IF EXISTS "read_own_or_owner_read_all" ON public.user_roles;
DROP POLICY IF EXISTS "owner_can_insert_roles" ON public.user_roles;
DROP POLICY IF EXISTS "owner_can_update_roles" ON public.user_roles;
DROP POLICY IF EXISTS "owner_can_delete_roles" ON public.user_roles;

-- Create a helper function to get current user's email
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- Recreate policies using the helper function
CREATE POLICY "Users can read their own role or owner reads all"
ON public.user_roles
FOR SELECT
USING (
  lower(email) = lower(public.current_user_email())
  OR lower(public.current_user_email()) = 'vildewretling@gmail.com'
);

CREATE POLICY "Owner can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  lower(public.current_user_email()) = 'vildewretling@gmail.com'
);

CREATE POLICY "Owner can update roles"
ON public.user_roles
FOR UPDATE
USING (
  lower(public.current_user_email()) = 'vildewretling@gmail.com'
);

CREATE POLICY "Owner can delete roles"
ON public.user_roles
FOR DELETE
USING (
  lower(public.current_user_email()) = 'vildewretling@gmail.com'
);

-- Migration: 20251102204347
-- Harden RLS across core tables and add admin helper

-- 1) Helper function to check admin/owner role via user_roles (by email)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where lower(ur.email) = lower(public.current_user_email())
      and lower(ur.role) in ('admin','owner')
  );
$$;

-- 2) Ensure RLS enabled and replace overly-permissive policies
alter table public.folders enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_agendas enable row level security;

-- Drop permissive/incorrect policies
drop policy if exists "Allow all access to folders" on public.folders;
drop policy if exists "Allow all access to meetings" on public.meetings;

-- meeting_agendas had 'true' policies - replace with scoped ones
drop policy if exists "Users can create their own agendas" on public.meeting_agendas;
drop policy if exists "Users can delete their own agendas" on public.meeting_agendas;
drop policy if exists "Users can update their own agendas" on public.meeting_agendas;
drop policy if exists "Users can view their own agendas" on public.meeting_agendas;

-- 3) FOLDERS: owner-only access (by email) + admin override
create policy "Folders: users can view their own or admin"
  on public.folders for select to authenticated
  using (lower("userId") = lower(public.current_user_email()) or public.is_admin());

create policy "Folders: users can insert their own or admin"
  on public.folders for insert to authenticated
  with check (lower("userId") = lower(public.current_user_email()) or public.is_admin());

create policy "Folders: users can update their own or admin"
  on public.folders for update to authenticated
  using (lower("userId") = lower(public.current_user_email()) or public.is_admin());

create policy "Folders: users can delete their own or admin"
  on public.folders for delete to authenticated
  using (lower("userId") = lower(public.current_user_email()) or public.is_admin());

-- 4) MEETINGS: owner-only access (by email) + admin override
create policy "Meetings: users can view their own or admin"
  on public.meetings for select to authenticated
  using (lower("userId") = lower(public.current_user_email()) or public.is_admin());

create policy "Meetings: users can insert their own or admin"
  on public.meetings for insert to authenticated
  with check (lower("userId") = lower(public.current_user_email()) or public.is_admin());

create policy "Meetings: users can update their own or admin"
  on public.meetings for update to authenticated
  using (lower("userId") = lower(public.current_user_email()) or public.is_admin());

create policy "Meetings: users can delete their own or admin"
  on public.meetings for delete to authenticated
  using (lower("userId") = lower(public.current_user_email()) or public.is_admin());

-- 5) MEETING_AGENDAS: owner-only access (by email) + admin override
create policy "Agendas: users can view their own or admin"
  on public.meeting_agendas for select to authenticated
  using (lower("userid") = lower(public.current_user_email()) or public.is_admin());

create policy "Agendas: users can insert their own or admin"
  on public.meeting_agendas for insert to authenticated
  with check (lower("userid") = lower(public.current_user_email()) or public.is_admin());

create policy "Agendas: users can update their own or admin"
  on public.meeting_agendas for update to authenticated
  using (lower("userid") = lower(public.current_user_email()) or public.is_admin());

create policy "Agendas: users can delete their own or admin"
  on public.meeting_agendas for delete to authenticated
  using (lower("userid") = lower(public.current_user_email()) or public.is_admin());

-- Migration: 20251107220650
-- Create action items table for AI-generated tasks
CREATE TABLE public.action_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  deadline TIMESTAMP WITH TIME ZONE,
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

-- Users can view their own action items or if admin
CREATE POLICY "Users can view their own action items or admin"
ON public.action_items
FOR SELECT
USING (lower(user_id) = lower(current_user_email()) OR is_admin());

-- Users can insert their own action items or if admin
CREATE POLICY "Users can insert their own action items or admin"
ON public.action_items
FOR INSERT
WITH CHECK (lower(user_id) = lower(current_user_email()) OR is_admin());

-- Users can update their own action items or if admin
CREATE POLICY "Users can update their own action items or admin"
ON public.action_items
FOR UPDATE
USING (lower(user_id) = lower(current_user_email()) OR is_admin());

-- Users can delete their own action items or if admin
CREATE POLICY "Users can delete their own action items or admin"
ON public.action_items
FOR DELETE
USING (lower(user_id) = lower(current_user_email()) OR is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_action_items_updated_at
BEFORE UPDATE ON public.action_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
