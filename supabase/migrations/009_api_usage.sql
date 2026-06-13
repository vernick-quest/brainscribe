-- API usage log: tracks Anthropic token usage per call
create table api_usage (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  service     text not null check (service in ('anthropic', 'elevenlabs')),
  model       text,
  session_id  uuid references sessions(id) on delete set null,
  input_tokens  integer,
  output_tokens integer,
  characters    integer,
  cost_usd    numeric(10, 6) not null default 0
);

alter table api_usage enable row level security;

-- Any authenticated user can insert (API routes log on behalf of the calling user)
create policy "authenticated insert api_usage" on api_usage
  for insert with check (auth.uid() is not null);

-- Only admins can read
create policy "admin read api_usage" on api_usage
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create index api_usage_created_at_idx on api_usage (created_at desc);
create index api_usage_service_idx    on api_usage (service, created_at desc);
