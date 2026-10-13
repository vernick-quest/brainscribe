// lib/coachStream.js — read the coach's streamed reply: forward TEXT, count everything.
//
// ONE reader for both coach routes (/api/tutor, /api/gym/tutor) and the latency harness,
// because the rule it enforces is easy to break in one copy and not the other:
//
//   ONLY `text_delta` IS EVER FORWARDED TO THE CLIENT.
//
// On Claude Opus 5.5 thinking cannot be turned off. Every reply streams a `thinking`
// content block first (one `thinking_delta` — EMPTY with the default display — and a
// `signature_delta`), then the text block. The client's token parser (TutorSession) and
// the sentence-by-sentence speech queue (lib/speechStream.js) must see the same plain text
// stream they saw on Sonnet 4.6: a thinking or signature payload reaching them would be
// SPOKEN to a child, or parsed as part of a [DONE:] payload — the student's own words.
// The `thinking` text is empty today only because of a default; this reader does not rely
// on that default.
//
// PURE: no SDK import, no Next import. It consumes raw stream events.

export function createCoachStreamReader() {
  const s = {
    fullText: '',
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    // Reported by Opus 5.5 on message_delta (usage.output_tokens_details.thinking_tokens);
    // ALREADY INCLUDED in outputTokens (thinking is billed as output). null = not reported.
    thinkingTokens: null,
    stopReason: null,
    // Ignored-event tally, so a test (or a log line) can show thinking was seen and dropped.
    droppedDeltas: 0,
  }

  /**
   * Feed one raw stream event. Returns the text to forward to the client, or null.
   */
  function consume(chunk) {
    if (!chunk || typeof chunk !== 'object') return null
    if (chunk.type === 'message_start') {
      const u = chunk.message?.usage ?? {}
      s.inputTokens = u.input_tokens ?? 0
      s.cacheWriteTokens = u.cache_creation_input_tokens ?? 0
      s.cacheReadTokens = u.cache_read_input_tokens ?? 0
      return null
    }
    if (chunk.type === 'message_delta') {
      const u = chunk.usage ?? {}
      // output_tokens on message_delta is CUMULATIVE (the final count, thinking included).
      if (u.output_tokens != null) s.outputTokens = u.output_tokens
      // Newer models repeat the input-side counts here; prefer them when present (final).
      if (u.input_tokens != null) s.inputTokens = u.input_tokens
      if (u.cache_creation_input_tokens != null) s.cacheWriteTokens = u.cache_creation_input_tokens
      if (u.cache_read_input_tokens != null) s.cacheReadTokens = u.cache_read_input_tokens
      if (u.output_tokens_details?.thinking_tokens != null) s.thinkingTokens = u.output_tokens_details.thinking_tokens
      // stop_reason arrives on message_delta. 'max_tokens' means the model was CUT OFF
      // mid-turn; 'refusal' means a safety classifier ended it (HTTP 200, no error).
      if (chunk.delta?.stop_reason) s.stopReason = chunk.delta.stop_reason
      return null
    }
    if (chunk.type === 'content_block_delta') {
      if (chunk.delta?.type === 'text_delta' && typeof chunk.delta.text === 'string') {
        s.fullText += chunk.delta.text
        return chunk.delta.text
      }
      // thinking_delta, signature_delta, anything new: never forwarded.
      s.droppedDeltas++
      return null
    }
    return null
  }

  return { consume, state: s }
}

/**
 * Did the CLIENT abandon this coach turn before it was fully delivered?
 *
 * TutorSession aborts a coach turn (AbortController) after 45s with no first text, or 45s
 * stalled mid-stream, and deliberately applies NOTHING from an aborted turn. The route's
 * after() must then make the same decision: persisting the partial reply leaves a half
 * coach message in the transcript on reload, and recording its [DONE:] promises hands the
 * integrity detector a commitment that was never applied — a loss alert for a loss that
 * did not happen. (The usage row is still written: the tokens were billed.)
 *
 *   streamCancelled — the route's ReadableStream cancel() fired. Next 16 pipes the body with
 *                     pipeTo(…, { signal }) whose signal aborts when the Node response
 *                     closes before finishing (server/pipe-readable.js), which cancels the
 *                     source stream. It can only fire BEFORE controller.close(), so it is
 *                     never true for a turn that was fully sent. The primary signal.
 *   signalAborted   — request.signal.aborted. Next 16 aborts it on the same early close
 *                     (adapters/next-request.js). Secondary, and trusted ONLY when the
 *                     model stream never reached a stop_reason: a signal that aborts after a
 *                     complete turn must never discard that turn's transcript row.
 *   stopReason      — the model's stop_reason (null when the stream never finished).
 */
export function coachTurnAbandoned({ streamCancelled = false, signalAborted = false, stopReason = null } = {}) {
  if (streamCancelled === true) return true
  return signalAborted === true && !stopReason
}
