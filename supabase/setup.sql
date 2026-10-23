-- Here To Serve database setup. Paste this whole file into Supabase > SQL Editor > New query, then Run.
-- Safe to run again after updates: it only adds what's missing and replaces functions.

-- ============ Helpers ============
-- Random keys: two random UUIDs joined (64 hex characters), no extension needed.
create or replace function public.hts_new_token() returns text language sql volatile set search_path = public as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;
-- Shorter code for a class link (the QR code on the screen)
create or replace function public.hts_new_code() returns text language sql volatile set search_path = public as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
$$;

-- The 11 gifts, in tie-break order
create or replace function public.hts_gift_keys() returns text[] language sql immutable set search_path = public as $$
  select array['sh','te','me','le','en','he','ad','fa','ho','ev','gi']
$$;

-- The 33 gift questions: which two gifts each one compares. Must match PAIRS in src/bank.js (tested).
create or replace function public.hts_pairs() returns table(i int, a text, b text) language sql immutable set search_path = public as $$
  values (0,'sh','te'),(1,'te','me'),(2,'me','le'),(3,'le','en'),(4,'en','he'),(5,'he','ad'),(6,'ad','fa'),(7,'fa','ho'),
         (8,'ho','ev'),(9,'ev','gi'),(10,'gi','sh'),(11,'sh','me'),(12,'te','le'),(13,'me','en'),(14,'le','he'),(15,'en','ad'),
         (16,'he','fa'),(17,'ad','ho'),(18,'fa','ev'),(19,'ho','gi'),(20,'ev','sh'),(21,'gi','te'),(22,'sh','le'),(23,'te','en'),
         (24,'me','he'),(25,'le','ad'),(26,'en','fa'),(27,'he','ho'),(28,'ad','ev'),(29,'fa','gi'),(30,'ho','sh'),(31,'ev','te'),
         (32,'gi','me')
$$;

-- A new church starts with Pinewood's teams and the 8 commitments. Beliefs are each church's own (blank until set).
create or replace function public.hts_default_settings() returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'teams', '[
      {"name":"Outreach","gifts":["ev","me","le"],"boosts":["Our city","People far from God"],"check":false},
      {"name":"Prayer","gifts":["fa","me","en"],"boosts":["Prayer","The hurting"],"check":false},
      {"name":"Worship","gifts":["fa","en"],"boosts":["Music or vocals","Worship"],"check":false},
      {"name":"Connect","gifts":["ho","en","ev"],"boosts":["Cooking or hosting","Welcoming new people"],"check":false},
      {"name":"Kids","gifts":["sh","te","he"],"boosts":["Kids"],"check":true},
      {"name":"Youth","gifts":["sh","te","en"],"boosts":["Students"],"check":true},
      {"name":"AVL","gifts":["he","ad"],"boosts":["Tech or AV","Design or social media"],"check":false},
      {"name":"Set up / tear down","gifts":["he","ad","le"],"boosts":["Trades or building"],"check":false},
      {"name":"Security","gifts":["he","le"],"boosts":["Military or law enforcement","Medical"],"check":true}
    ]'::jsonb,
    'commitments', '[
      {"k":"faith","word":"Faith","statement":"I have trusted Jesus and been baptized as a believer.","verse":"Romans 10:9; Acts 2:41"},
      {"k":"belief","word":"Belief","statement":"I affirm what our church believes.","verse":"2 Timothy 1:13"},
      {"k":"gather","word":"Gather","statement":"I will gather faithfully with our church and a group.","verse":"Hebrews 10:24–25"},
      {"k":"serve","word":"Serve","statement":"I will serve faithfully with the gifts God gave me.","verse":"1 Peter 4:10"},
      {"k":"give","word":"Give","statement":"I will give generously toward the mission.","verse":"2 Corinthians 9:7"},
      {"k":"unity","word":"Unity","statement":"I will protect the unity of our church.","verse":"Ephesians 4:3"},
      {"k":"pray","word":"Pray","statement":"I will pray for our church and its leaders.","verse":"Ephesians 6:18"},
      {"k":"invite","word":"Invite","statement":"I will invite others to meet Jesus.","verse":"Matthew 28:19"}
    ]'::jsonb,
    'beliefs', '[]'::jsonb,
    'requireBaptism', true,
    -- What this church calls joining (owner, 23 Oct 2026: every church has its own words; Pinewood says "join the serve team")
    'joinTerm', 'join the serve team')
$$;


-- ============ Tables ============
create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  logo_url text,
  accent text not null default '#1E4D3A' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  settings jsonb not null default public.hts_default_settings(),  -- teams[], commitments[], beliefs[], requireBaptism
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Three access levels, highest first:
--   admin (Administrator): everything for the church, including settings, Planning Center and the team.
--   staff (Staff): people, notes, gift/team edits, next steps, classes, snapshot. No settings or team management.
--   team_lead (Team Lead): only their own team(s): the handoff list, first Sundays, steps assigned to them.
--     During class, a Team Lead an Administrator or Staff member assigns to that class can interview its people.
-- prayer: a separate switch for seeing prayer requests (on by default for Administrator and Staff).
create table if not exists public.staff (
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  teams text[] not null default '{}',
  prayer boolean not null default false,
  email text,
  name text,
  created_at timestamptz not null default now(),
  primary key (church_id, user_id)
);
alter table public.staff add column if not exists teams text[] not null default '{}';
alter table public.staff add column if not exists prayer boolean not null default false;
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('admin', 'staff', 'team_lead'));
create index if not exists staff_user_idx on public.staff(user_id);

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  email text not null,
  role text not null,
  teams text[] not null default '{}',
  prayer boolean,
  token text not null unique default public.hts_new_token(),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.staff_invites add column if not exists teams text[] not null default '{}';
alter table public.staff_invites add column if not exists prayer boolean;
alter table public.staff_invites drop constraint if exists staff_invites_role_check;
alter table public.staff_invites add constraint staff_invites_role_check check (role in ('admin', 'staff', 'team_lead'));
create index if not exists staff_invites_church_idx on public.staff_invites(church_id);

-- One membership class. The join code is what the QR code on the screen opens.
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  class_date date not null default current_date,
  join_code text not null unique default public.hts_new_code(),
  open boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists classes_church_idx on public.classes(church_id, class_date desc);

