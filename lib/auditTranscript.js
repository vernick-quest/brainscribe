import { createServiceClient } from '@/lib/supabase/service'
import { recordAnthropicUsage } from '@/lib/usage'
import { judgeTranscript, JUDGE_MODEL, TECHNICAL_MODEL } from '@/lib/auditJudge'
import { hasSafetyFlag } from '@/lib/safetyAudit'

// ─────────────────────────────────────────────────────────────
// auditTranscript — production wrapper around the pure judge in lib/auditJudge.js.
// Logs Anthropic usage and writes ONE transcript_audit_findings row (clean
// sessions get a severity='none' row so the NOT-EXISTS sampler won't re-pick
// them). Returns { severity, breachCount } or null on hard failure (no row
// written → the session stays samplable). Model/prompt/validator logic lives in
// auditJudge.js so the validated judge is the shipped judge.
//
// SCOPE (child-safety red-team, 2026-07-12): originally COACH-ONLY (coach guardrail
// breaches + technical anomalies). Now UNLOCKED to also carry STUDENT-SAFETY
// findings — a flagged transcript must reach the ADMIN trust-and-safety queue, not
// just a parent (who may be the person the child needs protection from). The
// DETECTION (judge taxonomy that recognizes a missed disclosure / echoed PII /
// unflagged online meetup) is the admin/audit lane's to add to lib/auditJudge.js;
// this wrapper just flags any finding whose breach_types are child-safety keys
// (lib/safetyAudit.js) so the queue can route it. INERT until the judge emits them.
// ─────────────────────────────────────────────────────────────

export async function auditTranscript({ runId, session, messages, studentName = '', userId = null }) {
  if (!session?.id) return null
  const sessionId = session.id

  const result = await judgeTranscript({ session, messages, studentName })

  // Log usage for every model call that actually happened (best-effort).
  for (const u of result.usages ?? []) {
    await recordAnthropicUsage({ model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, sessionId, userId })
  }

  // Judge failed → don't persist; leave the session samplable for a later run.
  if (!result.judgeOk) {
    console.error('[auditTranscript] guardrail judge failed for session', sessionId, result.error ?? '')
    return null
  }

  const service = createServiceClient()
  const breachTypes = [...new Set(result.breaches.map(b => b.type))]
  // Trust-and-safety flag: does this finding carry a child-safety breach key? The
  // admin queue filters on it to separate "a child may be at risk" from coach
  // quality. Stored in auditor_analysis (no schema change) so the read path can
  // route without re-deriving. False for every finding until the judge taxonomy
  // gains the safety keys (admin/audit lane).
  const safetyFlag = hasSafetyFlag(breachTypes)
  const row = {
    run_id: runId,
    session_id: sessionId,
    student_id: session.student_id ?? null,
    persona: session.persona ?? null,
    severity: result.severity,
    breach_types: breachTypes,
    auditor_analysis: {
      summary: result.summary,
      breaches: result.breaches,
      process_notes: result.processNotes,
      technical: result.technical,
      safety_flag: safetyFlag,
      judge_ok: true,
      model: { judge: JUDGE_MODEL, technical: TECHNICAL_MODEL },
    },
  }

  const { error } = await service.from('transcript_audit_findings').insert(row)
  if (error) {
    // Unique-violation = a concurrent run already audited this session; benign.
    if (error.code === '23505') return { severity: result.severity, breachCount: result.breaches.length, duplicate: true }
    console.error('[auditTranscript] findings insert error:', error.message)
    return null
  }
  return { severity: result.severity, breachCount: result.breaches.length }
}
