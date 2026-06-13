-- Add persona, outline, title, and assignment_summary to sessions
alter table sessions
  add column if not exists persona text not null default 'marcus',
  add column if not exists title text,
  add column if not exists outline jsonb,
  add column if not exists assignment_summary jsonb;