-- Team Leads helping with one-on-ones in a class (interview mode for that class's people only)
create table if not exists public.class_leaders (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  primary key (class_id, user_id)
);

-- One person who took the class. Their device holds the 64-character key; no account needed.
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  key text not null unique default public.hts_new_token(),
  status text not null default 'started' check (status in ('started', 'submitted')),
  step int not null default 0,
  name text,
  email text,
  phone text,
  answers jsonb not null default '{}'::jsonb,   -- Part 1 (never the prayer request; that lives in prayer_requests)
  picks jsonb not null default '[]'::jsonb,     -- Part 2: the gift chosen on each of the 33 questions
  scores jsonb,                                 -- gift -> 0..6, counted by the server
  top_gifts text[],
  rec_teams text[],
  decision text check (decision in ('joining', 'not_ready')),
  commitments jsonb not null default '{}'::jsonb,  -- commitment key -> when it was checked
  adult_at timestamptz,
  team text,                                    -- the team a leader confirmed or changed
  gifts_override text[],                        -- a leader's correction to the top gifts
  first_sunday date,                            -- set by the team lead
  ext_system text,                              -- 'pco' or 'breeze' once sent to the church's people system
  ext_person_id text,                           -- their id in that system
  ext_synced_at timestamptz,
  ext_state jsonb not null default '{}'::jsonb, -- what was last written there (decision noted, tags assigned)
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.members add column if not exists first_sunday date;
alter table public.members add column if not exists ext_system text;
alter table public.members add column if not exists ext_person_id text;
alter table public.members add column if not exists ext_synced_at timestamptz;
alter table public.members add column if not exists ext_state jsonb not null default '{}'::jsonb;
-- Pastor approval (owner, 23 Oct 2026): "I'm ready to join" waits for a pastor to approve after the one-on-one, or to put it on hold
alter table public.members add column if not exists approved_at timestamptz;
alter table public.members add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.members add column if not exists held_at timestamptz;
alter table public.members add column if not exists hold_note text;
-- The one-on-one leader the class host paired with this person
alter table public.members add column if not exists interviewer uuid references auth.users(id) on delete set null;
alter table public.members drop column if exists pco_person_id;
alter table public.members drop column if exists pco_synced_at;
alter table public.members drop column if exists pco_noted;
create index if not exists members_church_idx on public.members(church_id, created_at desc);
create index if not exists members_class_idx on public.members(class_id);

-- Prayer requests sit in their own table so only people with prayer access see them.
create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  member_id uuid not null unique references public.members(id) on delete cascade,
  who text,
  body text not null check (length(body) between 1 and 2000),
  prayed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prayer_church_idx on public.prayer_requests(church_id, created_at desc);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  author uuid references auth.users(id) on delete set null,
  author_name text,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists notes_member_idx on public.notes(member_id, created_at);

create table if not exists public.next_steps (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null,
  title text not null check (length(title) between 1 and 200),
  owner_label text,
  owner_user uuid references auth.users(id) on delete set null,
  due date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists steps_church_idx on public.next_steps(church_id, done_at, due);
create index if not exists steps_member_idx on public.next_steps(member_id);
create index if not exists steps_owner_idx on public.next_steps(owner_user) where done_at is null;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ============ Connections to a church's people system (Planning Center or Breeze, one at a time) ============
-- Early Planning-Center-only tables, renamed before launch
drop table if exists public.pco_connections, public.pco_oauth_states, public.pco_team_map, public.pco_rosters, public.pco_queue, public.pco_sync_runs cascade;

-- Credentials live only here. No security rule lets a browser read this table; only the server functions use it.
create table if not exists public.connections (
  church_id uuid primary key references public.churches(id) on delete cascade,
  system text not null check (system in ('pco', 'breeze')),
  access_token text,          -- Planning Center (OAuth)
  refresh_token text,
  expires_at timestamptz,
  subdomain text,             -- Breeze: <subdomain>.breezechms.com
  api_key text,               -- Breeze
  org_name text,
  ext_ids jsonb not null default '{}'::jsonb,   -- ids this app created there (tab and fields, or tag folder and tags)
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now()
);
-- One-time codes that tie Planning Center's sign-in back to the church that started it
create table if not exists public.oauth_states (
  state text primary key default public.hts_new_token(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Which outside team counts as which Here To Serve team. source: pco, breeze, or csv (a spreadsheet import)
create table if not exists public.team_map (
  church_id uuid not null references public.churches(id) on delete cascade,
  source text not null check (source in ('pco', 'breeze', 'csv')),
  ext_team_id text not null,
  ext_team_name text,
  hts_team text,
  primary key (church_id, source, ext_team_id)
);
-- Who is on each outside team right now (refreshed by each pull or import)
create table if not exists public.rosters (
  church_id uuid not null references public.churches(id) on delete cascade,
  source text not null check (source in ('pco', 'breeze', 'csv')),
  ext_team_id text not null,
  person_key text not null,   -- their id there, or an email/name for a spreadsheet
  name text,
  member_id uuid references public.members(id) on delete set null,
  pulled_at timestamptz not null default now(),
  primary key (church_id, source, ext_team_id, person_key)
);
-- People to send to the connected system (filled by triggers, emptied by the sync function)
create table if not exists public.sync_queue (
  member_id uuid primary key references public.members(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  queued_at timestamptz not null default now(),
  tries int not null default 0,
  last_error text
);
create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  church_id uuid not null references public.churches(id) on delete cascade,
  system text not null check (system in ('pco', 'breeze', 'csv')),
  kind text not null check (kind in ('push', 'pull', 'connect', 'test', 'import')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  pushed int not null default 0,
  pulled int not null default 0,
  error text
);
create index if not exists sync_runs_church_idx on public.sync_runs(church_id, started_at desc);

-- ============ Phone app ============
-- Push notification tokens for staff phones
create table if not exists public.devices (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
-- Things to tell staff about (filled by triggers, emptied by the notify function)
create table if not exists public.notify_queue (
  id bigint generated always as identity primary key,
  church_id uuid not null references public.churches(id) on delete cascade,
  kind text not null,
  member_id uuid references public.members(id) on delete cascade,
  step_id uuid references public.next_steps(id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists notify_overdue_once on public.notify_queue(step_id) where kind = 'overdue';
alter table public.notify_queue drop constraint if exists notify_queue_kind_check;
alter table public.notify_queue add constraint notify_queue_kind_check check (kind in ('submitted', 'overdue', 'handoff'));

-- ============ Access checks (used by security rules and functions) ============
create or replace function public.hts_role(p_church uuid) returns text language sql stable security definer set search_path = public as $$
  select role from public.staff where church_id = p_church and user_id = auth.uid()
$$;
create or replace function public.hts_has(p_church uuid, p_roles text[]) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.hts_role(p_church) = any(p_roles), false)
$$;
create or replace function public.hts_is_staff(p_church uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where church_id = p_church and user_id = auth.uid())
$$;
-- Administrator or Staff
create or replace function public.hts_is_core(p_church uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.hts_has(p_church, array['admin', 'staff'])
$$;
create or replace function public.hts_prayer_ok(p_church uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select prayer from public.staff where church_id = p_church and user_id = auth.uid()), false)
$$;
create or replace function public.hts_my_teams(p_church uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select teams from public.staff where church_id = p_church and user_id = auth.uid() and role = 'team_lead'), '{}')
$$;
create or replace function public.hts_member_church(p_member uuid) returns uuid language sql stable security definer set search_path = public as $$
  select church_id from public.members where id = p_member
$$;
-- A Team Lead assigned to this person's class, while that class is open
create or replace function public.hts_interviewer(p_member uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m join public.classes k on k.id = m.class_id
                 join public.class_leaders cl on cl.class_id = k.id and cl.user_id = auth.uid()
                 join public.staff s on s.church_id = m.church_id and s.user_id = auth.uid()
                 where m.id = p_member and k.open)
$$;
-- Can see and work with this person's card: Administrator, Staff, or their class's interviewing Team Lead
create or replace function public.hts_can_member(p_member uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.hts_is_core(public.hts_member_church(p_member)) or public.hts_interviewer(p_member)
$$;
-- The person is headed to one of this Team Lead's teams
create or replace function public.hts_on_my_team(p_member uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.id = p_member and m.status = 'submitted' and m.approved_at is not null
                 and coalesce(m.team, m.rec_teams[1]) = any(public.hts_my_teams(m.church_id)))
$$;

-- ============ Security rules ============
alter table public.churches enable row level security;
alter table public.staff enable row level security;
alter table public.staff_invites enable row level security;
alter table public.classes enable row level security;
alter table public.class_leaders enable row level security;
alter table public.members enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.notes enable row level security;
alter table public.next_steps enable row level security;
alter table public.platform_admins enable row level security;
alter table public.connections enable row level security;
alter table public.oauth_states enable row level security;
alter table public.team_map enable row level security;
alter table public.rosters enable row level security;
alter table public.sync_queue enable row level security;
alter table public.sync_runs enable row level security;
alter table public.devices enable row level security;
alter table public.notify_queue enable row level security;

-- Clear every rule first so renamed or retired rules from earlier versions don't linger
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in
    ('churches','staff','staff_invites','classes','class_leaders','members','prayer_requests','notes','next_steps','platform_admins',
     'connections','oauth_states','team_map','rosters','sync_queue','sync_runs','devices','notify_queue')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

create policy "staff read church" on public.churches for select to authenticated using (public.hts_is_staff(id));
create policy "admins edit church" on public.churches for update to authenticated using (public.hts_has(id, array['admin'])) with check (public.hts_has(id, array['admin']));

-- Everyone on the team sees the team list (names and levels; no answers)
create policy "staff read team" on public.staff for select to authenticated using (public.hts_is_staff(church_id));

create policy "admins read invites" on public.staff_invites for select to authenticated using (public.hts_has(church_id, array['admin']));
create policy "admins delete invites" on public.staff_invites for delete to authenticated using (public.hts_has(church_id, array['admin']));

create policy "read classes" on public.classes for select to authenticated
  using (public.hts_is_core(church_id) or exists (select 1 from public.class_leaders cl where cl.class_id = classes.id and cl.user_id = auth.uid()));
create policy "core add classes" on public.classes for insert to authenticated with check (public.hts_is_core(church_id) and created_by = auth.uid());
create policy "core edit classes" on public.classes for update to authenticated using (public.hts_is_core(church_id)) with check (public.hts_is_core(church_id));

create policy "read class leaders" on public.class_leaders for select to authenticated using (public.hts_is_staff(church_id));

create policy "read people" on public.members for select to authenticated using (public.hts_is_core(church_id) or public.hts_interviewer(id));
create policy "admins delete people" on public.members for delete to authenticated using (public.hts_has(church_id, array['admin']));

create policy "prayer readers" on public.prayer_requests for select to authenticated using (public.hts_prayer_ok(church_id));
create policy "prayer mark prayed" on public.prayer_requests for update to authenticated using (public.hts_prayer_ok(church_id)) with check (public.hts_prayer_ok(church_id));

create policy "notes read" on public.notes for select to authenticated using (public.hts_is_core(church_id) or public.hts_interviewer(member_id));

create policy "steps read" on public.next_steps for select to authenticated using (public.hts_is_core(church_id) or owner_user = auth.uid());
create policy "steps edit" on public.next_steps for update to authenticated
  using (public.hts_is_core(church_id) or (owner_user = auth.uid() and public.hts_is_staff(church_id)))
  with check (public.hts_is_core(church_id) or (owner_user = auth.uid() and public.hts_is_staff(church_id)));
create policy "steps add" on public.next_steps for insert to authenticated
  with check (public.hts_is_core(church_id) and public.hts_member_church(member_id) = church_id);
create policy "steps delete" on public.next_steps for delete to authenticated using (public.hts_is_core(church_id));

create policy "platform admins self" on public.platform_admins for select to authenticated using (user_id = auth.uid());

-- Connections: no rules on connections, oauth_states or sync_queue, so browsers can never read them.
create policy "core read team map" on public.team_map for select to authenticated using (public.hts_is_core(church_id));
create policy "core read rosters" on public.rosters for select to authenticated using (public.hts_is_core(church_id));
create policy "admins read sync runs" on public.sync_runs for select to authenticated using (public.hts_has(church_id, array['admin']));

create policy "own devices" on public.devices for select to authenticated using (user_id = auth.uid());
create policy "own devices delete" on public.devices for delete to authenticated using (user_id = auth.uid());

-- Guards: what signed-in people may change directly
create or replace function public.hts_guard_church() returns trigger language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by then raise exception 'That change is not allowed'; end if;
  return new;
end $$;
drop trigger if exists hts_guard_church on public.churches;
create trigger hts_guard_church before update on public.churches for each row when (current_user = 'authenticated') execute function public.hts_guard_church();

create or replace function public.hts_guard_class() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.join_code := public.hts_new_code(); return new; end if;
  if new.church_id is distinct from old.church_id or new.join_code is distinct from old.join_code or new.created_by is distinct from old.created_by then
    raise exception 'That change is not allowed';
  end if;
  return new;
end $$;
drop trigger if exists hts_guard_class on public.classes;
create trigger hts_guard_class before insert or update on public.classes for each row when (current_user = 'authenticated') execute function public.hts_guard_class();

create or replace function public.hts_guard_step() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.church_id is distinct from old.church_id or new.member_id is distinct from old.member_id or new.kind is distinct from old.kind then
      raise exception 'That change is not allowed';
    end if;
    -- A Team Lead can only check their own steps off (or back on)
    if not public.hts_is_core(old.church_id) and (new.title is distinct from old.title or new.owner_label is distinct from old.owner_label
       or new.owner_user is distinct from old.owner_user or new.due is distinct from old.due) then
      raise exception 'Team Leads can only mark their own steps done';
    end if;
  end if;
  if new.owner_user is not null and not exists (select 1 from public.staff where church_id = new.church_id and user_id = new.owner_user) then
    raise exception 'The owner has to be on this church''s team';
  end if;
  return new;
end $$;
drop trigger if exists hts_guard_step on public.next_steps;
create trigger hts_guard_step before insert or update on public.next_steps for each row when (current_user = 'authenticated') execute function public.hts_guard_step();

create or replace function public.hts_guard_prayer() returns trigger language plpgsql set search_path = public as $$
begin
  if new.body is distinct from old.body or new.member_id is distinct from old.member_id or new.church_id is distinct from old.church_id or new.who is distinct from old.who then
    raise exception 'That change is not allowed';
  end if;
  return new;
end $$;
drop trigger if exists hts_guard_prayer on public.prayer_requests;
create trigger hts_guard_prayer before update on public.prayer_requests for each row when (current_user = 'authenticated') execute function public.hts_guard_prayer();

-- ============ Churches and the team ============
create or replace function public.hts_create_church(p_name text, p_name_self text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; em text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if coalesce(length(trim(p_name)), 0) = 0 then raise exception 'Name your church'; end if;
  if (select count(*) from public.staff where user_id = auth.uid() and role = 'admin') >= 5 then raise exception 'You can run up to 5 churches'; end if;
  select email into em from auth.users where id = auth.uid();
  insert into public.churches(name, created_by) values (left(trim(p_name), 120), auth.uid()) returning id into cid;
  insert into public.staff(church_id, user_id, role, prayer, email, name) values (cid, auth.uid(), 'admin', true, em, left(p_name_self, 120));
  return cid;
end $$;

-- Team names must be on the church's list
create or replace function public.hts_clean_teams(p_church uuid, p_teams text[]) returns text[] language plpgsql stable security definer set search_path = public as $$
declare bad text;
begin
  select t into bad from unnest(coalesce(p_teams, '{}')) t
    where not exists (select 1 from public.churches c, jsonb_array_elements(c.settings->'teams') x where c.id = p_church and x->>'name' = t) limit 1;
  if bad is not null then raise exception 'There''s no % team on your list', bad; end if;
  return coalesce((select array_agg(distinct t) from unnest(p_teams) t), '{}');
end $$;

create or replace function public.hts_invite_staff(p_church uuid, p_email text, p_role text, p_teams text[] default '{}', p_prayer boolean default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare iid uuid; tm text[];
begin
  if not public.hts_has(p_church, array['admin']) then raise exception 'Only Administrators can invite'; end if;
  if p_role not in ('admin', 'staff', 'team_lead') then raise exception 'Unknown access level'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn''t look right'; end if;
  tm := public.hts_clean_teams(p_church, p_teams);
  if p_role = 'team_lead' and cardinality(tm) = 0 then raise exception 'Pick the team(s) they lead'; end if;
  if (select count(*) from public.staff_invites where church_id = p_church and accepted_at is null) >= 100 then raise exception 'Too many open invites'; end if;
  insert into public.staff_invites(church_id, email, role, teams, prayer, invited_by)
    values (p_church, lower(trim(p_email)), p_role, case when p_role = 'team_lead' then tm else '{}' end, p_prayer, auth.uid()) returning id into iid;
  return iid;
end $$;

create or replace function public.hts_invite_info(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('church', c.name, 'role', i.role, 'email', i.email, 'teams', to_jsonb(i.teams))
  from public.staff_invites i join public.churches c on c.id = i.church_id
  where i.token = p_token and i.accepted_at is null and i.created_at > now() - interval '30 days'
$$;

create or replace function public.hts_accept_invite(p_token text, p_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites; em text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.staff_invites where token = p_token and accepted_at is null and created_at > now() - interval '30 days';
  if inv.id is null then raise exception 'This invite has expired or was already used'; end if;
  select email into em from auth.users where id = auth.uid();
  if lower(coalesce(em, '')) <> lower(inv.email) then raise exception 'This invite was sent to %. Sign in with that email to accept it.', inv.email; end if;
  insert into public.staff(church_id, user_id, role, teams, prayer, email, name)
    values (inv.church_id, auth.uid(), inv.role, inv.teams, coalesce(inv.prayer, inv.role in ('admin', 'staff')), em, left(p_name, 120))
    on conflict (church_id, user_id) do update set role = excluded.role, teams = excluded.teams, prayer = excluded.prayer;
  update public.staff_invites set accepted_at = now() where id = inv.id;
  return inv.church_id;
end $$;

-- Change someone's level, teams or prayer access, or remove them ('remove')
create or replace function public.hts_set_staff(p_church uuid, p_user uuid, p_role text, p_teams text[] default null, p_prayer boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare cur public.staff; admins int; tm text[];
begin
  if not public.hts_has(p_church, array['admin']) then raise exception 'Only Administrators can change the team'; end if;
  select * into cur from public.staff where church_id = p_church and user_id = p_user;
  if cur.user_id is null then raise exception 'Not on this team'; end if;
  select count(*) into admins from public.staff where church_id = p_church and role = 'admin';
  if cur.role = 'admin' and p_role <> 'admin' and admins = 1 then raise exception 'A church needs at least one Administrator'; end if;
  if p_role = 'remove' then
    delete from public.staff where church_id = p_church and user_id = p_user;
    delete from public.class_leaders where church_id = p_church and user_id = p_user;
    return;
  end if;
  if p_role not in ('admin', 'staff', 'team_lead') then raise exception 'Unknown access level'; end if;
  tm := case when p_role = 'team_lead' then public.hts_clean_teams(p_church, coalesce(p_teams, cur.teams)) else '{}' end;
  if p_role = 'team_lead' and cardinality(tm) = 0 then raise exception 'Pick the team(s) they lead'; end if;
  update public.staff set role = p_role, teams = tm,
    prayer = coalesce(p_prayer, case when p_role <> cur.role then p_role in ('admin', 'staff') else cur.prayer end)
  where church_id = p_church and user_id = p_user;
end $$;

-- Staff or an Administrator puts a Team Lead (or anyone on the team) on a class to help with one-on-ones
create or replace function public.hts_set_class_leader(p_class uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select church_id into cid from public.classes where id = p_class;
  if not public.hts_is_core(cid) then raise exception 'Only Administrators and Staff can assign class leaders'; end if;
  if not exists (select 1 from public.staff where church_id = cid and user_id = p_user) then raise exception 'They need to be on your team first'; end if;
  if p_on then insert into public.class_leaders(class_id, user_id, church_id) values (p_class, p_user, cid) on conflict do nothing;
  else delete from public.class_leaders where class_id = p_class and user_id = p_user; end if;
end $$;
-- ============ What a member's device can do (no login; the key is the pass) ============
create or replace function public.hts_church_header(p_church uuid, p_class uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', c.name, 'logoUrl', c.logo_url, 'accent', c.accent,
    'teams', coalesce(c.settings->'teams', '[]'::jsonb), 'commitments', coalesce(c.settings->'commitments', '[]'::jsonb),
    'beliefs', coalesce(c.settings->'beliefs', '[]'::jsonb), 'className', k.name,
    'joinTerm', coalesce(nullif(c.settings->>'joinTerm', ''), 'join the serve team'),
    'requireBaptism', coalesce((c.settings->>'requireBaptism')::boolean, true))
  from public.churches c left join public.classes k on k.id = p_class
  where c.id = p_church
$$;

-- Scan the class QR code: a new member row and its key. The device keeps the key so a refresh picks up where it left off.
create or replace function public.hts_join(p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare k public.classes; m public.members;
begin
  select * into k from public.classes where join_code = p_code and open and class_date > current_date - 30;
  if k.id is null then return null; end if;
  if (select count(*) from public.members where class_id = k.id) >= 300 then raise exception 'This class is full'; end if;
  insert into public.members(church_id, class_id) values (k.church_id, k.id) returning * into m;
  return jsonb_build_object('key', m.key, 'church', public.hts_church_header(k.church_id, k.id));
end $$;

create or replace function public.hts_open(p_key text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'member', jsonb_build_object('status', m.status, 'step', m.step, 'answers', m.answers, 'picks', m.picks, 'decision', m.decision,
                                 'adult', m.adult_at is not null,
                                 -- a prayer request goes back only while the form is still open, to the same device that wrote it
                                 'prayer', case when m.status = 'started' then (select body from public.prayer_requests where member_id = m.id) end,
                                 -- their own copy after they submit: gifts, teams, commitments and status
                                 'name', m.name, 'email', m.email, 'phone', m.phone,
                                 'scores', m.scores, 'topGifts', coalesce(m.gifts_override, m.top_gifts), 'recTeams', m.rec_teams, 'team', m.team,
                                 'commitments', m.commitments, 'submittedAt', m.submitted_at,
                                 'approved', m.approved_at is not null, 'firstSunday', m.first_sunday),
    'church', public.hts_church_header(m.church_id, m.class_id))
  from public.members m where m.key = p_key and length(p_key) = 64
$$;

-- Prayer request in or out of its own table
create or replace function public.hts_put_prayer(p_member public.members, p_text text) returns void language plpgsql security definer set search_path = public as $$
declare parts text[] := regexp_split_to_array(trim(coalesce(p_member.name, '')), '\s+'); who text;
begin
  -- shown on the prayer list as a first name and last initial ("Priya S.")
  who := nullif(parts[1], '') || case when coalesce(array_length(parts, 1), 0) > 1 then ' ' || upper(left(parts[array_length(parts, 1)], 1)) || '.' else '' end;
  if p_text is null then return; end if;
  if trim(p_text) = '' then delete from public.prayer_requests where member_id = p_member.id; return; end if;
  insert into public.prayer_requests(church_id, member_id, who, body) values (p_member.church_id, p_member.id, who, left(trim(p_text), 2000))
    on conflict (member_id) do update set body = excluded.body, who = excluded.who, updated_at = now();
end $$;

create or replace function public.hts_clean_picks(p jsonb) returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(case when x.v in (pr.a, pr.b) then to_jsonb(x.v) else 'null'::jsonb end order by pr.i), '[]'::jsonb)
  from public.hts_pairs() pr
  left join lateral (select case when jsonb_typeof(p) = 'array' and jsonb_typeof(p->pr.i) = 'string' then p->>pr.i end as v) x on true
  where pr.i < greatest(0, least(33, case when jsonb_typeof(p) = 'array' then jsonb_array_length(p) else 0 end))
$$;

-- Saves after every screen
create or replace function public.hts_save(p_key text, p_answers jsonb, p_picks jsonb, p_step int) returns boolean
language plpgsql security definer set search_path = public as $$
declare m public.members; a jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 40000 then raise exception 'Too large'; end if;
  select * into m from public.members where key = p_key and length(p_key) = 64 and status = 'started' for update;
  if m.id is null then return false; end if;
  a := p_answers - 'prayer' - 'adult';
  update public.members set
    answers = a, picks = public.hts_clean_picks(coalesce(p_picks, '[]'::jsonb)), step = greatest(0, least(100, coalesce(p_step, 0))),
    name = coalesce(nullif(left(trim(a->>'name'), 120), ''), name),
    email = coalesce(nullif(left(lower(trim(a->>'email')), 200), ''), email),
    phone = coalesce(nullif(left(trim(a->>'phone'), 40), ''), phone),
    adult_at = coalesce(adult_at, case when (p_answers->>'adult') = 'true' then now() end),
    updated_at = now()
  where id = m.id returning * into m;
  if p_answers ? 'prayer' then perform public.hts_put_prayer(m, coalesce(p_answers->>'prayer', '')); end if;
  return true;
end $$;

-- Gift counts from the 33 picks (the server's own count; the device's is never trusted)
create or replace function public.hts_count(p_picks jsonb) returns jsonb language sql immutable set search_path = public as $$
  select jsonb_object_agg(g, (select count(*) from jsonb_array_elements_text(public.hts_clean_picks(p_picks)) v where v = g))
  from unnest(public.hts_gift_keys()) g
$$;

-- Top 3: highest count, ties broken by passions tapped, then the fixed gift order
create or replace function public.hts_top(p_scores jsonb, p_passions jsonb) returns text[] language sql immutable set search_path = public as $$
  select array_agg(g order by s desc, o) from (
    select g, o, (p_scores->>g)::numeric + 0.1 * (
      select count(*) from jsonb_array_elements_text(case when jsonb_typeof(p_passions) = 'array' then p_passions else '[]'::jsonb end) p
      where (p = 'Kids' and g = 'sh') or (p = 'Students' and g = 'sh') or (p = 'The hurting' and g = 'me') or (p = 'People far from God' and g = 'ev')
         or (p = 'Worship' and g = 'fa') or (p = 'Prayer' and g = 'fa') or (p = 'Welcoming new people' and g = 'ho') or (p = 'Our city' and g = 'ev')) as s
    from unnest(public.hts_gift_keys()) with ordinality as t(g, o)
    order by s desc, o limit 3) x
$$;

-- Team matches: average of the team's gift scores + 1.5 per matching skill or passion. Mirrors recommendTeams in src/engine.js.
create or replace function public.hts_recommend(p_scores jsonb, p_tapped jsonb, p_teams jsonb) returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(name order by total desc, o), '{}') from (
    select t->>'name' as name, o,
      coalesce((select avg(coalesce((p_scores->>g)::numeric, 0)) from jsonb_array_elements_text(t->'gifts') g), 0)
      + 1.5 * (select count(*) from jsonb_array_elements_text(coalesce(t->'boosts', '[]'::jsonb)) b
               where b in (select jsonb_array_elements_text(case when jsonb_typeof(p_tapped) = 'array' then p_tapped else '[]'::jsonb end))) as total
    from jsonb_array_elements(case when jsonb_typeof(p_teams) = 'array' then p_teams else '[]'::jsonb end) with ordinality as x(t, o)
    order by total desc, o limit 2) r
$$;

-- Who owns a step: the person the church picked for that kind of step in Settings (if they're still on the team)
create or replace function public.hts_step_owner(p_church uuid, p_kind text) returns uuid language sql stable security definer set search_path = public as $$
  select s.user_id from public.churches c join public.staff s on s.church_id = c.id and s.user_id::text = c.settings->'stepOwners'->>p_kind
  where c.id = p_church
$$;
-- A team's lead: the first Team Lead on that team, else whoever owns team introductions in Settings
create or replace function public.hts_team_lead(p_church uuid, p_team text) returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select user_id from public.staff where church_id = p_church and role = 'team_lead' and p_team = any(teams) order by created_at limit 1),
                  public.hts_step_owner(p_church, 'team'))
$$;

-- Team steps (background check, then the team lead introduction). Only once a pastor has approved them joining,
-- and redone when a leader changes their team.
create or replace function public.hts_team_steps(p_member uuid) returns void language plpgsql security definer set search_path = public as $$
declare m public.members; c public.churches; t text; chk boolean;
begin
  select * into m from public.members where id = p_member;
  select * into c from public.churches where id = m.church_id;
  delete from public.next_steps where member_id = m.id and done_at is null and kind in ('team', 'check');
  t := coalesce(m.team, m.rec_teams[1]);
  if t is null or m.decision <> 'joining' or m.approved_at is null or (m.answers->>'when') = 'My season is full right now' then return; end if;
  chk := exists (select 1 from jsonb_array_elements(c.settings->'teams') x where x->>'name' = t and (x->>'check')::boolean);
  -- a check already done for this person counts for any team
  if chk and not exists (select 1 from public.next_steps where member_id = m.id and kind = 'check' and done_at is not null) then
    insert into public.next_steps(church_id, member_id, kind, title, owner_label, owner_user, due)
    values (m.church_id, m.id, 'check', 'Background check for ' || t, 'Next steps pastor', public.hts_step_owner(m.church_id, 'check'), current_date + 5);
  end if;
  insert into public.next_steps(church_id, member_id, kind, title, owner_label, owner_user, due)
  values (m.church_id, m.id, 'team', 'Introduce to the ' || t || ' team lead', t || ' lead', public.hts_team_lead(m.church_id, t), current_date + 7);
end $$;

-- The staff's next steps for a submitted member. Mirrors staffSteps in src/engine.js (tested to agree).
create or replace function public.hts_make_steps(p_member uuid) returns int language plpgsql security definer set search_path = public as $$
declare m public.members; a jsonb; season_full boolean; n int := 0;
  add_step text := 'insert into public.next_steps(church_id, member_id, kind, title, owner_label, owner_user, due) values ($1, $2, $3, $4, $5, public.hts_step_owner($1, $3), current_date + $6)';
begin
  select * into m from public.members where id = p_member;
  a := m.answers;
  season_full := (a->>'when') = 'My season is full right now';
  delete from public.next_steps where member_id = m.id and done_at is null and kind <> 'custom';
  if m.decision = 'joining' then
    execute add_step using m.church_id, m.id, 'approve',
      'Approve joining after the one-on-one' || case when coalesce(a->>'bapt', '') <> 'Yes' or coalesce(a->>'faith', '') <> 'Yes' then ' (check faith and baptism)' else '' end,
      'Lead pastor', 3;
    n := n + 1;
  end if;
  if (a->>'faith') in ('Not yet', 'Not sure') then execute add_step using m.church_id, m.id, 'faith', 'Talk about following Jesus', 'Next steps pastor', 3; n := n + 1; end if;
  if (a->>'bapt') in ('Not yet', 'I''d like to talk about it') then execute add_step using m.church_id, m.id, 'baptism', 'Baptism conversation', 'Next steps pastor', 3; n := n + 1; end if;
  if coalesce(a->>'group', '') <> 'Yes' then execute add_step using m.church_id, m.id, 'group', 'Connect to a group', 'Groups pastor', 7; n := n + 1; end if;
  if m.decision = 'not_ready' then
    execute add_step using m.church_id, m.id, 'followup', 'Follow up: not ready yet', 'Next steps pastor', 7;
    execute add_step using m.church_id, m.id, 'invite', 'Invite to the next class', 'Next steps pastor', 30;
    n := n + 2;
  end if;
  if season_full then execute add_step using m.church_id, m.id, 'season', 'Check back in when their season opens up', 'Next steps pastor', 60; n := n + 1; end if;
  perform public.hts_team_steps(m.id);
  return n;
end $$;

-- A pastor approves someone joining after the one-on-one, or puts it on hold with a private note (Administrator or Staff)
create or replace function public.hts_approve(p_member uuid, p_ok boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  select * into m from public.members where id = p_member for update;
  if m.id is null or not public.hts_is_core(m.church_id) then raise exception 'Not allowed'; end if;
  if m.status <> 'submitted' or m.decision <> 'joining' then raise exception 'Only people who chose to join can be approved'; end if;
  if p_ok then
    update public.members set approved_at = now(), approved_by = auth.uid(), held_at = null, hold_note = null, updated_at = now() where id = m.id;
    update public.next_steps set done_at = now() where member_id = m.id and kind in ('approve', 'hold') and done_at is null;
    perform public.hts_team_steps(m.id);
    insert into public.notify_queue(church_id, kind, member_id) values (m.church_id, 'handoff', m.id);
  else
    update public.members set held_at = now(), approved_at = null, approved_by = null, hold_note = nullif(left(trim(coalesce(p_note, '')), 1000), ''), updated_at = now() where id = m.id;
    update public.next_steps set done_at = now() where member_id = m.id and kind = 'approve' and done_at is null;
    perform public.hts_team_steps(m.id);
    if not exists (select 1 from public.next_steps where member_id = m.id and kind = 'hold' and done_at is null) then
      insert into public.next_steps(church_id, member_id, kind, title, owner_label, owner_user, due)
      values (m.church_id, m.id, 'hold', 'Follow up: joining on hold', 'Lead pastor', coalesce(public.hts_step_owner(m.church_id, 'approve'), auth.uid()), current_date + 7);
    end if;
  end if;
end $$;

-- The class host pairs each person with a one-on-one leader (Administrator or Staff)
create or replace function public.hts_set_interviewer(p_member uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := public.hts_member_church(p_member);
begin
  if cid is null or not public.hts_is_core(cid) then raise exception 'Not allowed'; end if;
  if p_user is not null and not exists (select 1 from public.staff where church_id = cid and user_id = p_user) then raise exception 'Pick someone on your team'; end if;
  update public.members set interviewer = p_user, updated_at = now() where id = p_member;
  -- a Team Lead paired with someone gets that class's one-on-ones
  if p_user is not null and exists (select 1 from public.staff where church_id = cid and user_id = p_user and role = 'team_lead') then
    insert into public.class_leaders(class_id, user_id, church_id) select m.class_id, p_user, cid from public.members m where m.id = p_member and m.class_id is not null
      on conflict do nothing;
  end if;
end $$;

-- Submit: "I'm ready to join" (every commitment checked) or "I'm not ready to join yet"
create or replace function public.hts_submit(p_key text, p_answers jsonb, p_picks jsonb, p_decision text, p_commitments jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare m public.members; c public.churches; sc jsonb; cm jsonb := '{}'::jsonb; need text; tapped jsonb;
begin
  if p_decision not in ('joining', 'not_ready') then raise exception 'Choose ready to join or not ready yet'; end if;
  if not public.hts_save(p_key, p_answers, p_picks, 99) then return false; end if;
  select * into m from public.members where key = p_key for update;
  if m.adult_at is null then raise exception 'Please confirm you''re 18 or older'; end if;
  if jsonb_array_length(public.hts_clean_picks(m.picks)) < 33 or exists (select 1 from jsonb_array_elements(public.hts_clean_picks(m.picks)) v where v = 'null'::jsonb) then
    raise exception 'Finish all 33 gift questions first';
  end if;
  select * into c from public.churches where id = m.church_id;
  -- Owner, 23 Oct 2026: following Jesus comes first; someone who has but isn't baptized joins after baptism
  if p_decision = 'joining' and coalesce((c.settings->>'requireBaptism')::boolean, true)
     and coalesce(m.answers->>'faith', '') <> 'Yes' then
    raise exception 'Following Jesus comes first. Choose "I''m not ready yet" and a pastor will reach out.';
  end if;
  if p_decision = 'joining' then
    for need in select x->>'k' from jsonb_array_elements(coalesce(c.settings->'commitments', '[]'::jsonb)) x loop
      if not (jsonb_typeof(p_commitments) = 'array' and p_commitments ? need) then raise exception 'Check each commitment to join'; end if;
      cm := cm || jsonb_build_object(need, now());
    end loop;
  end if;
  sc := public.hts_count(m.picks);
  tapped := coalesce(m.answers->'passions', '[]'::jsonb) || coalesce(m.answers->'skills', '[]'::jsonb);
  update public.members set
    scores = sc, top_gifts = public.hts_top(sc, m.answers->'passions'),
    rec_teams = public.hts_recommend(sc, tapped, c.settings->'teams'),
    decision = p_decision, commitments = cm, status = 'submitted', step = 100, submitted_at = now(), updated_at = now()
  where id = m.id;
  perform public.hts_make_steps(m.id);
  return true;
end $$;


-- ============ Staff actions ============
-- Interview mode: adjust someone's top gifts or team (Administrator, Staff, or their class's interviewing Team Lead)
create or replace function public.hts_member_edit(p_member uuid, p_team text, p_gifts text[]) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := public.hts_member_church(p_member);
begin
  if cid is null or not public.hts_can_member(p_member) then raise exception 'Not allowed'; end if;
  if p_team is not null and p_team <> '' then perform public.hts_clean_teams(cid, array[p_team]); end if;
  if p_gifts is not null and (cardinality(p_gifts) > 3 or not p_gifts <@ public.hts_gift_keys()) then raise exception 'Pick up to 3 gifts'; end if;
  update public.members set team = nullif(p_team, ''), gifts_override = case when cardinality(p_gifts) = 0 then null else p_gifts end, updated_at = now()
  where id = p_member;
  -- a new team means a new introduction (and a background check if that team needs one)
  if exists (select 1 from public.members where id = p_member and status = 'submitted') then perform public.hts_team_steps(p_member); end if;
end $$;

create or replace function public.hts_add_note(p_member uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid := public.hts_member_church(p_member); nid uuid; nm text;
begin
  if cid is null or not public.hts_can_member(p_member) then raise exception 'Not allowed'; end if;
  if coalesce(length(trim(p_body)), 0) = 0 then raise exception 'Write a note first'; end if;
  select coalesce(name, email) into nm from public.staff where church_id = cid and user_id = auth.uid();
  insert into public.notes(church_id, member_id, author, author_name, body) values (cid, p_member, auth.uid(), nm, left(trim(p_body), 4000)) returning id into nid;
  return nid;
end $$;

-- A Team Lead's list: people headed to their team(s). Name, contact, gifts, availability. Never notes or prayer.
drop function if exists public.hts_handoff(uuid);
create or replace function public.hts_handoff(p_church uuid) returns table(member_id uuid, name text, email text, phone text, team text, top_gifts text[], serve_when text, often text, first_sunday date, submitted_at timestamptz, check_pending boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.name, m.email, m.phone, coalesce(m.team, m.rec_teams[1]), coalesce(m.gifts_override, m.top_gifts), m.answers->>'when', m.answers->>'often', m.first_sunday, m.submitted_at,
         exists (select 1 from public.next_steps s where s.member_id = m.id and s.kind = 'check' and s.done_at is null)
  from public.members m
  where m.church_id = p_church and m.status = 'submitted' and m.decision = 'joining' and m.approved_at is not null
    and (public.hts_is_core(p_church) or coalesce(m.team, m.rec_teams[1]) = any(public.hts_my_teams(p_church)))
  order by m.first_sunday nulls first, m.submitted_at desc
$$;

-- Schedule someone's first Sunday on the team (their Team Lead, Staff or an Administrator)
create or replace function public.hts_set_first_sunday(p_member uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.hts_is_core(public.hts_member_church(p_member)) or public.hts_on_my_team(p_member)) then raise exception 'Not allowed'; end if;
  -- a team that needs a background check: no first Sunday until it's done
  if p_date is not null and exists (select 1 from public.next_steps where member_id = p_member and kind = 'check' and done_at is null) then
    raise exception 'The background check isn''t done yet. Once it''s marked done, set their first Sunday.';
  end if;
  update public.members set first_sunday = p_date, updated_at = now() where id = p_member;
  -- the team intro step is done once a first Sunday is on the calendar
  if p_date is not null then update public.next_steps set done_at = coalesce(done_at, now()) where member_id = p_member and kind = 'team'; end if;
end $$;

-- Gifts across the church: how many people have each gift in their top 3 (counts only, never names)
-- Where "serving now" comes from: the connected system, or a spreadsheet import when nothing is connected
create or replace function public.hts_roster_source(p_church uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select system from public.connections where church_id = p_church), 'csv')
$$;

create or replace function public.hts_snapshot(p_church uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.hts_is_core(p_church) then jsonb_build_object(
    'people', (select count(*) from public.members where church_id = p_church and status = 'submitted' and decision = 'joining' and approved_at is not null),
    'source', public.hts_roster_source(p_church),
    'gifts', (select coalesce(jsonb_object_agg(g, n), '{}'::jsonb) from (
       select g, count(*) n from public.members m, unnest(coalesce(m.gifts_override, m.top_gifts)) g
       where m.church_id = p_church and m.status = 'submitted' and m.decision = 'joining' and m.approved_at is not null group by g) x),
    'teams', (select coalesce(jsonb_agg(jsonb_build_object(
       'name', t->>'name',
       -- serving now: the roster from the connected system (or the last spreadsheet import) when mapped, otherwise people placed here
       'serving', case when exists (select 1 from public.team_map where church_id = p_church and source = public.hts_roster_source(p_church) and hts_team = t->>'name')
                  then (select count(distinct r.person_key) from public.rosters r join public.team_map mp on mp.church_id = r.church_id and mp.source = r.source and mp.ext_team_id = r.ext_team_id
                        where r.church_id = p_church and r.source = public.hts_roster_source(p_church) and mp.hts_team = t->>'name')
                  else (select count(*) from public.members m where m.church_id = p_church and m.decision = 'joining' and m.approved_at is not null and coalesce(m.team, m.rec_teams[1]) = t->>'name' and m.first_sunday is not null) end,
       'fromSource', exists (select 1 from public.team_map where church_id = p_church and source = public.hts_roster_source(p_church) and hts_team = t->>'name'),
       -- gifted but not placed: joined members whose top gifts fit this team and who aren't on any team yet
       'gifted', (select count(*) from public.members m where m.church_id = p_church and m.decision = 'joining' and m.approved_at is not null and m.first_sunday is null
                  and coalesce(m.gifts_override, m.top_gifts) && array(select jsonb_array_elements_text(t->'gifts')))
     ) order by o), '[]'::jsonb) from public.churches c, jsonb_array_elements(c.settings->'teams') with ordinality as x(t, o) where c.id = p_church)
  ) end
$$;

-- Platform-wide counts for Parker (never anyone's answers)
create or replace function public.hts_platform_stats() returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.platform_admins where user_id = auth.uid()) then
    jsonb_build_object('churches', (select count(*) from public.churches), 'members', (select count(*) from public.members),
                       'submitted', (select count(*) from public.members where status = 'submitted'))
  end
$$;

-- ============ Connections (the browser side; credentials are only ever touched by the server functions) ============
-- Start "Connect Planning Center": a one-time state code the callback function checks.
-- A church connects one system at a time.
create or replace function public.hts_connect_begin(p_church uuid) returns text language plpgsql security definer set search_path = public as $$
declare st text; cur text;
begin
  if not public.hts_has(p_church, array['admin']) then raise exception 'Only Administrators can connect a people system'; end if;
  select system into cur from public.connections where church_id = p_church;
  if cur = 'breeze' then raise exception 'Breeze is connected. Disconnect it first; a church connects one system at a time.'; end if;
  delete from public.oauth_states where created_at < now() - interval '1 hour';
  insert into public.oauth_states(church_id, user_id) values (p_church, auth.uid()) returning state into st;
  return st;
end $$;

-- What Settings shows: which system, the last few runs, the team map. Never credentials.
create or replace function public.hts_conn_status(p_church uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.hts_is_core(p_church) then jsonb_build_object(
    'connected', exists (select 1 from public.connections where church_id = p_church),
    'system', (select system from public.connections where church_id = p_church),
    'orgName', (select org_name from public.connections where church_id = p_church),
    'connectedAt', (select connected_at from public.connections where church_id = p_church),
    'source', public.hts_roster_source(p_church),
    'queued', (select count(*) from public.sync_queue where church_id = p_church),
    'csvImportedAt', (select max(pulled_at) from public.rosters where church_id = p_church and source = 'csv'),
    'runs', case when public.hts_has(p_church, array['admin']) then (select coalesce(jsonb_agg(r order by r.started_at desc), '[]'::jsonb) from
              (select system, kind, started_at, finished_at, ok, pushed, pulled, error from public.sync_runs where church_id = p_church order by started_at desc limit 8) r) else '[]'::jsonb end,
    'map', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'extTeamId', ext_team_id, 'extTeamName', ext_team_name, 'htsTeam', hts_team,
                    'people', (select count(*) from public.rosters r where r.church_id = tm.church_id and r.source = tm.source and r.ext_team_id = tm.ext_team_id)) order by ext_team_name), '[]'::jsonb)
            from public.team_map tm where church_id = p_church and source = public.hts_roster_source(p_church))) end
$$;

create or replace function public.hts_disconnect(p_church uuid) returns void language plpgsql security definer set search_path = public as $$
declare sys text;
begin
  if not public.hts_has(p_church, array['admin']) then raise exception 'Only Administrators can disconnect'; end if;
  select system into sys from public.connections where church_id = p_church;
  delete from public.connections where church_id = p_church;
  delete from public.sync_queue where church_id = p_church;
  if sys is not null then
    delete from public.rosters where church_id = p_church and source = sys;
    insert into public.sync_runs(church_id, system, kind, ok, finished_at, error) values (p_church, sys, 'connect', true, now(), 'Disconnected');
  end if;
end $$;

-- Match an outside team (or a spreadsheet's team name) to a Here To Serve team
create or replace function public.hts_set_map(p_church uuid, p_source text, p_ext_team text, p_hts_team text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.hts_has(p_church, array['admin']) then raise exception 'Only Administrators can match teams'; end if;
  if p_hts_team is not null and p_hts_team <> '' then perform public.hts_clean_teams(p_church, array[p_hts_team]); end if;
  update public.team_map set hts_team = nullif(p_hts_team, '') where church_id = p_church and source = p_source and ext_team_id = p_ext_team;
  if not found then raise exception 'That team hasn''t been pulled or imported yet'; end if;
end $$;

-- Queue a person for the connected system when they submit, or when a leader changes their gifts, team or first Sunday
create or replace function public.hts_queue_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and exists (select 1 from public.connections where church_id = new.church_id)
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.team is distinct from new.team
          or old.gifts_override is distinct from new.gifts_override or old.decision is distinct from new.decision
          or old.first_sunday is distinct from new.first_sunday or old.approved_at is distinct from new.approved_at or old.held_at is distinct from new.held_at) then
    insert into public.sync_queue(member_id, church_id) values (new.id, new.church_id)
      on conflict (member_id) do update set queued_at = now(), tries = 0, last_error = null;
  end if;
  return new;
end $$;
drop trigger if exists hts_queue_pco on public.members;
drop function if exists public.hts_queue_pco();
drop trigger if exists hts_queue_sync on public.members;
create trigger hts_queue_sync after insert or update on public.members for each row execute function public.hts_queue_sync();
drop function if exists public.hts_pco_begin(uuid);
drop function if exists public.hts_pco_status(uuid);
drop function if exists public.hts_pco_disconnect(uuid);
drop function if exists public.hts_pco_set_map(uuid, text, text);

-- ============ Spreadsheets ============
-- Export everyone (Administrator and Staff). Prayer requests and leader notes are never exported.
-- Column names follow common church-software people imports (first_name, last_name, email, phone ...).
create or replace function public.hts_export_people(p_church uuid, p_filter text default 'all', p_class uuid default null)
returns table(first_name text, last_name text, email text, phone text, marital_status text, kids_at_home text, kids_ages text,
  faith_in_jesus text, baptized text, in_a_group text, how_they_found_us text, membership_status text, membership_date date,
  gift_1 text, gift_1_score int, gift_2 text, gift_2_score int, gift_3 text, gift_3_score int,
  recommended_team text, assigned_team text, first_sunday date, can_serve text, how_often text, skills text, passions text,
  class_name text, class_date date, open_next_steps text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hts_is_core(p_church) then raise exception 'Only Administrators and Staff can export'; end if;
  if p_filter not in ('all', 'joined', 'not_ready', 'in_progress') then raise exception 'Unknown filter'; end if;
  return query
  with g as (select m.id, coalesce(m.gifts_override, m.top_gifts) as gifts, m.scores from public.members m where m.church_id = p_church)
  select
    split_part(trim(coalesce(m.name, '')), ' ', 1),
    nullif(trim(substr(trim(coalesce(m.name, '')), length(split_part(trim(coalesce(m.name, '')), ' ', 1)) + 1)), ''),
    m.email, m.phone, m.answers->>'married', m.answers->>'kids', m.answers->>'kidsAges',
    m.answers->>'faith', m.answers->>'bapt', m.answers->>'group', m.answers->>'found',
    case when m.status <> 'submitted' then 'In progress' when m.decision = 'joining' and m.approved_at is not null then 'Joined'
         when m.decision = 'joining' and m.held_at is not null then 'On hold' when m.decision = 'joining' then 'Waiting for approval' else 'Not ready yet' end,
    m.submitted_at::date,
    public.hts_gift_name(g.gifts[1]), (g.scores->>g.gifts[1])::int,
    public.hts_gift_name(g.gifts[2]), (g.scores->>g.gifts[2])::int,
    public.hts_gift_name(g.gifts[3]), (g.scores->>g.gifts[3])::int,
    m.rec_teams[1], m.team, m.first_sunday, m.answers->>'when', m.answers->>'often',
    (select string_agg(x, '; ') from jsonb_array_elements_text(case when jsonb_typeof(m.answers->'skills') = 'array' then m.answers->'skills' else '[]' end) x),
    (select string_agg(x, '; ') from jsonb_array_elements_text(case when jsonb_typeof(m.answers->'passions') = 'array' then m.answers->'passions' else '[]' end) x),
    k.name, k.class_date,
    (select string_agg(s.title, '; ' order by s.due nulls last) from public.next_steps s where s.member_id = m.id and s.done_at is null)
  from public.members m join g on g.id = m.id left join public.classes k on k.id = m.class_id
  where m.church_id = p_church
    and (p_class is null or m.class_id = p_class)
    and (p_filter = 'all' or (p_filter = 'joined' and m.decision = 'joining' and m.approved_at is not null) or (p_filter = 'not_ready' and m.decision = 'not_ready')
         or (p_filter = 'in_progress' and m.status <> 'submitted'))
  order by m.created_at;
end $$;

create or replace function public.hts_gift_name(g text) returns text language sql immutable set search_path = public as $$
  select case g when 'sh' then 'Shepherding' when 'te' then 'Teaching' when 'me' then 'Mercy' when 'le' then 'Leadership'
    when 'en' then 'Encouragement' when 'he' then 'Helps' when 'ad' then 'Administration' when 'fa' then 'Faith'
    when 'ho' then 'Hospitality' when 'ev' then 'Evangelism' when 'gi' then 'Giving' end
$$;

create or replace function public.hts_export_steps(p_church uuid, p_open_only boolean default true)
returns table(person text, email text, step text, owner text, due date, done_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hts_is_core(p_church) then raise exception 'Only Administrators and Staff can export'; end if;
  return query
  select m.name, m.email, s.title, coalesce((select coalesce(st.name, st.email) from public.staff st where st.church_id = s.church_id and st.user_id = s.owner_user), s.owner_label),
         s.due, s.done_at, s.created_at
  from public.next_steps s join public.members m on m.id = s.member_id
  where s.church_id = p_church and (not p_open_only or s.done_at is null)
  order by s.due nulls last, s.created_at;
end $$;

-- Import a spreadsheet of team rosters (Administrator). Rows: [{email, name, team}].
-- p_teams optionally matches each team name to a Here To Serve team ({"Kids Check-in": "Kids", "Band": null});
-- names not in p_teams are matched to a Here To Serve team with the same name, if there is one.
-- With p_commit false it only reports what would happen (the preview); with true it replaces the last import.
create or replace function public.hts_import_roster(p_church uuid, p_rows jsonb, p_teams jsonb default '{}', p_commit boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; i int := 0; team text; em text; nm text; pkey text; mid uuid; hts text;
  bad jsonb := '[]'; teams jsonb := '{}'; people jsonb := '{}'; matched int := 0; counted int := 0; seen text[] := '{}';
  names text[];
begin
  if not public.hts_has(p_church, array['admin']) then raise exception 'Only Administrators can import'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Rows must be a list'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'That''s more than 5,000 rows. Split the file and import each part.'; end if;
  select array_agg(x->>'name') into names from public.churches c, jsonb_array_elements(c.settings->'teams') x where c.id = p_church;
  if p_commit then
    delete from public.rosters where church_id = p_church and source = 'csv';
    delete from public.team_map where church_id = p_church and source = 'csv';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    team := nullif(left(trim(coalesce(r->>'team', '')), 80), '');
    em := nullif(lower(trim(coalesce(r->>'email', ''))), '');
    nm := nullif(left(trim(coalesce(r->>'name', '')), 120), '');
    if team is null then bad := bad || jsonb_build_object('row', i, 'reason', 'No team'); continue; end if;
    if em is null and nm is null then bad := bad || jsonb_build_object('row', i, 'reason', 'No email or name'); continue; end if;
    if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then bad := bad || jsonb_build_object('row', i, 'reason', 'Email doesn''t look right'); continue; end if;
    pkey := coalesce(em, lower(nm));
    if (lower(team) || '|' || pkey) = any(seen) then continue; end if;  -- the same person twice on one team counts once
    seen := seen || (lower(team) || '|' || pkey);
    -- Is this someone who took the class here? (by email, else exact name)
    select id into mid from public.members where church_id = p_church and ((em is not null and email = em) or (em is null and lower(name) = lower(nm))) limit 1;
    if mid is not null then matched := matched + 1; end if;
    if not teams ? team then
      hts := case when p_teams ? team then nullif(p_teams->>team, '') else (select n from unnest(names) n where lower(n) = lower(team) limit 1) end;
      if hts is not null and not hts = any(names) then raise exception 'There''s no % team on your list', hts; end if;
      teams := teams || jsonb_build_object(team, jsonb_build_object('htsTeam', hts, 'people', 0));
      if p_commit then insert into public.team_map(church_id, source, ext_team_id, ext_team_name, hts_team) values (p_church, 'csv', lower(team), team, hts); end if;
    end if;
    teams := jsonb_set(teams, array[team, 'people'], to_jsonb((teams->team->>'people')::int + 1));
    if teams->team->>'htsTeam' is not null then counted := counted + 1; end if;
    if p_commit then
      insert into public.rosters(church_id, source, ext_team_id, person_key, name, member_id) values (p_church, 'csv', lower(team), pkey, coalesce(nm, em), mid)
        on conflict do nothing;
    end if;
  end loop;
  if p_commit then
    insert into public.sync_runs(church_id, system, kind, ok, finished_at, pulled, error)
      values (p_church, 'csv', 'import', true, now(), counted, case when jsonb_array_length(bad) > 0 then jsonb_array_length(bad) || ' rows skipped' end);
  end if;
  return jsonb_build_object('rows', i, 'counted', counted, 'matchedPeople', matched, 'teams', teams,
    'unmatchedTeams', (select coalesce(jsonb_agg(k), '[]') from jsonb_each(teams) t(k, v) where v->>'htsTeam' is null),
    'skipped', bad, 'saved', p_commit);
end $$;

-- ============ Staff phone notifications ============
create or replace function public.hts_queue_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    insert into public.notify_queue(church_id, kind, member_id) values (new.church_id, 'submitted', new.id);
  end if;
  return new;
end $$;
drop trigger if exists hts_queue_notify on public.members;
create trigger hts_queue_notify after insert or update on public.members for each row execute function public.hts_queue_notify();

-- Called by the notify function each run: queue each overdue step once
create or replace function public.hts_queue_overdue() returns int language sql security definer set search_path = public as $$
  with ins as (
    insert into public.notify_queue(church_id, kind, member_id, step_id)
    select s.church_id, 'overdue', s.member_id, s.id from public.next_steps s
    where s.done_at is null and s.due < current_date
    on conflict (step_id) where kind = 'overdue' do nothing returning 1)
  select count(*)::int from ins
$$;
revoke execute on function public.hts_queue_overdue() from public, anon, authenticated;
-- Only the database's own functions create steps
revoke execute on function public.hts_make_steps(uuid), public.hts_team_steps(uuid) from public, anon, authenticated;

-- A staff phone registers for notifications
create or replace function public.hts_register_device(p_token text, p_platform text) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_platform not in ('ios', 'android') or length(p_token) not between 20 and 400 then raise exception 'Not a device token'; end if;
  insert into public.devices(token, user_id, platform) values (p_token, auth.uid(), p_platform)
    on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, last_seen = now();
end $$;

-- ============ Delete my account (staff; required by the App Store) ============
-- Removes you from every church. A church where you're the only Administrator must get another one first,
-- unless you're the only person on its team, in which case the church and everything in it is deleted too.
create or replace function public.hts_delete_my_account() returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid(); r record; gone int := 0;
begin
  if me is null then raise exception 'Sign in first'; end if;
  for r in select s.church_id, c.name,
             (select count(*) from public.staff x where x.church_id = s.church_id) as team_size,
             (select count(*) from public.staff x where x.church_id = s.church_id and x.role = 'admin') as admins
           from public.staff s join public.churches c on c.id = s.church_id where s.user_id = me and s.role = 'admin' loop
    if r.admins = 1 and r.team_size > 1 then raise exception 'Make someone else an Administrator of % first', r.name; end if;
  end loop;
  for r in select s.church_id from public.staff s where s.user_id = me and s.role = 'admin'
           and (select count(*) from public.staff x where x.church_id = s.church_id) = 1 loop
    delete from public.churches where id = r.church_id; gone := gone + 1;
  end loop;
  delete from auth.users where id = me;  -- removes their staff rows, invites they sent, devices and class assignments too
  return jsonb_build_object('deleted', true, 'churchesDeleted', gone);
end $$;

-- Live updates for the staff dashboard
do $$ begin
  alter publication supabase_realtime add table public.members;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.next_steps;
exception when others then null; end $$;
