// Heuristic: does this Google display name look like a real person's name?
//
// The display name feeds the COPPA consent email ("<name> wants to use
// BrainScribe…"), so an org/nickname/placeholder name ("Next Level Soccer",
// "USER123") makes that email read as spam to a real parent. This flags names
// worth a second look; /welcome shows a SOFT confirm prompt (never a hard
// block), so a false positive costs the user one click. Word list + rules from
// BACKLOG.md "Student name validation at signup".
const ORG_WORDS = new Set([
  'soccer', 'sports', 'academy', 'club', 'fc', 'llc', 'inc', 'school',
  'team', 'united', 'city', 'youth', 'next', 'level',
])

export function displayNameNeedsConfirm(name) {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return true
  const words = trimmed.split(/\s+/)
  if (words.length > 3) return true
  if (/\d/.test(trimmed)) return true
  // All caps (with at least one letter) reads as a placeholder/org handle.
  if (trimmed === trimmed.toUpperCase() && /[a-zA-Z]/.test(trimmed)) return true
  if (words.some(w => ORG_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, '')))) return true
  return false
}
