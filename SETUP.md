# BrainScribe — Setup Guide

## 1. Supabase project

1. Create a new project at supabase.com
2. In the SQL editor, run `supabase/migrations/001_initial_schema.sql` in full
3. In **Authentication → Providers**, enable Google OAuth:
   - Paste your Google Client ID and Secret (same OAuth app as HSPTPrep, or a new one)
   - Set Authorized redirect URI in Google Cloud Console: `https://<your-project>.supabase.co/auth/v1/callback`
4. Copy your project URL, anon key, and service role key

## 2. Environment variables

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # change for prod
```

## 3. Run locally

```bash
npm install
npm run dev
```

Visit http://localhost:3000

## 4. Creating the first invite

Since the app is invite-only, create the first invite manually in Supabase SQL editor:

```sql
insert into invites (email, role)
values ('your@email.com', 'student');
```

Then visit `/login?invite=<token>` where the token is the value from `select token from invites`.

## 5. Giving a parent/teacher access to a student's transcript

After both accounts exist, link them in Supabase:

```sql
insert into relationships (watcher_id, student_id)
values ('<parent_or_teacher_uuid>', '<student_uuid>');
```

Transcript view is at `/transcript/<session_id>`.

## Architecture notes

- **Two Claude calls per turn**: `/api/tutor` (streaming, Socratic question) and `/api/scribe` (JSON, paragraph cleanup)
- **RLS enforces** student isolation and parent/teacher read-only access via `relationships` table
- **Stripe hooks**: `subscriptions` table is ready; add webhook + gating logic later
- **ElevenLabs**: currently using browser `SpeechSynthesis` as fallback; swap `/api/tutor` response into ElevenLabs TTS call when ready
