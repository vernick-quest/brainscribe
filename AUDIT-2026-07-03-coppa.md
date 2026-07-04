# COPPA / RLS authz audit — 2026-07-03

Whole-codebase sweep of every age-gate, consent, and role check (auth-coppa
session, branch `focus/auth-coppa`). Follow-up to `AUDIT-2026-06-21.md`.
Fixes marked ✅ are in this branch; items marked **→ route** need another lane.

## The invariants (now enforced via `lib/coppa.js`)

Every gate endpoint now calls shared predicates instead of inlining the rules:

| Predicate | Invariant |
|---|---|
| `deriveAgeBracket(dob)` | birthdate is the source of truth; `age_bracket` is DERIVED in app code (never a DB trigger) |
| `isCoppaProtected(p)` | sticky actual-knowledge: `under13` bracket OR `coppa_consent_required` — either flag protects |
| `canUseCoach(p)` | no model/voice access without admin, completed consent, or a 13+ assertion with no outstanding consent duty |
| `evaluateGateEdit(...)` | self may move INTO protection, never out; only the recorded guardian (or bootstrap-parent, never a teacher/co-parent) moves a child's gate |
| `validateConsentBinding(...)` | consent binds to the invited parent's email; signer ≠ student; signer not a student account |
| `isValidEmail` / `isValidConsentToken` / `escapeHtml` | input hygiene for the consent-email surface |

Callers: `/api/sessions`, `/api/tutor`, `/api/scribe`, `/api/scribe-token`,
`/api/profile/birthdate`, `/api/profile/confirm-role`, `/coppa/complete`,
`ConsentForm`.

## Findings — fixed in this branch ✅

### 1. CRITICAL — coach gate bypass via direct session insert
RLS policy `sessions: student owns` is `FOR ALL`, so any student can insert a
`sessions` row with client-side supabase-js — skipping `/api/sessions`' age
gate entirely. `/api/tutor`, `/api/scribe`, and `/api/scribe-token` had **no
age/consent check** — an unconsented under-13 could talk to the coach and
stream microphone audio to ElevenLabs. ✅ All three endpoints now re-check
`canUseCoach` per request (one PK read). Note: any legacy account with a null
`age_bracket` was already blocked from *creating* sessions; it is now also
blocked from *continuing* old ones (fail-closed; admins exempt).

### 2. HIGH — 7-day deletion had two escapes (`/api/cron/coppa-cleanup`)
(a) An under-13 who never submitted a parent email has **no pending row** → was
never deleted. (b) A late visit to `/coppa/consent` or `/coppa/complete` flips
the row to `status='expired'`, which removed it from the cron's
`status='pending'` query → the student survived. ✅ Added a profile-side sweep:
`coppa_consent_required ∧ ¬consent_given ∧ created_at < 7d ∧ no active pending
window` → delete (with the same last-moment consent re-check).

### 3. HIGH — invite claim silently broken in three ways (`app/(auth)/invite`)
(a) The 001 `handle_new_user` trigger auto-claims a matching invite at signup,
so a **fresh-signup** claim arrived pre-claimed and the page skipped the whole
claim block — no relationship, no teacher grant, and the page's 13+ /
role-conflict guards never ran. ✅ Claim is now idempotent for
`claimed_by === user.id` (guards re-run; writes are idempotent).
(b) `invites` has **no UPDATE policy**, so the user-scoped `claimed_by` stamp
affected 0 rows — claimed invites never burned. ✅ Stamped via service client.
(c) No RLS policy lets a claiming **teacher** insert their own
`assignment_teachers` row, so that grant silently failed too. ✅ Service client
+ idempotency guard (no duplicate grant/notification).
Also: the invite lookup now uses the service client so the world-readable
SELECT policy can be dropped (finding 8).

### 4. MEDIUM — consent email HTML injection (`/api/coppa/{initiate,resend}`, `/coppa/complete`)
`full_name` is client-writable and was interpolated raw into the HTML of the
consent/reminder/approval emails — a student could inject markup (phishing
inside an email the parent inherently trusts). ✅ `escapeHtml` at every
interpolation. Parent-email validation tightened from `includes('@')` to a real
shape check, and a student's own address is now rejected at initiate (it could
never complete anyway — signer ≠ student).

