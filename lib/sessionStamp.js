// lib/sessionStamp.js — the provenance stamp written onto every `sessions` row at creation.
//
// WHY A SHARED MODULE: the stamp went in at the two inserts in /api/sessions and missed
// three more that also create `sessions` rows — both gym inserts and the v2 continuation.
// Those are not edge cases: /api/gym/tutor builds its prompt with the very
// buildCoachSystemBlocks() that this hash covers, and a v2 is the single most
// triage-worthy session type there is. Sites that must agree and live in different files
// drift; one function is the only version of this that stays true.
//
// It also protects the MEANING of null. Nullable was chosen so pre-existing sessions read
// as honest "unknown" — but if some live creation paths never stamp, null silently starts
// meaning "unknown OR gym OR continuation" and the triage query it exists to serve
// quietly stops being answerable.
//
// SERVER ONLY: COACH_RULES_VERSION is computed with node:crypto, so importing this from a
// client component breaks the bundle. Every caller is a route handler.
import { COACH_RULES_VERSION } from './prompts.js'

// Absent outside Vercel, so this is null in local dev — which is correct: a locally
// created session genuinely has no deployed commit.
const DEPLOY_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? null

// Spread into the .insert({...}) of any new `sessions` row.
//
// coach_rules_version answers "same rules?" (content hash of the SHARED rule blocks, the
// persona block deliberately excluded so a persona switch is not a rules change);
// deploy_sha answers "which commit?". Different questions, so both are stored.
//
// Always the CURRENT values, never inherited — a v2 continuation runs on today's rules
// even though it carries yesterday's paragraphs.
export function sessionStamp() {
  return {
    coach_rules_version: COACH_RULES_VERSION,
    deploy_sha: DEPLOY_SHA,
  }
}
