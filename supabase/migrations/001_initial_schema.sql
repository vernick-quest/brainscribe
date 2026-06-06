-- BrainScribe initial schema

create extension if not exists "uuid-ossp";

-- Roles enum
create type user_role as enum ('student', 'parent', 'teacher');
create type session_status as enum ('active', 'complete');

-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role user_role not null default 'student',
  stripe_customer_id text,
  sessions_used int not null default 0,
  created_at timestamptz not null default now()
);

-- Invites (email + role, single-use token)
create table invites (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  role user_role not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references profiles(id) on delete set null,
  claimed_by uuid references profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Relationships: parent/teacher → student
create table relationships (
  id uuid primary key default uuid_generate_v4(),
  watcher_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(watcher_id, student_id)
);

-- Writing sessions
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references profiles(id) on delete cascade,
  assignment_text text not null,
  status session_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chat messages per session
create table messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Scribed paragraphs
create table paragraphs (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  position int not null,
  scribed_text text not null,
  raw_spoken_text text not null,
  is_thin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Rubrics + AI feedback
create table rubrics (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade unique,
  rubric_text text not null,
  feedback_text text,
  created_at timestamptz not null default now()
);

-- Stripe subscriptions (hooks for later)
create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  plan text, -- 'family' | 'family_plus'
  status text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- Auto-update sessions.updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sessions_updated_at
  before update on sessions
  for each row execute procedure update_updated_at();

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  invite_record invites%rowtype;
  assigned_role user_role := 'student';
begin
  -- Check for a pending invite matching this email
  select * into invite_record
  from invites
  where email = new.email
    and claimed_by is null
  order by created_at desc
  limit 1;

  if invite_record.id is not null then
    assigned_role := invite_record.role;
  end if;

  insert into profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    assigned_role
  );

  -- Claim the invite
  if invite_record.id is not null then
    update invites
    set claimed_by = new.id, claimed_at = now()
    where id = invite_record.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- RLS Policies
-- ============================================================

alter table profiles enable row level security;
alter table invites enable row level security;
alter table relationships enable row level security;
alter table sessions enable row level security;
alter table messages enable row level security;
alter table paragraphs enable row level security;
alter table rubrics enable row level security;
alter table subscriptions enable row level security;

-- Profiles: users see/edit their own
create policy "profiles: own" on profiles
  for all using (auth.uid() = id);

-- Invites: anyone can read an invite by token (for claim flow); only admins write
create policy "invites: read by token" on invites
  for select using (true);

create policy "invites: insert by teacher or parent" on invites
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'parent'))
  );

-- Relationships: watcher sees rows they're in
create policy "relationships: watcher" on relationships
  for select using (auth.uid() = watcher_id or auth.uid() = student_id);

create policy "relationships: insert by watcher" on relationships
  for insert with check (auth.uid() = watcher_id);

-- Sessions: student owns; parent/teacher can read via relationship
create policy "sessions: student owns" on sessions
  for all using (auth.uid() = student_id);

create policy "sessions: watcher reads" on sessions
  for select using (
    exists (
      select 1 from relationships
      where watcher_id = auth.uid() and student_id = sessions.student_id
    )
  );

-- Messages: follow session access
create policy "messages: session owner" on messages
  for all using (
    exists (select 1 from sessions where id = messages.session_id and student_id = auth.uid())
  );

create policy "messages: watcher reads" on messages
  for select using (
    exists (
      select 1 from sessions s
      join relationships r on r.student_id = s.student_id
      where s.id = messages.session_id and r.watcher_id = auth.uid()
    )
  );

-- Paragraphs: same as messages
create policy "paragraphs: session owner" on paragraphs
  for all using (
    exists (select 1 from sessions where id = paragraphs.session_id and student_id = auth.uid())
  );

create policy "paragraphs: watcher reads" on paragraphs
  for select using (
    exists (
      select 1 from sessions s
      join relationships r on r.student_id = s.student_id
      where s.id = paragraphs.session_id and r.watcher_id = auth.uid()
    )
  );

-- Rubrics: same pattern
create policy "rubrics: session owner" on rubrics
  for all using (
    exists (select 1 from sessions where id = rubrics.session_id and student_id = auth.uid())
  );

create policy "rubrics: watcher reads" on rubrics
  for select using (
    exists (
      select 1 from sessions s
      join relationships r on r.student_id = s.student_id
      where s.id = rubrics.session_id and r.watcher_id = auth.uid()
    )
  );

-- Subscriptions: own only
create policy "subscriptions: own" on subscriptions
  for all using (auth.uid() = profile_id);
