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

/**
 * The reply's TEXT, read by block type — never by position.
 *
 * Before 2026-10-12 this (and seven call sites) read `content[0].text`. On a model that
 * thinks (Opus 5.5 always does — it can't be turned off) a response BEGINS with a
 * `thinking` block, and content[0].text is then undefined: `.trim()` throws, JSON.parse
 * throws, and the call that "succeeded" fails downstream. The utility models (Haiku 4.5)
 * don't think today, so this changes nothing for them — it removes the trap for the day a
 * role moves. Joining every text block also covers a reply split across several.
 */
export function responseText(response) {
  const blocks = Array.isArray(response?.content) ? response.content : []
  // A block with NO type but a string `text` is tolerated (older mocks, malformed shapes);
  // a `thinking` block carries its content in `.thinking`, never `.text`, so it can't leak in.
  return blocks
    .filter(b => (b?.type === 'text' || b?.type == null) && typeof b?.text === 'string')
    .map(b => b.text).join('')
}

/**
 * Did the reply get cut off at the ceiling? Non-throwing, for callers that already fail
 * closed on their own terms.
 *
 * Added 2026-08-16 at coach-ai's request, and their reasoning is the right one: the five
 * JSON-producing callers (auditJudge x2, analyzeWriting, rubric, summary) degrade
 * gracefully by design — they return null and log. Handing them assertComplete would
 * convert a deliberate soft failure into an exception at five call sites, which is a
 * worse outcome than the problem. What they actually need is to keep their control flow
 * and be able to say WHY the parse failed, instead of reporting a bare "parse error" that
 * hides the cause — the exact way scribe's truncation stayed invisible.
 *
 *   if (wasTruncated(response)) { console.error('[x] cut at the ceiling'); return null }
 */
export function wasTruncated(response) {
  return response?.stop_reason === 'max_tokens'
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
  if (wasTruncated(response)) {
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
