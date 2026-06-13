-- ─────────────────────────────────────────────────────────────
-- Migration 004: Teacher notifications
-- ─────────────────────────────────────────────────────────────

create table teacher_notifications (
  id          uuid primary key default uuid_generate_v4(),
  teacher_id  uuid not null references profiles(id) on delete cascade,
  session_id  uuid references sessions(id) on delete set null,
  type        text not null check (type in ('assignment_shared', 'assignment_complete')),
  message     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table teacher_notifications enable row level security;

-- Teacher reads their own notifications
create policy "teacher_notifications: own reads"
  on teacher_notifications for select
  using (auth.uid() = teacher_id);

-- Teacher can mark their own notifications as read
create policy "teacher_notifications: own update"
  on teacher_notifications for update
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Admin full access
create policy "teacher_notifications: admin"
  on teacher_notifications for all
  using (is_admin());
