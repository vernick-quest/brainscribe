-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 006: COPPA age gate & parental consent
-- ──────────────────────────────────────────────────────────────────────────────

-- Ensure role_confirmed exists (may have been added manually via Supabase console)
alter table profiles add column if not exists role_confirmed boolean default false;

-- Age bracket + consent tracking on profiles
alter table profiles
  add column if not exists age_bracket text check (age_bracket in ('13plus', 'under13')),
  add column if not exists coppa_consent_required boolean not null default false,
  add column if not exists coppa_consent_given boolean not null default false,
  add column if not exists coppa_consent_given_at timestamptz,
  add column if not exists coppa_consent_parent_id uuid references profiles(id);

-- ──────────────────────────────────────────────────────────────────────────────
-- pending_coppa_signups
-- Created when an under-13 student submits their parent's email.
-- Expires after 7 days if not approved → account is then deleted.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists pending_coppa_signups (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  parent_email text not null,
  token text unique not null default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table pending_coppa_signups enable row level security;

-- Students can read their own pending records (for the holding screen)
create policy "pending_coppa: student reads own"
  on pending_coppa_signups for select
  using (auth.uid() = student_id);

-- Admins have full access
create policy "pending_coppa: admin all"
  on pending_coppa_signups for all
  using (is_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- coppa_consent_log
-- Immutable audit trail; required for COPPA compliance.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists coppa_consent_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete set null,
  parent_id uuid references profiles(id) on delete set null,
  pending_id uuid references pending_coppa_signups(id) on delete set null,
  consent_method text not null default 'email_approval',
  ip_address text,
  user_agent text,
  privacy_policy_version text not null default 'v1.0-june-2025',
  created_at timestamptz not null default now()
);

alter table coppa_consent_log enable row level security;

-- Admins only — consent log should never be readable by end users
create policy "coppa_consent_log: admin all"
  on coppa_consent_log for all
  using (is_admin());
