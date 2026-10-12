// Rate measurement for min-binding.mjs Probe 2 — NOT part of test:prompts (it is a measuring
// stick, not a gate). The thresholds and rates quoted in min-binding.mjs came from this.
//
//   node scripts/prompt-harness/min-binding-rates.mjs [N per phrasing, default 4] [scenario,scenario]
//
// N=8 across every scenario is ~200 calls, roughly $3 — ask before running it that wide.
// Fixture text is SYNTHETIC, mirrored from min-binding.mjs.
import { coachTurn } from './lib/harness.mjs'
import { stripCoachTokens } from '../../lib/coachTokens.js'
const N = Number(process.argv[2] ?? 4)
const ASSIGNMENT = `Personal statement: describe a challenge you faced and how it changed you.\n400–550 words. Due Monday.`
const para = { index: 0, type: 'personal_statement', status: 'complete', summary: 'moving schools and finding the band',
  items: ['hook', 'context', 'reflection', 'connection'].map((id, i) => ({ id, label: id, status: 'confirmed', text: [
    'The first time I walked into my new school I counted the doors.',
    'We moved in October, after everyone had already picked their lunch tables.',
    'I learned that being new is not the same as being alone, but it can feel that way for a while.',
    'Now when I see someone eating by themselves I sit down next to them.'][i] })) }
const SC = { assignment_type: 'personal_statement', total_paragraphs: 1, current_paragraph_index: 1, components: [para] }
const opts = { requirements: { targets: [{ type: 'words', min: 400, max: 550 }], actual: { words: 212, paragraphs: 1 } } }
const REVIEWED = [{ role: 'user', content: 'ok i think thats everything' }, { role: 'assistant', content: "Quick pass on the whole thing: your four parts connect — the doors, the lunch tables, what you learned, what you do now. Read it through in your Draft. Does it sound like you?" }]
const GAP = [...REVIEWED, { role: 'user', content: 'yeah it sounds like me. am i done?' }, { role: 'assistant', content: "Not quite yet — you're at 212 words and your assignment asks for at least 400, so that's 188 more to go. Every section is full, so tap \"+ Add another section\" under your draft and we'll build the next part." }]
const FIN = /\b(submit(ting)?|hand(ing)? (it |this |that )?in|turn(ing)? (it |this |that )?in|(finish|end)(ing)? (it |this )?(here|now|short|anyway|as[- ]is|as it is|like (this|that)|the way it is|at \d+)|wrap(ping)? (it |this )?up|call(ing)? it (done|finished|complete)|clos(e|ing) (it|this) (out|off)|as[- ]is|as it is)\b/i
const PERM = /\?|\b(you could|you can|if you('?d)? (like|want|prefer|rather)|your (call|choice|decision)|up to you|just say (so|the word)|say the word|let me know|tell me)\b/i
const offer = t => stripCoachTokens(t).split(/(?<=[.?!])\s+|\n+/).find(x => FIN.test(x) && PERM.test(x))
const scen = {
  ambigAfterGap: { msgs: ['ok', 'yeah', 'i think its good', 'looks done to me', 'im done', 'sure'].map(s => [...GAP, { role: 'user', content: s }]), bad: t => t.includes('[COMPLETE]') || offer(t) },
  ambigNoGap: { msgs: ['i think its good', 'looks done to me', 'im done', 'its fine like it is'].map(s => [...REVIEWED, { role: 'user', content: s }]), bad: t => t.includes('[COMPLETE]') || offer(t) },
  pause: { msgs: ['yeah it sounds like me. im done for tonight though', 'i have to go, lets stop here', 'im tired, can we stop for now'].map(s => [...REVIEWED, { role: 'user', content: s }]), bad: t => t.includes('[COMPLETE]') || offer(t) },
  yesToLeak: { msgs: ['yeah', 'sure ok', 'yes'].map(s => [...REVIEWED, { role: 'user', content: 'i think its good' }, { role: 'assistant', content: "It reads well. It's at 212 words and the assignment asks for at least 400 — 188 short. Do you want to finish it as it is?" }, { role: 'user', content: s }]), bad: t => t.includes('[COMPLETE]') },
  confirmYes: { msgs: ['yes', 'yeah, finish it', 'yes im sure'].map(s => [...REVIEWED, { role: 'user', content: 'yeah it sounds like me. i want to submit it like this' }, { role: 'assistant', content: "Before I close it out: you're at 212 words and the assignment asks for at least 400, so it's 188 short. Do you want to finish it at 212?" }, { role: 'user', content: s }]), bad: t => !t.includes('[COMPLETE]') || /\?\s*$/.test(stripCoachTokens(t).trim()) },
  informed: { msgs: ['i know its short but i want to submit it like this', 'i want to finish it as is', 'im ok with it being short. im done with it, finish it'].map(s => [...GAP, { role: 'user', content: s }]), bad: t => !t.includes('[COMPLETE]') || /\?\s*$/.test(stripCoachTokens(t).trim()) },
  uninformed: { msgs: ['yeah it sounds like me. i want to submit it like this', 'its good. finish it as is', 'i want to hand it in the way it is'].map(s => [...REVIEWED, { role: 'user', content: s }]), bad: t => t.includes('[COMPLETE]') || !stripCoachTokens(t).split(/(?<=[.?!])\s+|\n+/).some(x => x.endsWith('?') && /\b(finish|submit|hand|turn|still|go ahead)\b/i.test(x)) },
}
const only = process.argv[3]?.split(',')
for (const [name, sc] of Object.entries(scen)) {
  if (only && !only.includes(name)) continue
  const jobs = []
  for (let r = 0; r < N; r++) for (const m of sc.msgs) jobs.push(coachTurn({ assignment: ASSIGNMENT, scaffold: SC, opts, messages: m }).then(({ text }) => ({ say: m.at(-1).content, text })))
  const res = await Promise.all(jobs)
  const bad = res.filter(r => sc.bad(r.text))
  console.log(`${name}: ${bad.length}/${res.length} bad`)
  for (const b of bad) console.log(`   [${b.say}] ${offer(b.text) ?? stripCoachTokens(b.text).replace(/\s+/g, ' ').slice(-200)}`)
}
