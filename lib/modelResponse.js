// lib/modelResponse.js — one place that knows a model reply got cut off.
//
// WHY THIS IS SHARED AND NOT INLINE: a truncated completion is a PERFECTLY SUCCESSFUL API
// call. It arrives with content, no error, and `stop_reason: 'max_tokens'`. Every caller
// that checks `try/catch` or "did I get text back?" sails straight past it and saves the
// fragment — which is how a student's Final Draft nearly became a third of her story on
// 2026-08-16. It fails in the reassuring direction.
//
// Swept the repo that day: 14 model calls, 12 of which never looked at stop_reason. The
// reason to put this in one tested module rather than repeat the check is the same reason
// the truncation counter was wrong for a whole day — the client's token regex, the
// server's counter regex and the contract they both describe had drifted into three
// different expressions of one idea, and one of them was incorrect.
//
// PURE: no Anthropic import, no Next import. It inspects a response shape.

export class ModelTruncatedError extends Error {
  constructor({ what = 'output', words = null, sessionId = null } = {}) {
    super(
      `The model hit its token ceiling while producing ${what}` +
      (words != null ? ` (about ${words} words in)` : '') +
      ' — refusing to use a partial result.'
    )
    this.name = 'ModelTruncatedError'
    this.code = 'model_truncated'
    this.what = what
    this.words = words
    this.sessionId = sessionId
  }
}

/** Word count of whatever text came back, for an error message a human can act on. */
export function responseText(response) {
  const t = response?.content?.[0]?.text
  return typeof t === 'string' ? t : ''
}

/**
 * Throw if the reply was cut off at the ceiling. Returns the response otherwise, so it
 * can wrap a call site inline.
 *
 * Only 'max_tokens' is treated as unsafe. 'end_turn', 'stop_sequence' and a missing
 * stop_reason are all normal completions — being stricter here would break every caller
 * for no safety gain.
 */
export function assertComplete(response, { what = 'output', sessionId = null } = {}) {
  if (response?.stop_reason === 'max_tokens') {
    const text = responseText(response).trim()
    const words = text ? text.split(/\s+/).length : 0
    console.error(
      `[model-truncated] ${what}${sessionId ? ` for session ${sessionId}` : ''} — ` +
      `cut at the ceiling after ~${words} words; refusing to use it`
    )
    throw new ModelTruncatedError({ what, words, sessionId })
  }
  return response
}
