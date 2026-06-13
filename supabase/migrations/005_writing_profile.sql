-- ─────────────────────────────────────────────────────────────
-- Migration 005: Writing profile column on sessions
-- ─────────────────────────────────────────────────────────────

alter table sessions add column if not exists writing_profile jsonb;
