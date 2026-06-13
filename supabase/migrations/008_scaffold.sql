-- ── Scaffold system — replaces sessions.outline ──────────────────────────────

-- One scaffold per session. Stores the full two-tier component tree as JSONB.
create table if not exists paragraph_scaffolds (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references sessions(id) on delete cascade,
  constraint paragraph_scaffolds_session_unique unique (session_id),
  assignment_type text check (assignment_type in (
    'narrative', 'essay', 'personal_statement', 'other'
  )),
  total_paragraphs        integer default 1,
  current_paragraph_index integer default 0,
  components              jsonb default '[]',  -- full two-tier tree (see spec)
  thesis                  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- RLS
alter table paragraph_scaffolds enable row level security;

create policy "scaffold_student_all"
  on paragraph_scaffolds for all
  using (
    session_id in (select id from sessions where student_id = auth.uid())
  );

create policy "scaffold_teacher_read"
  on paragraph_scaffolds for select
  using (
    session_id in (
      select s.id from sessions s
      join assignment_teachers at on at.session_id = s.id
      where at.teacher_id = auth.uid()
    )
  );

-- Add thesis tracking to sessions
alter table sessions
  add column if not exists thesis_statement  text,
  add column if not exists thesis_confirmed  boolean default false;

-- Add paragraph-level metadata to paragraphs
alter table paragraphs
  add column if not exists paragraph_index integer default 0,
  add column if not exists paragraph_type  text check (paragraph_type in (
    'introduction', 'body', 'conclusion', 'narrative', 'personal_statement', 'other'
  ));
