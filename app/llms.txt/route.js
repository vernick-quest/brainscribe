import { CANONICAL_URL, CANONICAL_DESCRIPTION } from '@/lib/site'
import { USE_CASE_SLUGS, USE_CASES } from '@/lib/useCases'

// /llms.txt — the llmstxt.org convention: an H1 name, a one-line summary, then
// curated links to the key pages. Shipped for optionality (crawlers don't fetch
// it reliably yet — low expectations, low effort). Kept in sync with the real
// pages so it never points at anything that doesn't exist.
export const dynamic = 'force-static'

export function GET() {
  const lines = [
    '# BrainScribe',
    '',
    `> ${CANONICAL_DESCRIPTION}`,
    '',
    'BrainScribe helps students in grades 6–12 — including kids with ADHD and dysgraphia — who freeze at the blank page. The student talks; a scribe cleans their own words into a paragraph they approve; parents and teachers can read the full transcript. It never writes for the student.',
    '',
    '## Key pages',
    `- [Home](${CANONICAL_URL}/): what BrainScribe is and how the voice-first coach works`,
    `- [Writing-help guides](${CANONICAL_URL}/writing-help): common reasons kids struggle to write, and how to help`,
    ...USE_CASE_SLUGS.map(s => `- [${USE_CASES[s].h1}](${CANONICAL_URL}/writing-help/${s})`),
    `- [FAQ](${CANONICAL_URL}/faq): does it write essays, is it good for ADHD/dysgraphia, what grades, can parents see the work`,
    `- [Compare with Grammarly, Co:Writer, ChatGPT](${CANONICAL_URL}/compare): honest tool comparison for student writing`,
    `- [About](${CANONICAL_URL}/about): the origin story`,
    `- [Blog](${CANONICAL_URL}/blog): notes on writing, ADHD, and how the coach works`,
    '',
  ]
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