### 5. MEDIUM — admin demoted to parent by approving a consent (`/coppa/complete`)
Step 2 unconditionally set the signer's `role='parent'` — an admin approving a
consent link would lose `/admin` (bypassing the admin panel's self-lockout
guard). ✅ Admin role preserved; everything else unchanged. (A *teacher* signer
still converts to parent — single-role model; deliberate, unchanged.)

### 6. LOW — token composed into OAuth redirect unvalidated (`ConsentForm.js`)
The consent token prop was interpolated into the `next` redirect. It is
DB-validated by the page, but ✅ `isValidConsentToken` (48-hex shape) is now
checked before composing the URL — belt and suspenders.

### 7. LOW — rate-limit gaps
`/api/profile/birthdate` (writes consent-log rows), `/api/profile/confirm-role`
(gate probing), `/api/paragraphs` POST+PATCH (DB fill) were unthrottled.
✅ 15/hr, 10/hr, 30/min respectively (`lib/ratelimit.js`, fails open as designed).

## Findings — route to other lanes ⚠️

### 8. HIGH → infra (migration): `invites` SELECT policy is `using (true)`
The whole `invites` table — emails, tokens, roles, `invited_by`, `student_id`
(which flags "this uuid is an under-13 child") — is readable by ANY session.
Chained with finding 9 it was a full transcript-access chain. All app reads now
go through service/token lookups, so the policy can be dropped outright:
`drop policy "invites: read by token" on invites;` (verify no other client-side
`from('invites').select` first — the sweep found none).

### 9. HIGH → infra (migration): `relationships` INSERT policy
`with check (auth.uid() = watcher_id)` lets any authenticated user self-link as
a watcher of ANY student uuid → read their sessions/messages/paragraphs/profile
via the watcher policies. Every legitimate relationship write is service-role
now (invite claim, coppa/complete, birthdate) — drop the policy:
`drop policy "relationships: insert by watcher" on relationships;`

### 10. HIGH → coaching-session lane: `/api/messages` trusts the client role
`app/api/messages/route.js` inserts a **client-supplied `role`** — a stated
CLAUDE.md invariant regression ("must force role:'user'"). A student can forge
coach messages in a transcript that parents/teachers read as authoritative.
One-line fix in that lane: `role: 'user'` hardcoded. Defense-in-depth for infra:
`messages` INSERT `with check (role = 'user')` for `authenticated` (the RLS
`FOR ALL` owner policy currently allows any role value client-side too).

### 11. MEDIUM → infra (migration, optional defense): sessions INSERT gate
Finding 1's root cause. RLS can express the coach gate on insert:
`with check` on an EXISTS over the caller's profile (consent given, or 13+ and
not consent-required). The endpoint gates (fixed here) make this
belt-and-suspenders, not urgent.

### 12. NOTE → infra: `handle_new_user` trigger claims invites blind
The signup trigger assigns any invite-matched role (incl. parent/teacher) with
none of the page's guards. Harmless today (role_confirmed stays false → user
still runs onboarding; the page re-claims with guards), but the auto-claim
duplicates page logic and should eventually move out of the trigger.

## Verified still-sound ✔
- Consent binding (email match, signer ≠ student, student-role block) — now via
  `validateConsentBinding`, same semantics.
- Guardian-only gate edits incl. co-parent/teacher exclusion (`0caf42d`) — now
  via `evaluateGateEdit`, same semantics + same 403 codes.
- Under-13 re-declaration lock (`coppa_locked`) in confirm-role/birthdate.
- OAuth `next` validation (single `/`, rejects `//` and `/\`).
- Migration 020 column grants (only `full_name`, `avatar_url` client-writable).
- Cron auth: fails closed without `CRON_SECRET`.
- Under-13 photo minimization (render-gated, `26f76ef`) — unchanged.
