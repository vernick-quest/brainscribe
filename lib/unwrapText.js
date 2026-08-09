// Unwrap hard-wrapped pasted text.
//
// Text copied from a terminal, a chat pane, or an email is usually hard-wrapped at
// ~72-80 columns: the line breaks are real \n characters, not the renderer's doing.
// Pasted into a textarea those breaks survive, so the note visibly stops a third of
// the way across a wide box with a ragged right edge — which reads as a broken input
// rather than as the source's wrapping.
//
// This joins lines that were only broken to fit a column, while preserving the breaks
// that carry meaning: blank-line paragraph breaks and list items stay put.

const BULLET = /^\s*([-*•‣]|\d+[.)])\s+/

// A line that should keep its own break: blank, a list item, or an indented/quoted
// block (code, quotes) where the author's layout is the point.
function isStructural(line) {
  return !line.trim() || BULLET.test(line) || /^\s{2,}/.test(line) || /^\s*>/.test(line)
}

export function unwrapPastedText(input) {
  if (typeof input !== 'string' || !input) return ''
  const lines = input.replace(/\r\n?/g, '\n').split('\n')

  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const prev = out.length ? out[out.length - 1] : null

    // Start a new output line whenever this line or the previous one is structural,
    // or there's nothing to join onto yet.
    if (prev === null || isStructural(line) || isStructural(prev) || !prev.trim()) {
      out.push(line)
      continue
    }

    // Otherwise this break was cosmetic — join it back onto the previous line.
    // A hyphen at the end of the previous line is a word split, so no space.
    out[out.length - 1] = prev.endsWith('-')
      ? prev.slice(0, -1) + line.trimStart()
      : `${prev.replace(/\s+$/, '')} ${line.trimStart()}`
  }

  // Collapse runs of 3+ blank lines to a single paragraph break.
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

// Replace the current selection in a textarea/input with `text`, keeping undo history
// and leaving the caret after the inserted text. Returns the resulting value.
export function insertAtSelection(el, text) {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  return { value: next, caret: start + text.length }
}
