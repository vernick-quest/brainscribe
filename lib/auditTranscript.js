import { createServiceClient } from '@/lib/supabase/service'
import { recordAnthropicUsage } from '@/lib/usage'
import { judgeTranscript, JUDGE_MODEL, TECHNICAL_MODEL } from '@/lib/auditJudge'

// ─────────────────────────────────────────────────────────────
// auditTranscript — production wrapper around the pure judge in lib/auditJudge.js.
// Logs Anthropic usage and writes ONE transcript_audit_findings row (clean
// sessions get a severity='none' row so the NOT-EXISTS sampler won't re-pick
// them). Returns { severity, breachCount } or null on hard failure (no row
// written → the session stays samplable). Model/prompt/validator logic lives in
// auditJudge.js so the validated judge is the shipped judge.
//
// v1 SCOPE IS COACH-ONLY (locked decision): coach guardrail breaches + technical
// anomalies. No student-safety / distress signals.
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
