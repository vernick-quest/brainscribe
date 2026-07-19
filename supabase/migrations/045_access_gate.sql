-- 045 — Access gate + Beta Circle
alter table public.profiles
  add column if not exists access_granted boolean not null default false,
  add column if not exists is_beta_circle boolean not null default false,
  add column if not exists access_code_used text,
  add column if not exists access_code_at timestamptz;

create table if not exists public.access_codes (
  code text primary key,
  label text,
  grants_beta_circle boolean not null default true,
  active boolean not null default true,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.access_codes enable row level security;
-- No anon/authenticated policies on purpose: redemption + admin reads go through the
-- service role (bypasses RLS). Normal clients are deny-by-default.

insert into public.access_codes (code, label, grants_beta_circle, active)
values ('unblock', 'Beta Circle launch code', true, true)
on conflict (code) do nothing;

-- Grandfather every existing account: keep access; every existing NON-admin becomes a
-- Beta Circle member (admins excluded so they don't consume a cap slot).
update public.profiles set access_granted = true where access_granted = false;
update public.profiles set is_beta_circle = true where is_beta_circle = false and role <> 'admin';
