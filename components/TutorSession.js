'use client'

import { useState, useRef, useEffect, forwardRef, useImperativeHandle, memo } from 'react'
import { useRouter } from 'next/navigation'
import MicButton from './MicButton'
import ImpersonationBanner from './ImpersonationBanner'
import Navbar from './Navbar'
import CrisisResourceCard from './CrisisResourceCard'
import WatcherVisibilityNote from './WatcherVisibilityNote'
import { SourcesShelf, WorksCitedCard, toCitationSource } from '@/components/SourcesPanel'
import { formatBibliography } from '@/lib/citations'
import { getPersona, PersonaAvatar } from '@/lib/personas'
import { SUBJECTS, getSubject } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'
import InviteTeacherForm from '@/components/InviteTeacherForm'
import Icon from '@/components/Icon'
import { computeActual, chipState } from '@/lib/requirements'
import { onboardingGreeting } from '@/lib/onboardingPrompts'
import { newSessionGreeting } from '@/lib/greeting'
import { deduceVoiceSuggestion } from '@/lib/voiceDeduce'

// ── Markdown helpers ───────────────────────────────────────────────────────────

// Strip **bold** markers for TTS so ElevenLabs reads the word cleanly
function stripMarkdown(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1')
}

// Render **bold** as uppercase bold spans for display
function renderMarkdown(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/)
    if (match) return <strong key={i} style={{ textTransform: 'uppercase', fontWeight: 700 }}>{match[1]}</strong>
    return part
  })
}

// ── Persona display metadata ───────────────────────────────────────────────────

const PERSONA_META = {
  deon: { name: 'Deon' },
  zoe:    { name: 'Zoe' },
  alistair: { name: 'Alistair' },
  matilda:   { name: 'Tilly' },
  owen:    { name: 'Owen' },
  jade: { name: 'Jade' },
}

// Normalize any stored persona key to a CURRENT one. Sessions created before the
// 015_persona_rename can still carry retired keys (jordan/isla/verity/marcus/oliver);
// resolving them here keeps the greeting text, the avatar/header, and the TTS voice
// all pinned to the same current persona instead of silently diverging (deep-read F4:
// session resolved to matilda but greeted "I'm Zoe" / header showed a broken avatar).
const RETIRED_PERSONA_MAP = {
  jordan: 'jade',      // Jade (ex-Jordan)
  isla:    'matilda',  // Tilly (ex-Isla)
  verity:  'matilda',  // Tilly (ex-Verity)
  marcus:  'deon',     // Deon (ex-Marcus)
  oliver:  'alistair', // Alistair (ex-Oliver)
}
function resolvePersona(key) {
  if (key && PERSONA_META[key]) return key
  if (key && RETIRED_PERSONA_MAP[key]) return RETIRED_PERSONA_MAP[key]
  return 'owen'
}

// ── Scaffold helpers ───────────────────────────────────────────────────────────

const COMPONENT_LABELS = {
  hook: 'Hook',
  context: 'Context',
  thesis: 'Thesis',
  roadmap: 'Roadmap',
  topic_sentence: 'Topic Sentence',
  evidence: 'Evidence',
  analysis: 'Analysis',
  transition: 'Transition',
  echo: 'Echo',
  synthesis: 'Synthesis',
  thesis_restate: 'Thesis Restatement',
  closing: 'Closing',
  reflection: 'Reflection',
  connection: 'Connection',
  body: 'Body',
}

function paraTypeLabel(type) {
  const labels = {
    introduction: 'Introduction',
    body: 'Body',
    conclusion: 'Conclusion',
    narrative: 'Narrative',
    personal_statement: 'Personal Statement',
  }
  return labels[type] ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Paragraph')
}

// Section header text. Multi-paragraph assignments number the paragraphs; a
// single prose section shows just its type; a single non-prose section returns
// '' (its line items + the "Your Draft" panel title already say everything).
function sectionHeading(para, paraIdx, total) {
  if (total > 1) return `Paragraph ${paraIdx + 1}: ${paraTypeLabel(para.type)}`
  if (para.type === 'custom') return ''
  return paraTypeLabel(para.type)
}

function getParaItems(paraType) {
  const make = (id) => ({ id, label: COMPONENT_LABELS[id] ?? id, status: 'locked', text: null, nuggetText: null })
  switch (paraType) {
    case 'introduction':      return ['hook','context','thesis','roadmap'].map(make)
    case 'body':              return ['topic_sentence','evidence','analysis','transition'].map(make)
    case 'conclusion':        return ['echo','synthesis','thesis_restate','closing'].map(make)
    case 'narrative':         return ['hook','context','body','closing'].map(make)
    case 'personal_statement':return ['hook','context','reflection','connection'].map(make)
    default:                  return ['hook','context','body','closing'].map(make)
  }
}

function buildComponentTree(type, count, customLabels = null) {
  // Custom (non-prose) structure: the coach supplies the section/line labels for
  // forms that aren't standard prose paragraphs — haiku, poems, lists, etc.
  // Rendered as a single section whose items are those labels (ids c0, c1, …).
  if (type === 'custom' && customLabels?.length) {
    const items = customLabels.map((label, i) => ({
      id: `c${i}`, label, status: i === 0 ? 'working' : 'locked', text: null, nuggetText: null,
    }))
    return [{ index: 0, type: 'custom', status: 'working', summary: null, items }]
  }
  if (count === 1) {
    const paraType = type === 'essay' ? 'introduction' : type
    return [{ index: 0, type: paraType, status: 'working', summary: null, items: getParaItems(paraType) }]
  }
  return Array.from({ length: count }, (_, i) => {
    let paraType
    if (type === 'narrative' || type === 'personal_statement') {
      paraType = type
    } else {
      if (i === 0) paraType = 'introduction'
      else if (i === count - 1) paraType = 'conclusion'
      else paraType = 'body'
    }
    return { index: i, type: paraType, status: i === 0 ? 'working' : 'locked', summary: null, items: getParaItems(paraType) }
  })
}

function updateComponentItem(scaffold, paraIdx, componentId, updater) {
  return {
    ...scaffold,
    components: scaffold.components.map((p, i) =>
      i !== paraIdx ? p : {
        ...p,
        items: p.items.map(item => item.id === componentId ? updater(item) : item),
      }
    ),
  }
}

// Strips scaffold stream tokens + [DICTATE] + [CARE] + [SOURCE] from display text.
// [CARE] is the child-safety signal (drives the out-of-band CrisisResourceCard);
// [SOURCE] is the research/citations capture signal (drives the SourceCaptureCard).
// Both are client-state only and must never render as literal text to the student.
const ALL_TOKEN_RE = /\[(SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE|SOURCE):[^\]]*\]|\[COMPLETE\]|\[DICTATE\]|\[CARE\]/g

// Pulls the payloads of every [SOURCE:…] token out of a completed coach turn.
const SOURCE_TOKEN_RE = /\[SOURCE:([^\]]*)\]/g
function extractSourceTokens(text) {
  const out = []
  let m
  while ((m = SOURCE_TOKEN_RE.exec(text)) !== null) {
    const desc = m[1].trim()
    if (desc) out.push(desc)
  }
  return out
}
// A URL sitting inside a [SOURCE:…] payload, so the capture card can offer auto-fill.
function firstUrlIn(text) {
  const m = /(https?:\/\/[^\s\])]+)|(\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b(?:\/[^\s\])]*)?)/i.exec(text || '')
  if (!m) return null
  const raw = m[0]
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

// Display text for a still-streaming buffer: strips complete tokens, and also
// drops a trailing partial token (e.g. "[ACT" before its "]" has arrived) so
// half-emitted tokens never flash on screen mid-stream.
function liveDisplay(raw) {
  let t = raw.replace(ALL_TOKEN_RE, '')
  const lastOpen = t.lastIndexOf('[')
  if (lastOpen !== -1 && !t.slice(lastOpen).includes(']')) t = t.slice(0, lastOpen)
  return t.trimStart()
}

// ── Greeting ───────────────────────────────────────────────────────────────────

function buildGreeting(persona, name, scaffold, onboarding = false) {
  // Practice (onboarding) session: the student already met Owen in the tour and
  // just picked a prompt seconds ago. Don't re-introduce, don't call it an
  // "assignment", and never ask whether they've written anything — there's
  // nothing yet. Just warmly invite their first thought on the prompt.
  if (onboarding) {
    return onboardingGreeting(name)
  }

  const hasScaffold = scaffold?.components?.length > 0
  const allDone = hasScaffold && scaffold.components.every(p => p.status === 'complete')
  const anyDone = hasScaffold && scaffold.components.some(p => p.status === 'complete')

  if (!hasScaffold) {
    // Single source of truth (lib/greeting.js) — same text the server persists as
    // the first assistant message on session creation, so display can't drift.
    return newSessionGreeting(persona, name)
  }

  if (allDone) {
    const g = {
      deon: `Hey ${name}. Your essay is done. Every part of it. Nice work.`,
      zoe:    `Hi ${name}! You finished your whole essay — every single part! I'm so proud of you. It's ready!`,
      alistair: `Hello ${name}. It's Alistair. Your essay is complete. Every part of it. Well done.`,
      matilda:   `Hi ${name} — it's Tilly. Your essay is finished. Every part of it. That's a real accomplishment.`,
      owen:    `Hi ${name}. It's Owen. Your essay is done — every part of it. You did that. All of it.`,
      jade: `hey ${name}! your essay is done — like actually done. every single part. that's huge.`,
    }
    return g[persona] ?? g.owen
  }

  if (anyDone) {
    const done = scaffold.components.filter(p => p.status === 'complete').length
    const total = scaffold.components.length
    const g = {
      deon: `Hey ${name}. ${done} of ${total} paragraphs done. Let's keep going.`,
      zoe:    `Welcome back, ${name}! You've already finished ${done} of ${total} paragraphs — let's keep the momentum going!`,
      alistair: `Hello ${name}. Alistair here. ${done} of ${total} paragraphs done — solid progress. Let's carry on.`,
      matilda:   `Hello ${name} — Tilly here, welcome back. You've got ${done} of ${total} paragraphs done. Let's pick up where we left off.`,
      owen:    `Hi ${name}. Owen here. ${done} out of ${total} paragraphs done — that's real progress. Let's take the next step together.`,
      jade: `hey ${name}! back at it — ${done} of ${total} paragraphs done. let's just keep going.`,
    }
    return g[persona] ?? g.owen
  }

  // Has scaffold but nothing complete yet
  const g = {
    deon: `Hey ${name}. I've read your assignment. Let's start building your essay. What do you already know about this topic?`,
    zoe:    `Hi ${name}! I've read your assignment and I'm excited to dig in! What's the first thing that pops into your head about this?`,
    alistair: `Hello ${name}. I'm Alistair. I've read the assignment. Let's begin. What do you already know about this subject?`,
    matilda:   `Hi ${name} — I'm Tilly, lovely to meet you. I've had a read through your assignment. I'm curious — what do you already think about this topic?`,
    owen:    `Hi ${name}. I'm Owen. I've had a look at your assignment. No rush. What's the first thing that comes to mind when you think about this?`,
    jade: `hey ${name}! okay I read your assignment. have you started anything yet? if not, no stress. let's just start talking. what do you already know about this?`,
  }
  return g[persona] ?? g.owen
}

// ── Persona-switch handoff greeting ────────────────────────────────────────────
// Mid-session coach switches were previously generated by the model (askTutor with
// a synthetic "you are now X" message). That regeneration produced three live bugs
// (deep-read F4, Jul 6): retired persona NAMES ("I'm Jordan/Isla/Marcus" — the model
// pulling a name from history rather than the current registry), HALLUCINATED PROGRESS
// on an empty page ("I've had a read through what you've written…" when nothing exists
// — the single most trust-corrosive line in the corpus), and duplicate canned intros.
//
// The greeting is now assembled deterministically here — always the CURRENT display
// name (from PERSONA_META, canonical set), always a real handoff line naming the coach
// being taken over from, and state as the BRANCH: empty → claim nothing; in-progress →
// ground in what's actually locked; done → acknowledge the finish. No model call, so it
// can never invent a name or progress that isn't there.
//
// `state`: { locked, total, allDone, atStage } — derived from live scaffold/paragraphs.
function buildSwitchGreeting(newPersona, prevPersonaName, name, state) {
  const from = prevPersonaName ? ` from ${prevPersonaName}` : ''
  const { locked = 0, total = 0, allDone = false, atStage = null } = state ?? {}

  // Empty session: nothing written, nothing locked. NEVER claim progress.
  if (locked === 0 && !allDone) {
    const g = {
      deon: `Hey ${name}, I'm Deon — I'm taking over${from}. We're right at the start here, nothing locked in yet, so let's just get going. What's the first thing on your mind?`,
      zoe:    `Hi ${name}! I'm Zoe, jumping in${from}! Looks like we're right at the beginning — nothing's down yet, and that's totally fine. What's the first thing that comes to mind?`,
      alistair: `Hello ${name}. I'm Alistair, picking things up${from}. We're at the very beginning — nothing written yet — so let's start there. What do you already know about this?`,
      matilda:   `Hi ${name} — I'm Tilly, taking over${from}. We're right at the start, nothing locked in just yet, which is a perfectly good place to begin. What are you thinking so far?`,
      owen:    `Hi ${name}. I'm Owen, stepping in${from}. We're at the very beginning here — nothing written yet, and there's no rush. What's the first thing that comes to mind?`,
      jade: `hey ${name}! I'm Jade, jumping in${from}. we're right at the start, nothing down yet — no stress. what's the first thing on your mind?`,
    }
    return g[newPersona] ?? g.owen
  }

  // Whole piece finished.
  if (allDone) {
    const g = {
      deon: `Hey ${name}, I'm Deon, taking over${from}. Looks like you've already got the whole thing done — nice work. Want to look anything over?`,
      zoe:    `Hi ${name}! I'm Zoe, jumping in${from}! You've already finished the whole thing — amazing! Want to go back over any part of it together?`,
      alistair: `Hello ${name}. I'm Alistair, stepping in${from}. You've finished the whole piece already — well done. Is there anything you'd like to revisit?`,
      matilda:   `Hi ${name} — I'm Tilly, taking over${from}. You've got the whole thing finished already, which is lovely. Would you like to look back over any of it?`,
      owen:    `Hi ${name}. I'm Owen, stepping in${from}. You've already finished the whole piece — that's real work. Want to review any part of it?`,
      jade: `hey ${name}! I'm Jade, jumping in${from}. you've already got the whole thing done — that's huge. wanna look over any of it?`,
    }
    return g[newPersona] ?? g.owen
  }

  // In progress: ground the greeting in what's actually locked in.
  const progress = total > 0 ? `${locked} of ${total} ${total === 1 ? 'part' : 'parts'} locked in` : `${locked} ${locked === 1 ? 'part' : 'parts'} locked in`
  const stageNote = atStage ? ` We're working on the ${atStage} right now.` : ''
  const g = {
    deon: `Hey ${name}, I'm Deon, taking over${from}. You've got ${progress} — good progress.${stageNote} Let's keep going. Where were you?`,
    zoe:    `Hi ${name}! I'm Zoe, jumping in${from}! You've already got ${progress} — nice momentum!${stageNote} Let's pick right back up. Where were you at?`,
    alistair: `Hello ${name}. I'm Alistair, picking up${from}. You've got ${progress} so far — solid.${stageNote} Let's carry on. Where did you leave off?`,
    matilda:   `Hi ${name} — I'm Tilly, taking over${from}. You've got ${progress} already, which is real progress.${stageNote} Let's pick up where you left off — where were you?`,
    owen:    `Hi ${name}. I'm Owen, stepping in${from}. You've got ${progress} so far — that's real progress.${stageNote} No rush. Where were you up to?`,
    jade: `hey ${name}! I'm Jade, jumping in${from}. you've got ${progress} already — nice.${stageNote} let's just keep going. where were you at?`,
  }
  return g[newPersona] ?? g.owen
}

// Derive the live session state the switch greeting branches on, from the scaffold
// (locked components / current stage) and any persisted paragraphs. Counts a
// paragraph "part" as locked if its scaffold section is complete OR a scribed
// paragraph exists at that index — matches what the student actually sees locked.
function deriveSwitchState(scaffold, paragraphs) {
  const sections = scaffold?.components ?? []
  const paraCount = (paragraphs ?? []).filter(p => p?.scribed_text).length

  if (sections.length > 0) {
    const total = sections.length
    const complete = sections.filter(s => s.status === 'complete').length
    const locked = Math.max(complete, Math.min(paraCount, total))
    const allDone = total > 0 && locked >= total
    // Name the stage the coach is mid-way through (the working component's label),
    // only while there's an active, not-yet-complete section.
    let atStage = null
    if (!allDone) {
      const idx = scaffold?.current_paragraph_index ?? 0
      const active = sections[idx]
      const workingItem = active?.items?.find(it => it.status === 'working' || it.status === 'candidate')
      if (workingItem?.label) atStage = workingItem.label.toLowerCase()
    }
    return { locked, total, allDone, atStage }
  }

  // No scaffold yet — fall back to persisted paragraphs alone (rare: a switch before
  // any scaffold exists is effectively an empty session).
  return { locked: paraCount, total: 0, allDone: false, atStage: null }
}

// ── Multi-session resume greeting ───────────────────────────────────────────────
// A student who stopped mid-essay yesterday reloads into a wall of old transcript
// with no re-orientation. The essay-funnel sim (2026-07-09) showed a 5-paragraph
// essay is ~40–50 coach turns — too long for one sitting — so returning mid-essay
// is the norm, not the exception. This assembles a momentum-aware "welcome back"
// from LIVE scaffold state, deterministically (no model call — same F4 discipline as
// buildSwitchGreeting, so it can NEVER hallucinate progress the student didn't make).
//
// It reads: the count ("2 of 5 locked in"), an orientation from the most-recently-
// completed paragraph's [PARA_DONE] `summary` (degrading gracefully to generic when
// the summary is null — Job A sometimes leaves it null), a forward invite tied to the
// cursor's paragraph type, and an optional one-line thesis anchor. Persona voice lives
// in the opener; the shared tail (orientation/thesis/forward) is a plain question so
// it can't drift from the actual state.
function paraFriendlyLabel(type) {
  switch (type) {
    case 'introduction':       return 'introduction'
    case 'body':               return 'body paragraph'
    case 'conclusion':         return 'conclusion'
    case 'narrative':          return 'section'
    case 'personal_statement': return 'section'
    default:                   return 'paragraph'
  }
}

function buildResumeGreeting(persona, name, scaffold) {
  const trim = (t, n) => { const s = String(t ?? '').trim(); return s.length > n ? s.slice(0, n).trimEnd() + '…' : s }
  const components = scaffold?.components ?? []
  const total = scaffold?.total_paragraphs || components.length || 0
  const done = components.filter(p => p.status === 'complete').length
  const countN = `${done} of ${total}`

  // Orientation — from the most-recently-completed paragraph (highest complete index).
  let orient = ''
  const lastComplete = [...components].reverse().find(p => p.status === 'complete')
  if (lastComplete) {
    const label = paraFriendlyLabel(lastComplete.type)
    const summary = trim(lastComplete.summary, 90)
    orient = summary
      ? `Last time you wrapped up your ${label}: "${summary}".`
      : `Last time you finished your ${label}.`
  }

  // Forward invite — tied to the cursor's paragraph type.
  const cursor = scaffold?.current_paragraph_index ?? done
  const nextType = components[cursor]?.type
  const remaining = total - done
  let forward
  if (nextType === 'conclusion' || (remaining === 1 && nextType)) {
    forward = 'Just the conclusion left — want to finish it off?'
  } else if (nextType === 'body') {
    forward = 'Ready to start the next body paragraph?'
  } else if (nextType) {
    forward = `Ready to pick up with your ${paraFriendlyLabel(nextType)}?`
  } else {
    forward = 'Ready to pick up where you left off?'
  }

  // Optional thesis anchor (grounds Rule 11 tracking for the student too).
  const thesisText = typeof scaffold?.thesis === 'string' ? trim(scaffold.thesis, 120) : ''
  const thesisLine = thesisText ? `Your thesis is still: "${thesisText}".` : ''

  const tail = [orient, thesisLine, forward].filter(Boolean).join(' ')
  const opener = {
    deon:     `Hey ${name}, welcome back. ${countN} paragraphs locked in.`,
    zoe:      `Welcome back, ${name}! You've already got ${countN} paragraphs locked in — nice momentum!`,
    alistair: `Hello ${name}. Alistair here, welcome back. You've got ${countN} paragraphs locked in.`,
    matilda:  `Hi ${name} — Tilly here, welcome back. You've got ${countN} paragraphs locked in.`,
    owen:     `Hi ${name}. Owen here, welcome back. You've got ${countN} paragraphs locked in — that's real progress.`,
    jade:     `hey ${name}! welcome back — you've got ${countN} paragraphs locked in already.`,
  }
  return `${opener[persona] ?? opener.owen} ${tail}`.trim()
}

// ── Scribe confirmation message ────────────────────────────────────────────────

function buildConfirmMessage(persona, paragraph, isThin, thinNote) {
  const thin = isThin && thinNote ? ` Just a heads-up: ${thinNote}` : ''
  const lines = {
    deon: `Alright, here's what I've got:\n\n"${paragraph}"\n\nDoes that sound right?${thin}`,
    zoe:    `Okay, here's what I heard!\n\n"${paragraph}"\n\nDoes that sound like you?${thin}`,
    alistair: `Right, let me read that back:\n\n"${paragraph}"\n\nDoes that sound right to you?${thin}`,
    matilda:   `Here's what I heard you say:\n\n"${paragraph}"\n\nDoes that feel like yours?${thin}`,
    owen:    `Okay, here's what we've got:\n\n"${paragraph}"\n\nDoes that sound right? We can change anything.${thin}`,
    jade: `okay here's what I got:\n\n"${paragraph}"\n\ndoes that sound like you?${thin}`,
  }
  return lines[persona] ?? lines.owen
}

// ── Full-essay read-back (UI-assembled, never model-regenerated) ────────────────
// Deep-read F7: 2 of 3 full-essay re-reads truncated mid-sentence at the emotional
// peak of the session, because the coach REGENERATED the whole essay inline and hit
// the output ceiling. A full read-back must be assembled by the UI from the locked
// paragraphs — the SAME source the transcript page uses (paragraphs → scribed_text,
// with the scaffold's confirmed line items as the non-prose fallback) — so it is
// always verbatim and never truncated.

// Detect a request for the WHOLE piece read back (not a single paragraph). Kept
// deliberately tight: it must mention reading/seeing AND a whole/full/entire/all
// scope so ordinary "read that back" (single-paragraph) requests still route to the
// coach. Matches phrasings seen in the corpus ("read the whole thing", "the full
// essay", "can I see all of it", "it was cut off / read it again").
function wantsFullReadback(text) {
  const t = (text || '').toLowerCase()
  const reads = /(read|re-?read|hear|see|show|say)\b/.test(t)
  const scope = /\b(whole|full|entire|all of it|everything|complete|finished)\b/.test(t)
  const essayWord = /\b(essay|piece|thing|draft|paragraphs|it again|again)\b/.test(t)
  const cutOff = /\b(cut off|cutoff|got cut|truncat|only got part|didn'?t finish)\b/.test(t)
  return (reads && scope && essayWord) || (reads && cutOff)
}

// Assemble the verbatim read-back text from the same source as the transcript page.
function assembleReadBackText(scaffold, paragraphs) {
  const prose = (paragraphs ?? []).filter(p => p?.scribed_text).map(p => p.scribed_text)
  if (prose.length) return prose.join('\n\n')
  // Non-prose fallback (e.g. a haiku's lines) — confirmed scaffold line items in order.
  const lines = (scaffold?.components ?? [])
    .flatMap(sec => sec.items ?? [])
    .filter(it => it.status === 'confirmed' && (it.text || it.nuggetText))
    .map(it => it.text || it.nuggetText)
  return lines.join('\n')
}

function buildReadBackMessage(persona, body) {
  const lines = {
    deon: `Here's the whole thing, exactly as you wrote it:\n\n${body}`,
    zoe:    `Okay! Here's your whole piece, word for word:\n\n${body}`,
    alistair: `Right — here's the whole piece as it stands:\n\n${body}`,
    matilda:   `Here's the whole thing, just as you wrote it:\n\n${body}`,
    owen:    `Here's the whole thing, exactly in your own words:\n\n${body}`,
    jade: `okay here's the whole thing, word for word:\n\n${body}`,
  }
  return lines[persona] ?? lines.owen
}

// ── Live caption ──────────────────────────────────────────────────────────────
// Owns its own text state so the 30ms word-sync updates during audio playback
// re-render only this small bubble, not the whole TutorSession tree. The parent
// drives it imperatively via a ref (set/clear) instead of parent state.
const LiveCaption = forwardRef(function LiveCaption({ persona, bottomRef }, ref) {
  const [text, setText] = useState('')
  useImperativeHandle(ref, () => ({
    set: (t) => setText(t),
    clear: () => setText(''),
  }), [])
  useEffect(() => {
    if (text) bottomRef?.current?.scrollIntoView({ behavior: 'smooth' })
  }, [text, bottomRef])
  if (!text) return null
  return (
    <div className="flex justify-start">
      <PersonaAvatar personaId={persona} size={28} className="mr-2 mt-1 shrink-0" />
      <div className="rounded-2xl rounded-bl-sm px-4 py-3 max-w-lg text-sm leading-relaxed"
        style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-body)' }}>
        {renderMarkdown(text)}<span className="animate-pulse ml-0.5">▋</span>
      </div>
    </div>
  )
})

// ── Reply composer ────────────────────────────────────────────────────────────
// Owns the text-input state and textarea, so per-keystroke typing and live
// speech-interim updates re-render only the footer — not the whole TutorSession.
// Coach read-aloud (voice) mute toggle — lives next to the mic so the two voice
// controls (coach output ↔ student input) sit together. Orange = voice/action per
// brand; ON tints the speaker accent, OFF is muted grey with a slashed icon.
function VoiceToggleButton({ readAloud, onToggle, saving = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={readAloud}
      aria-label={readAloud ? 'Coach voice on — tap to mute read-aloud' : 'Coach voice muted — tap to turn read-aloud on'}
      title={readAloud ? 'Coach reads answers aloud' : 'Coach voice muted'}
      className="flex items-center justify-center rounded-full transition shrink-0"
      style={{
        width: 44, height: 44,
        backgroundColor: readAloud ? 'var(--surface-spark)' : 'var(--surface-muted)',
        color: readAloud ? 'var(--accent)' : 'var(--text-subtle)',
        border: `1px solid ${readAloud ? 'var(--border-accent)' : 'var(--border-default)'}`,
        opacity: saving ? 0.7 : 1,
      }}
      onMouseEnter={e => { if (!readAloud) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { if (!readAloud) e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      <Icon name={readAloud ? 'speaker' : 'speaker-off'} size={18} />
    </button>
  )
}

// Renders the 'listening' or 'dictating' footer and calls onSubmit with the
// final text. (Note: the previous inline textareas had a duplicate `style` prop,
// so React dropped the first object and the border/background never rendered;
// the styles below merge both into the intended design.)
const ReplyComposer = memo(function ReplyComposer({ mode, assignmentKeyterms, onSubmit, onSpeechStart, coachBusy = false, recoveredText = null, noticeLine = null, readAloud = true, onToggleReadAloud, savingVoicePref = false }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)
  const micRef = useRef(null)
  const editingRef = useRef(false)
  // Briefly true right after Send so a trailing STT final can't repopulate the box
  // we just cleared (dictate-then-Send used to leave the spoken words behind).
  const justSubmittedRef = useRef(false)
  // Fires onSpeechStart once per mic activation the moment REAL speech is transcribed,
  // so the coach's read-aloud pauses when the student starts talking (not only on Send).
  // Reset on each mic (re)start — onInterim('') — so the next utterance can fire again.
  const spokeRef = useRef(false)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text])

  // Scribe-failure recovery: seed the composer with the raw spoken text handed back
  // so the student can resend without re-dictating. Treat it as an edit so live mic
  // interims don't clobber the restored words. Runs only when the value changes.
  useEffect(() => {
    if (recoveredText) { editingRef.current = true; setText(recoveredText) }
  }, [recoveredText])

  // Half-duplex backstop: whenever the coach becomes busy (thinking, then speaking),
  // make sure the mic is CLOSED so the coach's read-aloud can't be captured by an
  // open mic and transcribed back into the box (the reported feedback loop). This
  // covers coach turns triggered OUTSIDE this composer's own Send — e.g. a scaffold
  // lock-in action or a persona switch. It only ever CLOSES the mic, never reopens
  // it, so manual barge-in (the student re-tapping to speak) is preserved. In
  // dictating mode coachBusy is unset (defaults false) so this is a no-op there.
  useEffect(() => {
    if (coachBusy) micRef.current?.stop()
  }, [coachBusy])

  function resetHeight() {
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }
  function submit() {
    // While the coach is still writing its reply, hold the send — typing is allowed
    // but the message can't go until the coach's words are fully committed (sending
    // then interrupts only the read-aloud, never the unfinished text).
    if (coachBusy) return
    const t = text.trim()
    if (!t) return
    // Half-duplex voice: CLOSE the mic on every send. We already hold the text (`t`),
    // so stop() silently tears down the Scribe WebSocket + mic stream WITHOUT firing
    // onFinal (no double-submit). This is the core fix for the reported feedback loop:
    // the mic must be OFF while the coach speaks, or its read-aloud gets transcribed
    // back into the box. The student re-taps the mic when they want to talk again.
    // justSubmittedRef still shuts the door on a committed-transcript event that may
    // already have been queued when the socket closed, so the box we're about to clear
    // can't be refilled by the tail of the utterance we just sent. Reset editingRef so
    // a fresh mic start resumes clean live dictation for the next message.
    micRef.current?.stop()
    editingRef.current = false
    justSubmittedRef.current = true
    setTimeout(() => { justSubmittedRef.current = false }, 600)
    setText('')
    resetHeight()
    onSubmit(t)
  }

  // Live transcription writes into the box. Once the student starts editing,
  // ignore further interim updates so we don't clobber their changes. A mic
  // (re)start fires onInterim('') which re-enables transcription.
  function handleInterim(t) {
    if (justSubmittedRef.current) return   // ignore the tail of the just-sent utterance
    if (t === '') { editingRef.current = false; spokeRef.current = false; setText(''); return }
    // First real words of this utterance → pause the coach's read-aloud (barge-in on
    // speech, not just on Send). Once per activation; harmless if nothing is playing.
    if (!spokeRef.current) { spokeRef.current = true; onSpeechStart?.() }
    if (!editingRef.current) setText(t)
  }
  // Any manual edit (typing or paste) silently stops the mic so it can't keep
  // overwriting, and flags that we're now editing.
  function handleEdit(value) {
    // Deleting/clearing must NOT kill the mic (you're clearing to re-dictate). Only
    // ADDING characters (manual typing) pauses the mic so live interims can't fight
    // your keystrokes; emptying the box re-arms live dictation.
    const adding = value.length > text.length
    if (adding) { micRef.current?.stop(); editingRef.current = true }
    else if (value === '') editingRef.current = false
    setText(value)
  }

  if (mode === 'dictating') {
    return (
      <div className="border-t-2 flex flex-col gap-2 px-5 py-3"
        style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--surface-spark)' }}>
        {noticeLine && (
          <p className="text-xs leading-snug rounded-lg px-3 py-2"
            style={{ color: 'var(--text-body)', backgroundColor: 'var(--surface-card)', border: '1px solid var(--accent)' }}>
            {noticeLine}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
            <Icon name="mic" size={12} /> Dictation mode — say your paragraph
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Editing pauses the mic</span>
        </div>
        <div className="flex items-center gap-3">
          <MicButton
            ref={micRef}
            disabled={false}
            assignmentKeyterms={assignmentKeyterms}
            onInterim={handleInterim}
            onFinal={(t) => { if (t && !justSubmittedRef.current) { editingRef.current = false; setText(''); resetHeight(); onSubmit(t) } }}
          />
          {onToggleReadAloud && <VoiceToggleButton readAloud={readAloud} onToggle={onToggleReadAloud} saving={savingVoicePref} />}
          <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex-1 flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => handleEdit(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              placeholder="Speak or type your paragraph here…"
              rows={1}
              className="flex-1 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 transition-colors resize-none overflow-hidden leading-relaxed"
              style={{ color: 'var(--text-body)', border: '2px solid var(--accent)', backgroundColor: 'var(--surface-card)', '--tw-ring-color': 'var(--accent)', minHeight: '42px', maxHeight: '160px' }}
            />
            <button type="submit" disabled={!text.trim()}
              className="text-sm text-white font-semibold rounded-xl px-4 py-2.5 transition disabled:opacity-40 shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}>
              Add to essay →
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-page)', borderTop: '1px solid var(--border-default)' }}>
      {/* While the coach is still writing, the student can type ahead — Send just
          waits. Once the coach's text lands, Send unlocks; pressing it then cuts
          the read-aloud short (the audio runs behind the written words). */}
      {coachBusy && (
        <div className="px-5 pt-2 flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-subtle)' }}>
          <span className="animate-pulse" style={{ color: 'var(--accent)' }}>●</span>
          <span>Coach is writing — you can keep typing; Send unlocks when they finish.</span>
        </div>
      )}
      <div className="px-5 py-3 flex items-center gap-3">
        <MicButton
          ref={micRef}
          disabled={false}
          assignmentKeyterms={assignmentKeyterms}
          onInterim={handleInterim}
          onFinal={(t) => { if (t && !editingRef.current && !justSubmittedRef.current) setText(t) }}
        />
        {onToggleReadAloud && <VoiceToggleButton readAloud={readAloud} onToggle={onToggleReadAloud} saving={savingVoicePref} />}
        <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex-1 flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => handleEdit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Type or speak your reply…"
            rows={1}
            className="flex-1 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 transition-colors resize-none overflow-hidden leading-relaxed"
            style={{ color: 'var(--text-body)', border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', '--tw-ring-color': 'var(--accent)', minHeight: '42px', maxHeight: '160px' }}
          />
          <button type="submit" disabled={!text.trim() || coachBusy}
            className="text-sm text-white rounded-xl px-4 py-2.5 transition disabled:opacity-40 shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
})

// Sessions that have already shown their opening greeting, keyed by session id.
// Module-level (not a ref) so it survives a component remount — a remount would
// otherwise reset the per-instance hasGreeted ref and deliver the greeting twice.
const greetedSessions = new Set()

// A resumed session earns a fresh "welcome back" only after a real gap — without a
// time gate every StrictMode remount or accidental refresh would inject one, which
// reads as broken. 45 min: long enough that a same-sitting refresh stays silent,
// short enough that a lunch-break return gets re-oriented. (spec Q1)
const RESUME_GAP_MS = 45 * 60 * 1000

// ── Component ─────────────────────────────────────────────────────────────────

export default function TutorSession({
  session,
  initialMessages = [],
  initialParagraphs = [],
  initialScaffold = null,
  studentName = 'there',
  initialTeachers = [],
  // Research & Citations v1: the session's saved sources (metadata only). Drives the
  // form-gated sources shelf + auto-bibliography. Empty/absent for non-essay forms.
  initialSources = [],
  // Count of linked adults (parents via relationships + teachers on this
  // assignment) who can read this session — drives the ambient visibility note.
  watcherCount = 0,
  // Edge-geo country code for the crisis card's local resources. Passed through
  // from the server render (x-vercel-ip-country); never stored. null → US default.
  country = null,
  user = null,
  profile = null,
  onboarding = false,
  impersonation = null,
  // ── Writing Gym reuse seams (additive; defaults preserve assignment-mode behavior) ──
  // The gym runs the exact same coaching surface against a different backend: a
  // gym-mode coach prompt (/api/gym/tutor) and a completion path that awards the
  // Practiced badge + portfolio entry (/api/gym/complete/[id]). `gym` carries the
  // skill label + back links for the header and the completion card.
  tutorEndpoint = '/api/tutor',
  completeEndpoint = null,
  gym = null,
}) {
  const [messages, setMessages]           = useState(
    initialMessages.map(m => m.role === 'assistant' ? { ...m, persona: resolvePersona(session.persona) } : m)
  )
  const [paragraphs, setParagraphs]       = useState(initialParagraphs)
  const [scaffold, setScaffold]           = useState(initialScaffold)
  const captionRef                        = useRef(null)
  // True only on the FIRST coach turn of a genuinely resumed session (set when the
  // resume greeting fires); sent to /api/tutor so the coach's dynamic-tail RESUMING
  // orientation fires once and it doesn't re-greet. Cleared after that first turn.
  const resumePendingRef                  = useRef(false)
  const [pendingScribe, setPendingScribe] = useState(null)
  const [phase, setPhase]                 = useState('waiting')
  const [persona, setPersona]             = useState(resolvePersona(session.persona))
  const [showPersonaPicker, setShowPersonaPicker] = useState(false)
  const [sessionTitle, setSessionTitle]   = useState(session.title ?? null)
  const [titleExpanded, setTitleExpanded] = useState(false)
  const [assignmentSummary, setAssignmentSummary] = useState(session.assignment_summary ?? null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [editingTitle, setEditingTitle]   = useState(false)
  const [titleDraft, setTitleDraft]       = useState('')
  const [replayingIndex, setReplayingIndex] = useState(null)
  const [sessionComplete, setSessionComplete] = useState(session.status === 'complete')
  // Child-safety: shown when a coach turn carries the [CARE] signal. Local state
  // ONLY — never persisted, never sent anywhere a watcher could read (the linked
  // adult may be who the child needs help from). See CrisisResourceCard.
  const [showCrisisCard, setShowCrisisCard] = useState(false)
  // Research & Citations v1 (form-gated to essays). `sources` = saved citation rows;
  // `captureQueue` = pending [SOURCE:]/manual cards awaiting the student's confirm.
  const [sources, setSources]               = useState(initialSources)
  const [captureQueue, setCaptureQueue]     = useState([])
  const [citationStyle, setCitationStyle]   = useState('mla')
  const captureKeyRef                        = useRef(0)
  const [sectionJustCompleted, setSectionJustCompleted] = useState(null)
  const [expandedParas, setExpandedParas]   = useState({})
  const [assembledEssay, setAssembledEssay] = useState(null)
  const [isAssemblingEssay, setIsAssemblingEssay] = useState(false)
  const [editingParaIdx, setEditingParaIdx]         = useState(null)
  const [editDraft, setEditDraft]                   = useState('')
  const [editingComponent, setEditingComponent]     = useState(null) // { paraIdx, componentId }
  const [componentEditDraft, setComponentEditDraft] = useState('')
  const [lockingComponent, setLockingComponent]     = useState(null) // { paraIdx, componentId } — manual lock-in fallback
  const [lockDraft, setLockDraft]                   = useState('')
  const [currentSubject, setCurrentSubject]         = useState(session.subject ?? 'unspecified')
  const [subjectCustomLabel, setSubjectCustomLabel] = useState(session.subject_custom_label ?? '')
  const [savingSubject, setSavingSubject]           = useState(false)
  const [teachers, setTeachers]                     = useState(initialTeachers)
  const [activePanel, setActivePanel]               = useState(null) // null | 'subject' | 'teacher'
  const [activeTab, setActiveTab]                   = useState('chat') // 'chat' | 'essay'
  // Scribe-failure recovery: when /api/scribe fails, the student's spoken paragraph
  // must never be lost. We drop back to the dictation composer, restore the raw text
  // into the input (retriable), and show one warm notice line. (fragility audit D2)
  const [recoveredDictation, setRecoveredDictation] = useState(null) // raw spoken text to restore
  const [scribeNotice, setScribeNotice]             = useState(null) // warm retry line

  const chatBottomRef     = useRef(null)
  const titleInputRef     = useRef(null)
  const hasGreeted        = useRef(false)
  const audioRef          = useRef(null)   // single persistent <audio>, unlocked on first gesture
  const audioTimerRef     = useRef(null)
  const playSeqRef        = useRef(0)       // bumps each playback; stale playbacks bail
  const tutorRunRef       = useRef(0)       // bumps each coach turn; a superseded turn's leftover audio bails
  const audioUnlockedRef  = useRef(false)
  const pendingGreetingRef = useRef(null)   // greeting that got autoplay-blocked, to re-speak on first gesture
  const everPlayedRef     = useRef(false)   // has any clip actually started playing yet?

  const barPanelRef       = useRef(null)
  const router           = useRouter()

  // ── Coach read-aloud (TTS) preference + conservative auto-mute offer ──────────
  // Voice-first DEFAULT: everyone starts voice-ON. `coach_read_aloud` is an opt-OUT
  // persisted per-user (migration 030). Undefined (pre-migration) reads as ON. The
  // ref mirrors the state so the async audio pipeline reads the CURRENT value, not a
  // stale closure. See docs/specs/brainscribe-coach-voice-toggle-spec.md.
  const [readAloud, setReadAloud] = useState(profile?.coach_read_aloud !== false)
  const readAloudRef              = useRef(profile?.coach_read_aloud !== false)
  const [savingVoicePref, setSavingVoicePref] = useState(false)
  // Auto-mute offer: fires at most once per session, never during onboarding/skill-studio,
  // and never again once the student has permanently dismissed it.
  const [showVoiceOffer, setShowVoiceOffer]   = useState(false)
  const audioEventsRef        = useRef([])                  // ordered per-turn audio outcomes
  const pendingAudioTurnRef   = useRef(false)               // a voiced coach turn is in flight, unsettled
  const offeredThisSessionRef = useRef(false)
  const dismissedForeverRef   = useRef(Boolean(profile?.voice_prompt_dismissed_at))

  // Persist the read-aloud flip via the owner-scoped authed endpoint (NOT service
  // role). Local state flips immediately; the network write is best-effort.
  function persistVoicePref(body) {
    fetch('/api/profile/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {})
  }

  function applyReadAloud(next) {
    readAloudRef.current = next
    setReadAloud(next)
  }

  // Header speaker toggle. Flipping to OFF stops any in-flight read-aloud cleanly
  // (existing stopCurrentAudio) — the text stays committed. Clears any pending
  // turn WITHOUT recording a skip (an explicit mute isn't a "reading-ahead" signal).
  function toggleReadAloud() {
    const next = !readAloudRef.current
    applyReadAloud(next)
    if (!next) { pendingAudioTurnRef.current = false; stopCurrentAudio() }
    setSavingVoicePref(true)
    persistVoicePref({ readAloud: next })
    setTimeout(() => setSavingVoicePref(false), 400)
  }

  // Record one audio outcome for the just-finished coach turn, then re-evaluate the
  // auto-mute heuristic (pure — lib/voiceDeduce). Excluded during onboarding + gym.
  function recordAudioOutcome(kind) {
    audioEventsRef.current = [...audioEventsRef.current, kind]
    if (onboarding || gym) return
    if (offeredThisSessionRef.current) return
    const { suggest } = deduceVoiceSuggestion(audioEventsRef.current, {
      voiceCurrentlyOn:   readAloudRef.current,
      offeredThisSession: offeredThisSessionRef.current,
      dismissedForever:   dismissedForeverRef.current,
    })
    if (suggest) {
      offeredThisSessionRef.current = true
      setShowVoiceOffer(true)
    }
  }

  // Settle the pending voiced turn exactly once (completion, or the student cutting
  // it short by advancing). No-op if there's no pending turn (dedupes double-fires).
  function settleAudioTurn(kind) {
    if (!pendingAudioTurnRef.current) return
    pendingAudioTurnRef.current = false
    recordAudioOutcome(kind)
  }

  // Auto-mute offer actions.
  function acceptVoiceMute() {
    setShowVoiceOffer(false)
    applyReadAloud(false)
    pendingAudioTurnRef.current = false
    stopCurrentAudio()
    persistVoicePref({ readAloud: false })
  }
  function declineVoiceMute() {
    setShowVoiceOffer(false)
    dismissedForeverRef.current = true      // never re-ask, this session or future ones
    persistVoicePref({ dismissed: true })
  }

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mobile browsers block audio.play() unless it's first triggered inside a user
  // gesture. The coach's audio plays after an async fetch (and, for voice, a
  // WebSocket callback), so it's outside any gesture and gets blocked — the coach
  // types but stays silent. Unlock a single reusable <audio> on the first tap/key,
  // then reuse that element for every clip so playback is allowed thereafter.
  useEffect(() => {
    function cleanup() {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    function unlock() {
      audioUnlockedRef.current = true
      const el = getAudioEl()
      // If a clip is already playing, the element is unlocked — DON'T touch it.
      // (The old code overwrote el.src on every first gesture, cutting the coach
      // off mid-sentence when the student scrolled.)
      if (!el.paused) { cleanup(); return }
      // 1-frame silent WAV — playing it within the gesture blesses the element so
      // later async plays are allowed (iOS).
      el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
      el.play().then(() => { el.pause(); el.currentTime = 0 }).catch(() => {})
      // Re-speak the greeting if it was autoplay-blocked before this first gesture
      // (its blob URL was already freed, so we re-fetch rather than resume).
      if (pendingGreetingRef.current && !everPlayedRef.current) {
        const g = pendingGreetingRef.current
        pendingGreetingRef.current = null
        replayAudioOnly(g.text, g.persona)
      }
      cleanup()
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return cleanup
  }, [])

  useEffect(() => {
    if (!activePanel) return
    function handle(e) {
      if (barPanelRef.current && !barPanelRef.current.contains(e.target)) setActivePanel(null)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [activePanel])

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  useEffect(() => {
    // Two guards, two jobs. hasGreeted.current blocks a same-mount re-run (React
    // StrictMode double-invoke); greetedSessions (module-level) blocks re-greeting
    // the same session after a client-side re-mount. When the module Set already
    // holds this id but THIS instance hasn't greeted, we intentionally skip the
    // greeting — but we must still release the composer. A non-onboarding greeting
    // is never persisted, so a re-mount arrives with empty initialMessages and phase
    // stuck at 'waiting' → coachBusy stays true → Send is permanently disabled until a
    // hard reload. Set 'listening' before returning so the lock can't happen,
    // independent of nav style (fragility audit D1 — was only unarmed by full-reload
    // <a> nav; a routine <a>→<Link> change would otherwise arm it app-wide).
    if (hasGreeted.current || greetedSessions.has(session.id)) {
      if (!hasGreeted.current) setPhase('listening')
      hasGreeted.current = true
      return
    }
    hasGreeted.current = true
    if (initialMessages.length > 0) {
      setPhase('listening')
      // The opening greeting is now persisted server-side for BOTH onboarding and
      // regular assignment sessions (app/api/sessions), so a brand-new session's
      // first load arrives with exactly one assistant message and no student turn
      // yet. Speak it once in the background — the student hears the coach open, but
      // the input is live immediately (no waiting on audio, which previously gated
      // the whole session behind the greeting clip). Guarded by greetedSessions so a
      // remount can't re-speak; length===1 + assistant-role means it can only fire on
      // the true first load (any student reply makes length >= 2). A pre-change
      // session with no stored opener has a user-role first message, so it's skipped.
      if (initialMessages.length === 1 && initialMessages[0]?.role === 'assistant') {
        greetedSessions.add(session.id)
        replayAudioOnly(initialMessages[0].content, resolvePersona(session.persona))
      }

      // ── Resume greeting (the core gap) ──────────────────────────────────────
      // Until now this early-return meant any returning session skipped greeting
      // delivery, so buildGreeting's momentum branch was DEAD CODE on resume: a
      // student who stopped mid-essay reloaded into a wall of old transcript with no
      // re-orientation. Fire a fresh (non-persisted) "welcome back" when this is a
      // GENUINE resume — real banked progress AND a real gap since last activity —
      // scoped to multi-paragraph assignment sessions. Never onboarding (single hook,
      // same sitting) or gym (single-paragraph skill reps): both are always one
      // sitting, mirroring Job A's scoping. Reaching here means greetedSessions does
      // NOT hold this id (the guard above already returned otherwise), so this can't
      // double-greet; we add the id before delivering to keep it that way.
      const sc = initialScaffold
      const isMultiPara = (sc?.total_paragraphs ?? 0) > 1 || (sc?.components?.length ?? 0) > 1
      const bankedProgress = !!sc && (
        (sc.components ?? []).some(p => p.status === 'complete') ||
        (sc.components ?? []).some(p => (p.items ?? []).some(it => it.status === 'confirmed'))
      )
      // Gap since last activity: prefer sessions.last_active_at; fall back to the
      // newest message timestamp when the column is null (pre-backfill / untouched).
      let lastActiveMs = session?.last_active_at ? Date.parse(session.last_active_at) : NaN
      if (Number.isNaN(lastActiveMs)) {
        for (const m of initialMessages) {
          const t = m?.created_at ? Date.parse(m.created_at) : NaN
          if (!Number.isNaN(t) && (Number.isNaN(lastActiveMs) || t > lastActiveMs)) lastActiveMs = t
        }
      }
      const gapElapsed = !Number.isNaN(lastActiveMs) && (Date.now() - lastActiveMs > RESUME_GAP_MS)

      if (!onboarding && !gym && session.status !== 'complete' && isMultiPara && bankedProgress && gapElapsed) {
        greetedSessions.add(session.id)
        resumePendingRef.current = true   // the first coach turn signals resume to /api/tutor
        const activePersona = resolvePersona(session.persona)
        const greeting = buildResumeGreeting(activePersona, studentName, sc)
        // Same delivery path buildSwitchGreeting uses: append after the existing
        // transcript (history = current messages), speak it, keep the composer open.
        // Deterministic → can't hallucinate progress; never persisted.
        deliverTutorMessage(greeting, messages, activePersona)
      }
      return
    }
    greetedSessions.add(session.id)
    // Pin the greeting text, avatar, and TTS voice to the SAME resolved persona so a
    // legacy/retired session key can't produce a mismatched "I'm <other coach>" open.
    const activePersona = resolvePersona(session.persona)
    const greeting = buildGreeting(activePersona, studentName, initialScaffold, onboarding)
    deliverTutorMessage(greeting, [], activePersona)
  }, [])

  // ── Audio / TTS ─────────────────────────────────────────────────────────────

  function getAudioEl() {
    if (!audioRef.current) {
      const el = new Audio()
      el.preload = 'auto'
      audioRef.current = el
    }
    return audioRef.current
  }

  function stopCurrentAudio() {
    playSeqRef.current++   // invalidate any in-flight playback
    if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null }
    const el = audioRef.current
    if (el) { try { el.pause() } catch {} }
    window.speechSynthesis?.cancel()
  }

  // Plays a TTS blob URL on the single unlocked element. Resolves when the clip
  // ends, errors, or is superseded by a newer playback. onMeta(durationMs) fires
  // once metadata loads (used by the word-sync caption).
  function playClip(url, onMeta) {
    const el = getAudioEl()
    const seq = ++playSeqRef.current
    return new Promise((resolve) => {
      const done = () => { if (playSeqRef.current === seq) resolve() }
      el.onended = done
      el.onerror = () => { try { URL.revokeObjectURL(url) } catch {} ; done() }
      el.onloadedmetadata = () => { if (playSeqRef.current === seq) onMeta?.((el.duration || 3) * 1000) }
      el.onplaying = () => { everPlayedRef.current = true; pendingGreetingRef.current = null }
      el.src = url
      el.play().catch(() => { done() })   // resolve even if blocked, so the flow continues
    })
  }

  // Fetch TTS for a chunk of text and return a playable blob URL (no playback).
  async function fetchTts(text, activePersona = persona) {
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: stripMarkdown(text), persona: activePersona, sessionId: session.id }),
    })
    if (!res.ok) throw new Error('TTS failed')
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  }

  async function playTtsUrl(url) {
    await playClip(url)
    try { URL.revokeObjectURL(url) } catch {}
  }

  async function playWithSync(text, activePersona = persona) {
    // Read-aloud OFF ⇒ skip the scribe-confirm read-back audio entirely (no
    // /api/speak, no word-sync caption). The caller commits the confirm message text.
    if (!readAloudRef.current) { stopCurrentAudio(); captionRef.current?.clear(); return }
    stopCurrentAudio()
    const cleanText = stripMarkdown(text)
    const words = cleanText.split(' ')
    captionRef.current?.clear()

    // Character-proportional word boundary times (0..1 fraction of total duration)
    function buildBoundaries(wordList) {
      const lengths = wordList.map(w => w.length + 1)
      const total = lengths.reduce((a, b) => a + b, 0) || 1
      let cum = 0
      return lengths.map(len => { const f = cum / total; cum += len; return f })
    }

    function startWordTimer(durationMs) {
      const boundaries = buildBoundaries(words)
      const startTime = Date.now()
      let wordIdx = 0
      const timer = setInterval(() => {
        if (audioTimerRef.current !== timer) { clearInterval(timer); return }
        const elapsed = Date.now() - startTime
        const fraction = elapsed / durationMs
        while (wordIdx < words.length && fraction >= boundaries[wordIdx]) wordIdx++
        captionRef.current?.set(words.slice(0, wordIdx).join(' '))
        if (wordIdx >= words.length) { clearInterval(timer); audioTimerRef.current = null }
      }, 30)
      audioTimerRef.current = timer
    }

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, persona: activePersona, sessionId: session.id }),
      })
      if (!res.ok) throw new Error('TTS failed')

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      // Reuse the unlocked element; the word-sync caption starts once duration is known.
      await playClip(url, (durationMs) => startWordTimer(durationMs))
      if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null }
      captionRef.current?.set(words.join(' '))
      try { URL.revokeObjectURL(url) } catch {}
    } catch {
      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.rate = 0.95
      window.speechSynthesis?.speak(utterance)
      startWordTimer(words.length * 500)
      await new Promise(r => setTimeout(r, words.length * 500 + 200))
    }
  }

  async function deliverTutorMessage(text, history, activePersona) {
    // Commit the greeting straight into the message list (history is always [] here,
    // so this is idempotent: a stray re-run just re-sets the same single message) and
    // never route it through the live caption — that caption is what was getting
    // orphaned next to the committed copy. Audio plays over the shown text.
    captionRef.current?.clear()
    setMessages([...history, { role: 'assistant', content: text, persona: activePersona }])
    // Remember the greeting so the first gesture can re-speak it if autoplay blocked it.
    pendingGreetingRef.current = { text, persona: activePersona }
    // Open the composer before the greeting finishes reading — the read-aloud lags
    // the written text, so the student can start typing (and interrupt the audio by
    // sending) right away instead of waiting out the whole greeting.
    setPhase('listening')
    await replayAudioOnly(text, activePersona)
  }

  async function replayAudioOnly(text, activePersona = persona) {
    // Read-aloud OFF ⇒ never invoke the TTS path (no /api/speak). The coach's text
    // is already committed by the caller; there's simply nothing to play.
    if (!readAloudRef.current) { stopCurrentAudio(); return }
    stopCurrentAudio()
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: stripMarkdown(text), persona: activePersona, sessionId: session.id }),
      })
      if (!res.ok) throw new Error('TTS failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      await playClip(url)
      try { URL.revokeObjectURL(url) } catch {}
    } catch {
      await new Promise(resolve => {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.95
        utterance.onend = resolve
        window.speechSynthesis?.speak(utterance)
      })
    }
  }

  async function replayMessage(content, index) {
    if (replayingIndex === index) { stopCurrentAudio(); setReplayingIndex(null); return }
    tutorRunRef.current++   // supersede any coach read-aloud still playing so it won't resume over this replay
    setReplayingIndex(index)
    await replayAudioOnly(content, persona)
    setReplayingIndex(null)
  }

  // ── Scaffold token parsing ───────────────────────────────────────────────────

  async function parseAndApplyScaffoldTokens(fullText, currentScaffold) {
    let sc = currentScaffold ? JSON.parse(JSON.stringify(currentScaffold)) : null
    let changed = false
    let newScaffoldCreated = false

    const tokenRE = /\[(SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE):([^\]]*)\]/g
    let m
    while ((m = tokenRE.exec(fullText)) !== null) {
      const type = m[1]
      const payload = m[2]

      // A scaffold is built once. Ignore any re-emitted SCAFFOLD once one exists,
      // so a repeated token can't wipe the student's already-locked components.
      if (type === 'SCAFFOLD' && !currentScaffold?.components?.length) {
        const parts = payload.split(':')
        const assignType = parts[0]
        const count = parseInt(parts[1])
        // For custom (non-prose) assignments the coach lists the section labels in a
        // 3rd, pipe-separated segment: [SCAFFOLD:custom:1:Line 1 — 5 syllables|…].
        const customLabels = assignType === 'custom' && parts.length > 2
          ? parts.slice(2).join(':').split('|').map(s => s.trim()).filter(Boolean)
          : null
        if ((!isNaN(count) && count > 0) || customLabels?.length) {
          const components = buildComponentTree(assignType, count || 1, customLabels)
          const totalParas = components.length
          sc = { assignment_type: assignType, total_paragraphs: totalParas, current_paragraph_index: 0, components, thesis: null }
          newScaffoldCreated = true
          changed = true
          await fetch(`/api/scaffold/${session.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignmentType: assignType, totalParagraphs: totalParas, components }),
          })
        }
      }

      else if (type === 'ACTIVE' && sc) {
        const componentId = payload
        const paraIdx = sc.current_paragraph_index ?? 0
        sc = updateComponentItem(sc, paraIdx, componentId, item =>
          item.status === 'confirmed' ? item : { ...item, status: 'working' }
        )
        changed = true
      }

      else if (type === 'NUGGET' && sc) {
        const colonIdx = payload.indexOf(':')
        if (colonIdx !== -1) {
          const componentId = payload.slice(0, colonIdx)
          const nuggetText = payload.slice(colonIdx + 1)
          const paraIdx = sc.current_paragraph_index ?? 0
          // Don't downgrade an already-locked component back to a candidate — a
          // late/stray NUGGET shouldn't undo something the student confirmed.
          sc = updateComponentItem(sc, paraIdx, componentId, item =>
            item.status === 'confirmed' ? item : { ...item, status: 'candidate', nuggetText }
          )
          changed = true
        }
      }

      else if (type === 'DONE' && sc) {
        // DONE may carry the confirmed text inline — [DONE:id:exact words] — so a
        // component can be locked in even when the coach didn't emit a separate
        // NUGGET first (the common case for prose built over a few exchanges).
        // Fall back to any text a prior NUGGET captured.
        const colonIdx = payload.indexOf(':')
        const componentId = colonIdx === -1 ? payload : payload.slice(0, colonIdx)
        const inlineText  = colonIdx === -1 ? '' : payload.slice(colonIdx + 1).trim()
        const paraIdx = sc.current_paragraph_index ?? 0
        sc = updateComponentItem(sc, paraIdx, componentId, item => {
          const text = inlineText || item.nuggetText || item.text || ''
          // Never confirm a component with no content — it'd render a blank "✓" line.
          if (!text) return item
          return { ...item, status: 'confirmed', text }
        })
        changed = true
      }

      else if (type === 'THESIS' && sc) {
        sc = { ...sc, thesis: payload }
        changed = true
      }

      else if (type === 'PARA_DONE' && sc) {
        const colonIdx = payload.indexOf(':')
        if (colonIdx !== -1) {
          const emittedIdx = parseInt(payload.slice(0, colonIdx))
          const summary = payload.slice(colonIdx + 1)
          if (!isNaN(emittedIdx)) {
            // Safety-net (Net C — dropped/wrong PARA_DONE index, essay-funnel sim
            // 2026-07-09, 4/10 sessions). Blindly trusting the emitted index and
            // setting current = idx+1 silently skips or duplicates paragraphs when
            // the coach mis-indexes. Ground truth is which paragraph is actually
            // being worked (current_paragraph_index); the emitted index is a hint.
            const cur = sc.current_paragraph_index ?? 0
            let targetIdx = emittedIdx
            if (emittedIdx > cur) {
              // Coach ran the index ahead of the working paragraph — complete the
              // one actually in progress, never leap over the ones between.
              targetIdx = cur
              console.warn(`[token-safety-net] PARA_DONE index ${emittedIdx} runs ahead of working paragraph ${cur} — completing ${targetIdx} instead (no skip)`)
            } else if (emittedIdx < cur) {
              // Re-emit for an already-passed paragraph — honor it (idempotent), but
              // never move the cursor backward.
              console.warn(`[token-safety-net] PARA_DONE re-emit for earlier paragraph ${emittedIdx} (working ${cur}) — no cursor regress`)
            }
            if (targetIdx >= 0 && targetIdx < sc.components.length) {
              sc = {
                ...sc,
                // Advance past the completed paragraph, but never regress the cursor
                // and never leap more than one past the paragraph being worked.
                current_paragraph_index: Math.min(Math.max(cur, targetIdx + 1), sc.components.length),
                components: sc.components.map((p, i) =>
                  i === targetIdx ? { ...p, status: 'complete', summary: summary || p.summary } : p
                ),
              }
              changed = true
            }
          }
        }
      }
    }

    // Onboarding root-fix: store the locked opening line as a normal component lock
    // (status:'confirmed'), not a lingering 'candidate'. The practice flow captures
    // the line as [NUGGET:c0:words] and ends on [COMPLETE]; on LLM-variant runs the
    // coach sometimes reaches [COMPLETE] without a cleanly parseable [DONE:c0], which
    // would persist the item as 'candidate' with real text — experienced as locked
    // but stored non-confirmed (why the reveal + transcript need lenient fallbacks).
    // On [COMPLETE] in the practice flow, promote any captured-but-unconfirmed item to
    // 'confirmed' with its text, so the hook reaches the DB exactly like a real lock.
    // Scoped to onboarding — general (multi-component) sessions are untouched, so a
    // stray [COMPLETE] can never mass-confirm parts a student hasn't approved.
    if (onboarding && sc && fullText.includes('[COMPLETE]')) {
      sc = {
        ...sc,
        components: sc.components.map(p => ({
          ...p,
          items: (p.items ?? []).map(item =>
            item.status !== 'confirmed' && (item.text || item.nuggetText)
              ? { ...item, status: 'confirmed', text: item.text || item.nuggetText }
              : item
          ),
        })),
      }
      changed = true
    }

    // ── Client token safety-net: reconcile dropped structural tokens ─────────────
    // The essay-funnel sim (2026-07-09) found the coach sometimes finishes a
    // paragraph in prose but drops the [PARA_DONE] (2/10 emitted ZERO) or [THESIS]
    // (3/10) token — in the live app that loses the student's work and blanks the
    // Draft panel. This reconciles from HARD scaffold evidence only: a paragraph is
    // treated as finished solely when every one of its components is already
    // status:'confirmed' (i.e. the student individually approved each), never from
    // fuzzy text/lock-language matching — so it cannot false-fire on a paragraph the
    // student is still building. Scoped to multi-paragraph essays (the sim's failure
    // surface); single-paragraph, onboarding/practice, and custom (haiku/list) flows
    // keep their existing behavior untouched. When the net fires it logs to console
    // (prefix [token-safety-net]) so the fire-rate can be measured against the
    // parallel coach-ai prompt fix.
    if (sc && (sc.components?.length ?? 0) > 1) {
      // Net A — dropped [PARA_DONE]: a paragraph whose every component is confirmed
      // but that was never marked complete (no PARA_DONE fired). Mark it complete so
      // the scaffold advances and the work is banked. Summary stays null — we never
      // fabricate one (it's only used for resume/bridging orientation).
      let advanceTo = sc.current_paragraph_index ?? 0
      const reconciled = sc.components.map((p, i) => {
        const items = p.items ?? []
        const allConfirmed = items.length > 0 && items.every(it => it.status === 'confirmed')
        if (allConfirmed && p.status !== 'complete') {
          console.warn(`[token-safety-net] paragraph ${i} has every component confirmed but no [PARA_DONE] fired — reconciling to complete`)
          if (i + 1 > advanceTo) advanceTo = i + 1
          changed = true
          return { ...p, status: 'complete' }
        }
        return p
      })
      sc = {
        ...sc,
        components: reconciled,
        current_paragraph_index: Math.min(advanceTo, sc.components.length),
      }

      // Net B — dropped [THESIS]: the intro's thesis component is confirmed with real
      // text but sc.thesis was never set (THESIS token dropped). Restore it from the
      // locked component so the persistent thesis line and Rule 11 thesis-tracking
      // have a thesis to reference.
      if (!sc.thesis) {
        for (const p of sc.components) {
          const thesisItem = (p.items ?? []).find(
            it => it.id === 'thesis' && it.status === 'confirmed' && (it.text || it.nuggetText)
          )
          if (thesisItem) {
            sc = { ...sc, thesis: thesisItem.text || thesisItem.nuggetText }
            console.warn('[token-safety-net] thesis component confirmed but no [THESIS] fired — reconciling thesis from locked component')
            changed = true
            break
          }
        }
      }
    }

    // Persist any change — including when the scaffold was created THIS turn. The
    // hook-only practice flow builds the scaffold and locks the opening line in a
    // single coach turn; the create POST above only saved the initial (unconfirmed)
    // tree, so without this PATCH the confirmed component never reaches the DB and the
    // reveal/transcript come up blank.
    if (changed && sc) {
      await fetch(`/api/scaffold/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          components: sc.components,
          thesis: sc.thesis,
          current_paragraph_index: sc.current_paragraph_index,
        }),
      })
    }

    return changed ? sc : currentScaffold
  }

  // ── Tutor call ───────────────────────────────────────────────────────────────

  async function askTutor(history, activePersona = persona, displayHistory = null) {
    const myRun = ++tutorRunRef.current
    setPhase('tutor-thinking')
    captionRef.current?.set('…')

    try {
      const wasResume = resumePendingRef.current
      resumePendingRef.current = false   // the resume signal is first-turn-only
      const res = await fetch(tutorEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          assignment: session.assignment_text,
          messages: history,
          persona: activePersona,
          scaffold,
          resume: wasResume,
        }),
      })

      if (!res.ok) {
        console.error('Tutor API error:', res.status, await res.text())
        if (tutorRunRef.current === myRun) { captionRef.current?.clear(); setPhase('listening') }
        return
      }

      // Stream the coach's words into the caption as they generate, so the
      // student gets immediate feedback instead of a static "…". As soon as the
      // first sentence is complete, start speaking it — the rest is generated and
      // its audio fetched while that first sentence plays, so the voice starts
      // much sooner than waiting for the whole reply + its full TTS.
      stopCurrentAudio()
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      let firstSentence = null
      let firstPlay = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        captionRef.current?.set(liveDisplay(full) || '…')

        // Read-aloud OFF ⇒ never split off / fetch the first-sentence clip. The
        // whole TTS path stays unreached; the text still streams into the caption.
        if (!firstSentence && readAloudRef.current) {
          const clean = liveDisplay(full)
          const m = clean.match(/^\s*(.+?[.!?])(\s|$)/s)
          // Only split off a first sentence if there's clearly more coming after it
          if (m && m[1].trim().length >= 8 && clean.length > m[1].length + 1) {
            firstSentence = m[1].trim()
            // Voiced turn now has audio in flight — mark it pending so a send that
            // lands before the phase flip still settles it as skipped.
            pendingAudioTurnRef.current = true
            firstPlay = (async () => {
              try {
                const url = await fetchTts(firstSentence, activePersona)
                // If the student already interrupted (newer turn) or muted the coach
                // mid-turn, don't grab the shared <audio> element / start a new clip.
                if (tutorRunRef.current !== myRun || !readAloudRef.current) { try { URL.revokeObjectURL(url) } catch {} ; return }
                await playTtsUrl(url)
              } catch {}
            })()
          }
        }
      }

      // Parse scaffold tokens and update scaffold state
      const newScaffold = await parseAndApplyScaffoldTokens(full, scaffold)
      if (newScaffold !== scaffold) setScaffold(newScaffold)

      if (full.includes('[COMPLETE]')) markSessionComplete(newScaffold)

      // Child-safety signal: surface the out-of-band, student-only resource card.
      // Latches on (never auto-hidden mid-session); the token is stripped from the
      // displayed + persisted text so it never appears as literal text or lands in
      // the watcher-readable transcript.
      if (full.includes('[CARE]')) setShowCrisisCard(true)

      // Research/citations: the coach filed a source the student named. Open the
      // confirm card so the student checks/edits the citation before it's saved.
      // Double-gated to research-relevant (essay) forms — even if the coach mis-emits
      // on a creative form, the card never opens. Gate on the JUST-PARSED scaffold so
      // a [SOURCE:] arriving on the same turn as [SCAFFOLD:essay:…] isn't missed.
      if (newScaffold?.assignment_type === 'essay' && full.includes('[SOURCE:')) {
        for (const desc of extractSourceTokens(full)) enqueueSourceCapture(desc)
      }

      const hasDictateSignal = full.includes('[DICTATE]')
      const displayText = full.replace(ALL_TOKEN_RE, '').trim()

      // The coach's words are now fully written. Commit the message and reopen the
      // composer immediately — BEFORE the read-aloud finishes. The audio lags
      // behind the text, so this lets the student type during the read-aloud and,
      // by sending, interrupt only the audio — the coach's full reply is already
      // safely committed and never truncated.
      setMessages([...(displayHistory ?? history), { role: 'assistant', content: displayText, persona: activePersona }])
      captionRef.current?.clear()
      setPhase(hasDictateSignal ? 'dictating' : 'listening')

      // Audio plays out unless a newer turn supersedes this one (the student sent
      // again, interrupting). Each audio step bails if this run is no longer current
      // so a leftover remainder clip can't hijack the shared <audio> element.
      // A voiced turn is marked "pending" so the auto-mute heuristic can settle it as
      // either audio_completed (played to the end) or audio_skipped/interrupted (the
      // student advanced — settled by the send handlers before they supersede).
      if (firstSentence) {
        // (pendingAudioTurnRef already set when the first clip started, above.)
        // Remainder after the first sentence; fetch its audio now (overlaps the
        // first sentence still playing), then play once the first finishes.
        const remainder = displayText.slice(firstSentence.length).trim()
        const remainderUrl = remainder ? fetchTts(remainder, activePersona).catch(() => null) : null
        await firstPlay
        if (tutorRunRef.current !== myRun) return
        if (remainderUrl) {
          const url = await remainderUrl
          // Bail if superseded OR the student muted the coach mid-read.
          if (tutorRunRef.current !== myRun || !readAloudRef.current) { try { URL.revokeObjectURL(url) } catch {} ; return }
          if (url) await playTtsUrl(url)
        }
        if (tutorRunRef.current === myRun) settleAudioTurn('audio_completed')
      } else if (readAloudRef.current) {
        if (tutorRunRef.current !== myRun) return
        pendingAudioTurnRef.current = true
        // Single short reply (no mid-stream sentence boundary) — speak it whole.
        await replayAudioOnly(displayText, activePersona)
        if (tutorRunRef.current === myRun) settleAudioTurn('audio_completed')
      } else {
        // Read-aloud OFF: this coach turn produced no audio. Record audio_absent —
        // it does NOT count as a skip, and voice-off already precludes an offer.
        pendingAudioTurnRef.current = false
        recordAudioOutcome('audio_absent')
      }
    } catch (err) {
      console.error('askTutor failed:', err)
      if (tutorRunRef.current === myRun) { captionRef.current?.clear(); setPhase('listening') }
    }
  }

  // ── Session actions ──────────────────────────────────────────────────────────

  async function toggleAccordion() {
    const opening = !titleExpanded
    setTitleExpanded(opening)
    if (opening && !assignmentSummary && !summaryLoading) {
      setSummaryLoading(true)
      try {
        const res = await fetch(`/api/sessions/${session.id}/summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignmentText: session.assignment_text }),
        })
        const json = await res.json()
        if (json.summary) setAssignmentSummary(json.summary)
      } catch (err) {
        console.error('[summary] Fetch failed:', err)
      }
      setSummaryLoading(false)
    }
  }

  async function saveSubject(value, customLabel) {
    setSavingSubject(true)
    await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: value, subject_custom_label: customLabel }),
    })
    setCurrentSubject(value)
    setSubjectCustomLabel(customLabel ?? '')
    setSavingSubject(false)
    setActivePanel(null)
  }

  async function saveTitle(newTitle) {
    const t = newTitle.trim()
    setEditingTitle(false)
    if (!t || t === sessionTitle) return
    setSessionTitle(t)
    fetch(`/api/sessions/${session.id}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: t }),
    }).catch(() => {})
  }

  async function switchPersona(newPersona) {
    // De-dupe no-op switches. A same-persona "switch" (e.g. tapping the current
    // coach in the picker) must do NOTHING — previously it replayed a fresh canned
    // greeting, so an isla→isla tap spoke the same intro twice (deep-read F4).
    if (newPersona === persona) { setShowPersonaPicker(false); return }

    // Switching coaches mid-read is a barge-in — settle the prior voiced turn.
    settleAudioTurn('audio_interrupted')
    stopCurrentAudio()
    setShowPersonaPicker(false)

    // Display name of the coach we're handing off FROM, captured before we flip.
    const prevPersonaName = PERSONA_META[persona]?.name ?? null
    setPersona(newPersona)

    await fetch(`/api/sessions/${session.id}/persona`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: newPersona }),
    })

    // Assemble the handoff greeting deterministically from live session state —
    // never regenerate it with the model. The model path produced retired names,
    // hallucinated progress on an empty page, and duplicate intros (deep-read F4).
    // State is the branch: empty → claim nothing; in-progress → ground in what's
    // actually locked; done → acknowledge the finish. The greeting always names the
    // current coach and the coach it's taking over from.
    const state = deriveSwitchState(scaffold, paragraphs)
    const greeting = buildSwitchGreeting(newPersona, prevPersonaName, studentName, state)

    // Commit + speak the greeting the same way session-start greetings are handled
    // (deliverTutorMessage), preserving the existing conversation history above it.
    await deliverTutorMessage(greeting, messages, newPersona)
  }

  // ── Research & Citations v1 (form-gated) ─────────────────────────────────────
  // Sources appear only for research-relevant prose (essay). This is the single
  // gate for the shelf, the Works Cited card, AND the coach's [SOURCE:] capture —
  // so a mis-emitted [SOURCE:] on a poem/story never opens a card.
  const sourcesEnabled = scaffold?.assignment_type === 'essay'

  function enqueueSourceCapture(description, manual = false) {
    const url = manual ? null : firstUrlIn(description)
    setCaptureQueue(q => [...q, { key: ++captureKeyRef.current, description, url, manual }])
  }

  function dismissCapture(key) {
    setCaptureQueue(q => q.filter(c => c.key !== key))
  }

  async function saveSource(fields, key) {
    dismissCapture(key)
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, ...fields }),
      })
      const data = await res.json().catch(() => null)
      if (data?.source) setSources(s => [...s, data.source])
    } catch (e) { console.error('[saveSource]', e) }
  }

  async function deleteSource(id) {
    setSources(s => s.filter(row => row.id !== id))   // optimistic
    try { await fetch(`/api/sources?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) }
    catch (e) { console.error('[deleteSource]', e) }
  }

  async function markSessionComplete(finalScaffold) {
    if (sessionComplete) return
    setSessionComplete(true)
    // Send the final scaffold snapshot so the server durably persists the student's
    // work at completion — the produced content of custom / non-prose forms (a
    // haiku's lines, the onboarding hook) lives ONLY in the scaffold, so completion
    // must not depend on an earlier fire-and-forget PATCH having landed. Prefer the
    // freshly-parsed scaffold passed by the caller; fall back to state. (setScaffold
    // is async, so the `scaffold` closure may still be one turn stale here.)
    const snapshot = finalScaffold ?? scaffold
    try {
      const res = await fetch(completeEndpoint ?? `/api/sessions/${session.id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot ? { scaffold: {
          assignment_type: snapshot.assignment_type,
          total_paragraphs: snapshot.total_paragraphs,
          current_paragraph_index: snapshot.current_paragraph_index,
          components: snapshot.components,
          thesis: snapshot.thesis,
        } } : {}),
      })
      // The server assembles any unbuilt paragraph into prose on complete and hands
      // it back — adopt it so the finished paragraph shows above its components.
      const data = await res.json().catch(() => null)
      if (data?.paragraphs?.length) {
        setParagraphs(data.paragraphs.map(p => ({
          scribed_text: p.scribed_text,
          is_thin: p.is_thin ?? false,
          paragraph_index: p.paragraph_index ?? p.position,
          position: p.position,
        })))
      }
    } catch (e) { console.error(e) }
  }

  // Leaving the practice run early — mark onboarding done (so the dashboard won't
  // bounce them back here) and head to the dashboard.
  async function exitPractice() {
    stopCurrentAudio()
    try { await fetch('/api/onboarding/complete', { method: 'POST' }) } catch (e) { console.error(e) }
    router.push('/folder')
  }

  // ── Nugget panel actions ─────────────────────────────────────────────────────

  async function confirmNugget(paraIdx, componentId, nuggetText) {
    const newScaffold = updateComponentItem(scaffold, paraIdx, componentId, item => ({
      ...item, status: 'confirmed', text: nuggetText,
    }))
    setScaffold(newScaffold)
    await fetch(`/api/scaffold/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ components: newScaffold.components }),
    })
    const note = {
      role: 'user',
      content: `[Student locked in their ${componentId} from the panel: "${nuggetText}". Acknowledge in one sentence in your persona's voice, emit [DONE:${componentId}], then move to the next component.]`,
    }
    askTutor([...messages, note], persona, messages)
  }

  async function skipNugget(paraIdx, componentId) {
    const newScaffold = updateComponentItem(scaffold, paraIdx, componentId, item => ({
      ...item, status: 'working', nuggetText: null,
    }))
    setScaffold(newScaffold)
    await fetch(`/api/scaffold/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ components: newScaffold.components }),
    })
    const note = {
      role: 'user',
      content: `[Student wants to keep developing their ${componentId} — they passed on locking in that phrase. Continue coaching this component.]`,
    }
    askTutor([...messages, note], persona, messages)
  }

  // ── Full essay assembly ──────────────────────────────────────────────────────

  async function assembleFullEssay() {
    setIsAssemblingEssay(true)
    try {
      // Send only the sessionId — the server re-reads this session's saved paragraphs
      // and thesis from the DB (owner-scoped) and assembles from those. Sending the
      // draft text would be ignored anyway (the route no longer trusts body prose —
      // fragility audit B2). Paragraphs are persisted before this button appears
      // (assemble/dictation paths save on the way in), so the DB copy is authoritative.
      const res = await fetch('/api/assemble-essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      })
      if (!res.ok) { console.error('[assembleFullEssay] server rejected', res.status); return }
      const { assembled } = await res.json()
      if (assembled) setAssembledEssay(assembled)
    } catch (err) {
      console.error('[assembleFullEssay]', err)
    } finally {
      setIsAssemblingEssay(false)
    }
  }

  // ── Direct paragraph edit ────────────────────────────────────────────────────

  async function saveDirectEdit(paraIdx, newText) {
    const oldPara = paragraphs.find(p => (p.paragraph_index ?? p.position) === paraIdx)
    const oldText = oldPara?.scribed_text ?? ''
    if (newText === oldText) { setEditingParaIdx(null); return }

    // Update local state
    setParagraphs(prev => prev.map(p =>
      (p.paragraph_index ?? p.position) === paraIdx ? { ...p, scribed_text: newText } : p
    ))
    setEditingParaIdx(null)

    // Persist to DB
    fetch('/api/paragraphs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, position: paraIdx, scribedText: newText }),
    }).catch(console.error)

    // Notify tutor — truncate old/new to avoid inflating context
    const clip = (t) => t.length > 200 ? t.slice(0, 200) + '…' : t
    const note = {
      role: 'user',
      content: `[Student made a direct edit to paragraph ${paraIdx + 1}.\nBefore: "${clip(oldText)}"\nAfter: "${clip(newText)}"\nAcknowledge the edit briefly in your persona's voice — note if it strengthens their writing or shifts their voice. Then continue coaching naturally.]`,
    }
    askTutor([...messages, note], persona, messages)
  }

  // ── Direct component edit ────────────────────────────────────────────────────

  async function saveComponentEdit(paraIdx, componentId, newText) {
    const item = scaffold?.components[paraIdx]?.items?.find(i => i.id === componentId)
    const oldText = item?.text || item?.nuggetText || ''
    if (newText === oldText) { setEditingComponent(null); return }

    const newScaffold = updateComponentItem(scaffold, paraIdx, componentId, i => ({
      ...i, text: newText, nuggetText: newText, status: 'confirmed',
    }))
    setScaffold(newScaffold)
    setEditingComponent(null)

    await fetch(`/api/scaffold/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ components: newScaffold.components }),
    })

    const label = COMPONENT_LABELS[componentId] ?? componentId
    const clip = (t) => t.length > 150 ? t.slice(0, 150) + '…' : t
    const note = {
      role: 'user',
      content: `[Student edited their ${label} directly.\nBefore: "${clip(oldText)}"\nAfter: "${clip(newText)}"\nAcknowledge briefly in your persona's voice — note if the change strengthens it or shifts their voice. Then continue coaching.]`,
    }
    askTutor([...messages, note], persona, messages)
  }

  // ── Conversation handler (regular back-and-forth) ────────────────────────────

  async function handleConversation(spokenText) {
    // Sending while the coach is still reading aloud = the "reading ahead" signal.
    // Settle the prior voiced turn as skipped BEFORE we cut its audio.
    settleAudioTurn('audio_skipped')
    stopCurrentAudio()
    const userMessage = { role: 'user', content: spokenText }
    const newHistory = [...messages, userMessage]
    setMessages(newHistory)
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, role: 'user', content: spokenText }),
    }).catch(() => {})

    // Full-essay read-back is UI-assembled, never model-regenerated (deep-read F7).
    // If the student asks to hear/see the WHOLE piece and there IS content, hand back
    // the verbatim locked paragraphs (same source as the transcript page) instead of
    // routing to the coach — the model regeneration is what truncated mid-sentence at
    // the moment of completion. Single-paragraph "read that back" still goes to the
    // coach. If nothing is written yet, fall through to the coach (it can say so).
    if (wantsFullReadback(spokenText)) {
      const body = assembleReadBackText(scaffold, paragraphs)
      if (body.trim()) {
        const readBack = buildReadBackMessage(persona, body)
        await deliverTutorMessage(readBack, newHistory, persona)
        return
      }
    }

    askTutor(newHistory)
  }

  // ── Dictation handler (student speaks their paragraph → scribe) ──────────────

  async function handleDictation(spokenText) {
    // Advancing to dictate while the coach reads aloud is the same "reading ahead"
    // signal — settle the prior voiced turn as skipped before cutting its audio.
    settleAudioTurn('audio_skipped')
    stopCurrentAudio()
    // A fresh dictation attempt clears any prior scribe-failure recovery state.
    setRecoveredDictation(null)
    setScribeNotice(null)
    const userMessage = { role: 'user', content: spokenText }
    const newHistory  = [...messages, userMessage]
    setMessages(newHistory)
    setPhase('scribe-thinking')

    let scribed
    try {
      const [, scribeRes] = await Promise.all([
        fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, role: 'user', content: spokenText }),
        }).catch(() => null),   // persistence is best-effort; a blip must not lose the paragraph
        fetch('/api/scribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spokenText, sessionId: session.id }),
        }),
      ])
      // /api/scribe legitimately returns 429 (rate limit) and 500 (parse error) —
      // treat any non-2xx as a scribe failure and recover rather than crashing.
      if (!scribeRes || !scribeRes.ok) throw new Error(`scribe ${scribeRes?.status ?? 'network'}`)
      scribed = await scribeRes.json()
    } catch (err) {
      console.error('[handleDictation] scribe failed:', err)
      // Never freeze on "scribe-thinking" or lose the spoken text. Drop back to the
      // dictation composer with the raw words restored so the student can retry.
      setMessages(messages)   // roll back the un-scribed user bubble; the text lives in the composer
      setRecoveredDictation(spokenText)
      setScribeNotice("Sorry — I didn't quite catch that. Your words are still here, just tap the arrow to send them again.")
      setPhase('dictating')
      return
    }

    if (scribed.isMeta || !scribed.paragraph) {
      askTutor(newHistory)
      return
    }

    const sectionIndex = scaffold?.current_paragraph_index ?? paragraphs.length
    const confirmMsg = buildConfirmMessage(persona, scribed.paragraph, scribed.isThin, scribed.thinNote)
    const historyWithConfirm = [...newHistory, { role: 'assistant', content: confirmMsg, persona }]
    setPendingScribe({
      paragraph: scribed.paragraph,
      rawText: spokenText,
      isThin: scribed.isThin,
      thinNote: scribed.thinNote,
      historyWithConfirm,
      sectionIndex,
      fromAssembly: false,
    })
    setPhase('preview')
    await playWithSync(confirmMsg, persona)
    setMessages(historyWithConfirm)
    captionRef.current?.clear()
  }

  // ── Assembly handler (smooth confirmed components into prose) ────────────────

  async function assembleCurrentParagraph(paraIdx, para) {
    setPhase('scribe-thinking')
    const components = (para.items ?? [])
      .filter(c => c.status === 'confirmed' && (c.text || c.nuggetText))
      .map(c => ({ id: c.id, label: c.label ?? COMPONENT_LABELS[c.id] ?? c.id, text: c.text || c.nuggetText }))

    if (components.length === 0) { setPhase('listening'); return }

    try {
      const res = await fetch('/api/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          paragraphIndex: paraIdx,
          paragraphType: para.type,
          components,
        }),
      })
      const { assembled } = await res.json()

      const confirmMsg = buildConfirmMessage(persona, assembled, false, null)
      const historyWithConfirm = [...messages, { role: 'assistant', content: confirmMsg, persona }]
      setPendingScribe({
        paragraph: assembled,
        rawText: components.map(c => `${c.label}: ${c.text}`).join('\n'),
        isThin: false,
        thinNote: null,
        historyWithConfirm,
        sectionIndex: paraIdx,
        fromAssembly: true,
      })
      setPhase('preview')
      await playWithSync(confirmMsg, persona)
      setMessages(historyWithConfirm)
      captionRef.current?.clear()
    } catch (err) {
      console.error('[assemble]', err)
      setPhase('listening')
    }
  }

  // ── Save paragraph (after student confirms the scribed/assembled preview) ────

  async function saveParagraph(text, rawText, isThin) {
    const sectionIndex = pendingScribe?.sectionIndex ?? (scaffold?.current_paragraph_index ?? paragraphs.length)
    const position = sectionIndex

    if (!pendingScribe?.fromAssembly) {
      // Dictation path — assembly path already saved in /api/assemble
      await fetch('/api/paragraphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, scribedText: text, rawSpokenText: rawText, position, isThin }),
      })
    }

    setParagraphs(prev => {
      const updated = [...prev]
      if (sectionIndex < updated.length) {
        updated[sectionIndex] = { scribed_text: text, is_thin: isThin, paragraph_index: sectionIndex }
      } else {
        updated.push({ scribed_text: text, is_thin: isThin, paragraph_index: sectionIndex })
      }
      return updated
    })

    // If scaffold-tracked, mark the paragraph complete
    const totalParas = scaffold?.total_paragraphs ?? 1
    if (scaffold) {
      const newScaffold = {
        ...scaffold,
        current_paragraph_index: Math.min(sectionIndex + 1, scaffold.components.length),
        components: scaffold.components.map((p, i) =>
          i === sectionIndex ? { ...p, status: 'complete' } : p
        ),
      }
      setScaffold(newScaffold)
      fetch(`/api/scaffold/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          components: newScaffold.components,
          current_paragraph_index: newScaffold.current_paragraph_index,
        }),
      })
    }

    // Section completion toast (auto-dismisses after 4 s)
    const paraType = scaffold?.components[sectionIndex]?.type
    setSectionJustCompleted({
      title: paraTypeLabel(paraType) || `Paragraph ${sectionIndex + 1}`,
      number: sectionIndex + 1,
      total: totalParas,
    })
    setActiveTab('essay') // show essay on mobile when a para completes
    setTimeout(() => setSectionJustCompleted(null), 4000)

    // Build coaching context for Claude
    const baseHistory = pendingScribe?.historyWithConfirm ?? messages
    const isLastPara = sectionIndex + 1 >= totalParas
    const coachingNote = isLastPara
      ? ` [Coaching note: The essay is complete. Celebrate warmly but briefly in your persona's voice, then invite them to review their full essay below.]`
      : ` [Coaching note: Paragraph ${sectionIndex + 1} (${paraTypeLabel(paraType)}) is done and approved. In one brief sentence in your persona's voice, acknowledge this naturally. Then start coaching paragraph ${sectionIndex + 2}.]`

    const displayUserMsg = { role: 'user', content: 'Yes, add it to my essay.' }
    const apiUserMsg     = { role: 'user', content: `Yes, add it to my essay.${coachingNote}` }

    setPendingScribe(null)
    askTutor([...baseHistory, apiUserMsg], persona, [...baseHistory, displayUserMsg])
  }

  function discardParagraph() {
    const historyWithRedo = [
      ...(pendingScribe?.historyWithConfirm ?? messages),
      { role: 'user', content: "That doesn't sound quite right. Can you help me fix it?" },
    ]
    setPendingScribe(null)
    askTutor(historyWithRedo)
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const fullEssay    = paragraphs.map(p => p.scribed_text).filter(Boolean).join('\n\n')
  // Copy essay appends the deterministic Works Cited (never woven into the model
  // assembly — citations stay deterministic, never hallucinated). Gated to essays.
  const worksCited   = sourcesEnabled && sources.length
    ? (() => { const b = formatBibliography(sources.map(toCitationSource), citationStyle); return `${b.heading}\n${b.plain}` })()
    : ''
  const fullEssayWithSources = worksCited ? `${fullEssay}\n\n${worksCited}` : fullEssay
  const reqActual    = computeActual(paragraphs)
  const currentMeta  = PERSONA_META[persona]

  // ── "You can stop here" affordance ──────────────────────────────────────────
  // The mirror of resume: make it safe and INVITING to stop, so a fatiguing student
  // banks and leaves instead of abandoning. Show a quiet permission line when there's
  // real banked progress but the essay isn't done (0 < done < total) AND we're at a
  // clean paragraph boundary — i.e. the last event was a paragraph completion, not
  // mid-paragraph. "Mid-paragraph" = the current section has any started item; at a
  // boundary the freshly-advanced cursor points at an untouched section. Reads as
  // permission, not a nag. Keeps the promise consistent with the coach's stop-offer.
  const stopAffordance = (() => {
    if (sessionComplete) return null
    const comps = scaffold?.components ?? []
    const total = scaffold?.total_paragraphs || comps.length || 0
    if (total <= 1) return null
    const done = comps.filter(p => p.status === 'complete').length
    if (!(done > 0 && done < total)) return null
    const cursor = scaffold?.current_paragraph_index ?? done
    const current = comps[cursor]
    const midParagraph = (current?.items ?? []).some(it => it.status === 'working' || it.status === 'candidate' || it.status === 'confirmed')
    if (midParagraph) return null
    return { done }
  })()
  // Student's most recent reply — prefilled into the manual lock-in fallback.
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const assignmentKeyterms = []

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ backgroundColor: 'var(--bg-page)' }}>

      {impersonation && <ImpersonationBanner name={impersonation.name} role={impersonation.role} />}

      <Navbar user={user} profile={profile} />

      <div className="flex flex-1 overflow-hidden min-h-0">

      {/* Sidebar removed — the assignments list lives on the dashboard; you
          return there via the "My assignments" back-link in the bar above. */}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Practice banner (onboarding only) ── */}
        {onboarding && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 text-xs"
            style={{ backgroundColor: 'var(--surface-spark)', borderBottom: '1px solid var(--border-accent)', color: 'var(--accent)' }}>
            <span className="font-bold uppercase tracking-widest inline-flex items-center gap-1.5"><Icon name="pencil" size={12} /> Practice warm-up</span>
            {/* FTUE step 4 of 5 — your first opening line (5 is the reveal) */}
            <span className="font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>Step 4 of 5</span>
            <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>Just your opening line — to get the feel of it. Nothing here is graded.</span>
            <button onClick={exitPractice}
              className="ml-auto font-semibold hover:underline" style={{ color: 'var(--text-muted)' }}>
              Exit practice
            </button>
          </div>
        )}

        {/* ── Writing Gym banner (gym sessions only): skill focus + beat stepper ── */}
        {gym && (() => {
          const beats = ['Intro', 'Warm-up', 'Write', 'Review', 'Lock it in']
          const anyConfirmed = scaffold?.components?.some(p => (p.items ?? []).some(c => c.status === 'confirmed'))
          const hasScaffold  = scaffold?.components?.length > 0
          const activeBeat = sessionComplete ? 4 : anyConfirmed ? 3 : hasScaffold ? 2 : 0
          return (
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 text-xs flex-wrap"
              style={{ backgroundColor: 'var(--surface-spark)', borderBottom: '1px solid var(--border-accent)' }}>
              <span className="font-bold uppercase tracking-widest inline-flex items-center gap-1.5 shrink-0" style={{ color: 'var(--accent-text)' }}>
                <Icon name="pencil" size={12} /> Skill Studio
              </span>
              <span className="font-semibold shrink-0" style={{ color: 'var(--text-strong)' }}>{gym.skillLabel}</span>
              {/* Beat stepper — progress, never minutes (design: no clock in untimed sessions) */}
              <span className="hidden sm:flex items-center gap-1.5" aria-hidden="true">
                {beats.map((b, i) => (
                  <span key={b} className="inline-flex items-center gap-1.5">
                    <span style={{ color: i <= activeBeat ? 'var(--accent-text)' : 'var(--text-subtle)', fontWeight: i === activeBeat ? 'var(--fw-bold)' : 'var(--fw-medium)' }}>{b}</span>
                    {i < beats.length - 1 && <span style={{ color: 'var(--text-subtle)' }}>›</span>}
                  </span>
                ))}
              </span>
              <a href={gym.backHref ?? '/skill-studio'} className="ml-auto font-semibold hover:underline shrink-0" style={{ color: 'var(--text-muted)' }}>
                Leave
              </a>
            </div>
          )
        })()}

        {/* ── Assignment bar ── */}
        <div className="shrink-0" ref={barPanelRef} style={{ backgroundColor: 'var(--surface-card)', borderBottom: '1px solid var(--border-default)' }}>

          {/* Main row */}
          <div className="flex items-center gap-0 px-3 py-2.5" style={{ minHeight: 52 }}>

            {/* Back to the assignments list — replaces the old in-workspace sidebar.
                Role-aware: students land on /folder, parents/teachers on their home.
                Gym sessions use the "Leave" link in the gym banner instead. */}
            {!onboarding && !gym && (
              <a href={profile?.role === 'parent' ? '/parent' : profile?.role === 'teacher' ? '/teacher' : '/folder'}
                className="-ml-1 mr-1 flex items-center gap-1.5 h-9 px-2 rounded-lg shrink-0 text-xs font-medium transition"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                title="Folder">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                <span className="hidden sm:inline">Folder</span>
              </a>
            )}

            {/* LEFT: Coach + 3-dot */}
            <div className="flex items-center gap-2 shrink-0">
              <PersonaAvatar personaId={persona} size={26} />
              <span className="hidden sm:inline text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
                {currentMeta.name}
              </span>

              {/* 3-dot coach menu — the writer (whoever owns this session) can switch
                  coaches; hidden during the fixed-Owen practice session */}
              {!onboarding && (
                <div className="relative">
                  <button
                    onClick={() => setShowPersonaPicker(v => !v)}
                    className="w-6 h-6 flex items-center justify-center rounded-md transition"
                    style={{ color: showPersonaPicker ? 'var(--accent)' : 'var(--text-subtle)' }}
                    onMouseEnter={e => { if (!showPersonaPicker) e.currentTarget.style.color = 'var(--text-muted)' }}
                    onMouseLeave={e => { if (!showPersonaPicker) e.currentTarget.style.color = 'var(--text-subtle)' }}
                    title="Switch coach"
                  >
                    <svg viewBox="0 0 4 18" width="4" height="16" fill="currentColor">
                      <circle cx="2" cy="2"  r="1.6" />
                      <circle cx="2" cy="9"  r="1.6" />
                      <circle cx="2" cy="16" r="1.6" />
                    </svg>
                  </button>
                  {showPersonaPicker && (
                    <div className="absolute left-0 top-8 z-30 rounded-xl overflow-hidden w-52"
                      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-md)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest px-4 pt-3 pb-1" style={{ color: 'var(--text-subtle)' }}>Switch coach</p>
                      {Object.entries(PERSONA_META).map(([id, meta]) => (
                        <button key={id} onClick={() => { switchPersona(id); setShowPersonaPicker(false) }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition"
                          style={{ backgroundColor: id === persona ? 'var(--surface-spark)' : 'transparent' }}
                          onMouseEnter={e => { if (id !== persona) e.currentTarget.style.backgroundColor = 'var(--surface-muted)' }}
                          onMouseLeave={e => { if (id !== persona) e.currentTarget.style.backgroundColor = 'transparent' }}>
                          <PersonaAvatar personaId={id} size={26} />
                          <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-strong)' }}>{meta.name}</span>
                          {id === persona && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                              <path d="M20 6L9 17l-5-5"/>
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="hidden sm:block mx-3 shrink-0 self-stretch" style={{ width: 1, backgroundColor: 'var(--border-default)' }} />

            {/* MIDDLE: Assignment title */}
            <button
              onClick={toggleAccordion}
              className="flex-1 flex items-center gap-1.5 min-w-0 text-left transition hover:opacity-70"
            >
              <span className="text-sm truncate" style={{ color: 'var(--text-body)' }}>
                {sessionTitle || session.assignment_text.slice(0, 120) + (session.assignment_text.length > 120 ? '…' : '')}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="shrink-0"
                style={{ color: 'var(--text-subtle)', transition: 'transform 150ms', transform: titleExpanded ? 'rotate(180deg)' : 'none' }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>

            {/* Divider */}
            <div className="hidden sm:block mx-3 shrink-0 self-stretch" style={{ width: 1, backgroundColor: 'var(--border-default)' }} />

            {/* RIGHT: Subject + Teacher chips (the coach-voice toggle now lives next
                to the mic in the composer, not here). */}
            <div className="flex items-center gap-1.5 shrink-0 ml-2 sm:ml-0">

              {/* Subject chip */}
              <button
                onClick={() => setActivePanel(p => p === 'subject' ? null : 'subject')}
                className="flex items-center gap-1.5 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-medium transition"
                style={{
                  backgroundColor: activePanel === 'subject' ? 'var(--surface-spark)' : 'var(--surface-muted)',
                  color: currentSubject !== 'unspecified' ? 'var(--text-strong)' : 'var(--text-muted)',
                  border: `1px solid ${activePanel === 'subject' ? 'var(--border-accent)' : 'var(--border-default)'}`,
                }}
                onMouseEnter={e => { if (activePanel !== 'subject') e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                onMouseLeave={e => { if (activePanel !== 'subject') e.currentTarget.style.borderColor = 'var(--border-default)' }}
              >
                <SubjectIcon
                  value={currentSubject}
                  size={13}
                  style={{ color: currentSubject !== 'unspecified' ? 'var(--accent)' : 'var(--text-subtle)', flexShrink: 0 }}
                />
                <span className="hidden sm:inline max-w-[100px] truncate">
                  {currentSubject === 'unspecified'
                    ? 'Subject'
                    : currentSubject === 'other'
                      ? (subjectCustomLabel || 'Other')
                      : getSubject(currentSubject).label}
                </span>
              </button>

              {/* Teacher chip — students only */}
              {(profile?.role === 'student' || !profile?.role) && (
                <button
                  onClick={() => setActivePanel(p => p === 'teacher' ? null : 'teacher')}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition"
                  style={{
                    backgroundColor: activePanel === 'teacher' ? 'var(--surface-spark)' : 'var(--surface-muted)',
                    color: teachers.length > 0 ? 'var(--text-strong)' : 'var(--text-muted)',
                    border: `1px solid ${activePanel === 'teacher' ? 'var(--border-accent)' : 'var(--border-default)'}`,
                  }}
                  onMouseEnter={e => { if (activePanel !== 'teacher') e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                  onMouseLeave={e => { if (activePanel !== 'teacher') e.currentTarget.style.borderColor = 'var(--border-default)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: teachers.length > 0 ? 'var(--accent)' : 'var(--text-subtle)' }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span className="hidden sm:inline max-w-[100px] truncate">
                    {teachers.length === 0
                      ? '+ Teacher'
                      : teachers.length === 1
                        ? (teachers[0].name?.split(' ')[0] ?? 'Teacher')
                        : `${teachers.length} teachers`}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Assignment detail panel */}
          {titleExpanded && (
            <div className="px-5 py-3" style={{ backgroundColor: 'var(--surface-spark)', borderTop: '1px solid var(--border-accent)' }}>
              {summaryLoading && <p className="text-xs italic" style={{ color: 'var(--text-subtle)' }}>Reading assignment…</p>}
              {!summaryLoading && assignmentSummary && (
                <ul className="space-y-1.5">
                  {assignmentSummary.map((bullet, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-body)' }}>
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5" style={{ backgroundColor: 'var(--accent)' }} />
                      <span><span className="font-bold">{bullet.label}:</span> {bullet.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!summaryLoading && !assignmentSummary && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-body)' }}>{session.assignment_text}</p>
              )}
            </div>
          )}

          {/* Subject picker panel */}
          {activePanel === 'subject' && (
            <div className="border-t" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-page)' }}>
              <div className="px-5 py-4 space-y-3 max-w-sm">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Subject / class</p>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-xs)' }}>
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    <button
                      type="button"
                      onClick={() => saveSubject('unspecified', null)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition"
                      style={{ color: currentSubject === 'unspecified' ? 'var(--text-strong)' : 'var(--text-subtle)', fontWeight: currentSubject === 'unspecified' ? 600 : 400 }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                      Not specified
                      {currentSubject === 'unspecified' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', marginLeft: 'auto' }}><path d="M20 6L9 17l-5-5"/></svg>}
                    </button>
                    <div style={{ height: 1, backgroundColor: 'var(--border-default)', margin: '0 12px' }} />
                    {SUBJECTS.map(s => {
                      const isSelected = currentSubject === s.value
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => s.value !== 'other' ? saveSubject(s.value, null) : setCurrentSubject('other')}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition"
                          style={{ backgroundColor: isSelected ? 'var(--surface-muted)' : 'transparent', color: isSelected ? 'var(--text-strong)' : 'var(--text-body)', fontWeight: isSelected ? 600 : 400 }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--surface-muted)' }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <SubjectIcon value={s.value} size={14} style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                          <span className="flex-1">{s.label}</span>
                          {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}><path d="M20 6L9 17l-5-5"/></svg>}
                        </button>
                      )
                    })}
                  </div>
                  {currentSubject === 'other' && (
                    <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                      <input
                        autoFocus
                        type="text"
                        placeholder="What class is this for?"
                        value={subjectCustomLabel}
                        onChange={e => setSubjectCustomLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveSubject('other', subjectCustomLabel) }}
                        className="w-full text-sm rounded-xl px-3 py-2 focus:outline-none"
                        style={{ border: '1px solid var(--border-strong)', backgroundColor: 'var(--bg-page)', color: 'var(--text-strong)' }}
                      />
                      <button
                        onClick={() => saveSubject('other', subjectCustomLabel)}
                        disabled={savingSubject || !subjectCustomLabel.trim()}
                        className="w-full mt-2 text-xs font-semibold rounded-lg py-1.5 text-white transition disabled:opacity-40"
                        style={{ backgroundColor: 'var(--accent)' }}
                      >
                        {savingSubject ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Teacher panel */}
          {activePanel === 'teacher' && (
            <div className="border-t" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-page)' }}>
              <div className="px-5 py-4 space-y-3 max-w-sm">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Teacher</p>
                {teachers.length > 0 && (
                  <div className="space-y-2">
                    {teachers.map(t => (
                      <div key={t.id} className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                        style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary)' }}>
                          {(t.name?.[0] ?? 'T').toUpperCase()}
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>{t.name ?? 'Teacher'}</span>
                        <span className="ml-auto text-xs rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
                          Added
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <InviteTeacherForm assignmentId={session.id} compact />
              </div>
            </div>
          )}
        </div>

        {/* ── Mobile tab bar ── */}
        <div className="md:hidden flex shrink-0" style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)' }}>
          {[['chat', 'Coach'], ['essay', 'Draft']].map(([tab, label]) => {
            // Nudge toward the Draft tab when there's writing in it you're not looking at.
            const showDot = tab === 'essay' && activeTab !== 'essay' && (
              (scaffold?.components ?? []).some(p => (p.items ?? []).some(i => i.status === 'confirmed')) ||
              paragraphs.length > 0
            )
            return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="flex-1 py-2.5 text-xs font-semibold transition inline-flex items-center justify-center gap-1.5"
              style={{
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
              {label}
              {showDot && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />}
            </button>
            )
          })}
        </div>

        {/* ── Coach + Draft (side by side on desktop, tabbed on mobile) ── */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

        {/* ── Tutor chat panel ── */}
        <div className={`flex-1 flex-col min-h-0 ${activeTab === 'chat' ? 'flex' : 'hidden md:flex'}`}
          style={{ backgroundColor: 'var(--surface-card)', borderBottom: '1px solid var(--border-default)' }}>
          {/* Ambient, persistent "linked adults can read this" note (BUILD 3) —
              passive, never a modal. Hidden during the throwaway practice tour. */}
          {!onboarding && watcherCount > 0 && (
            <div className="shrink-0 px-6 pt-3">
              <WatcherVisibilityNote watcherCount={watcherCount} />
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Out-of-band, student-only crisis card (BUILD 1). Sticky so it stays
                reachable while messages scroll under it; dismissible; non-blocking. */}
            {showCrisisCard && (
              <div className="sticky top-0 z-10 -mt-1 pb-1">
                <CrisisResourceCard onDismiss={() => setShowCrisisCard(false)} country={country} />
              </div>
            )}
            {messages.map((m, i) => (
              m.role === 'system' ? (
                <div key={i} className="flex justify-center">
                  <span className="text-[10px] rounded-full px-3 py-1" style={{ color: 'var(--text-subtle)', backgroundColor: 'var(--surface-muted)' }}>
                    {m.content.replace(/^\[|\]$/g, '')}
                  </span>
                </div>
              ) : (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && (
                    <PersonaAvatar personaId={m.persona ?? persona} size={28} className="mr-1 mt-0.5 shrink-0" />
                  )}
                  <div className="flex flex-col items-start gap-1">
                    {m.role === 'assistant' && m.persona && m.persona !== persona && (
                      <span className="text-[10px] font-semibold ml-1" style={{ color: getPersona(m.persona).color }}>
                        {getPersona(m.persona).name}
                      </span>
                    )}
                    <div className="rounded-2xl px-4 py-3 max-w-lg text-sm leading-relaxed"
                      style={m.role === 'user'
                        ? { backgroundColor: 'var(--primary)', color: 'var(--text-on-dark)', borderBottomRightRadius: '4px' }
                        : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-body)', borderBottomLeftRadius: '4px' }
                      }>
                      {renderMarkdown(m.content)}
                    </div>
                    {/* Replay reads a past message aloud — hidden when the coach voice
                        is muted (it would produce no sound and no /api/speak call). */}
                    {m.role === 'assistant' && readAloud && (
                      <button
                        onClick={() => replayMessage(m.content, i)}
                        title={replayingIndex === i ? 'Stop' : 'Replay'}
                        className="ml-1 flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 transition-all"
                        style={{
                          color: replayingIndex === i ? 'var(--accent)' : 'var(--text-subtle)',
                          backgroundColor: replayingIndex === i ? 'var(--surface-spark)' : 'transparent',
                        }}
                      >
                        {replayingIndex === i ? (
                          <><span className="animate-pulse">■</span><span>stop</span></>
                        ) : (
                          <>
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                            <span>replay</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            ))}

            <LiveCaption ref={captionRef} persona={persona} bottomRef={chatBottomRef} />

            {phase === 'scribe-thinking' && (
              <div className="flex justify-start">
                <PersonaAvatar personaId={persona} size={28} className="mr-2 mt-1 shrink-0" />
                <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--surface-muted)' }}>
                  <span className="animate-pulse" style={{ color: 'var(--accent)' }}>●</span>
                  <span className="animate-pulse" style={{ color: 'var(--accent)', animationDelay: '0.2s' }}>●</span>
                  <span className="animate-pulse" style={{ color: 'var(--accent)', animationDelay: '0.4s' }}>●</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Auto-mute offer — fires at most once per session, only on a genuine
              "reading ahead" pattern (deduceVoiceSuggestion), never during
              onboarding/skill-studio, and never again once dismissed. Sits above the composer. */}
          {showVoiceOffer && (
            <div className="mx-4 mb-2 rounded-2xl px-4 py-3 flex flex-col gap-2.5"
              style={{ backgroundColor: 'var(--surface-spark)', border: '1px solid var(--border-accent)' }}>
              <div className="flex items-start gap-2.5">
                <Icon name="speaker-off" size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <p className="text-sm leading-snug" style={{ color: 'var(--text-body)' }}>
                  Noticed you&rsquo;re reading ahead — want me to stop reading answers aloud? You can turn it back on anytime.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={declineVoiceMute}
                  className="text-sm font-semibold rounded-xl px-3 py-2 transition"
                  style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={acceptVoiceMute}
                  className="text-sm text-white font-semibold rounded-xl px-3 py-2 transition"
                  style={{ backgroundColor: 'var(--accent)' }}>
                  Turn off voice
                </button>
              </div>
            </div>
          )}

          {/* Input area — changes based on phase. The listening composer also stays
              mounted while the coach is thinking/reading ('tutor-thinking'/'waiting')
              so the student can type the whole time; coachBusy holds Send until the
              coach's text is committed, after which a send interrupts the read-aloud.
              Keeping the same instance mounted across phases preserves typed text. */}
          {(phase === 'listening' || phase === 'tutor-thinking' || phase === 'waiting') && (
            <ReplyComposer mode="listening" assignmentKeyterms={assignmentKeyterms} onSubmit={handleConversation}
              onSpeechStart={() => { tutorRunRef.current++; stopCurrentAudio() }}
              coachBusy={phase !== 'listening'} readAloud={readAloud} onToggleReadAloud={toggleReadAloud} savingVoicePref={savingVoicePref} />
          )}

          {phase === 'dictating' && (
            <ReplyComposer
              mode="dictating"
              assignmentKeyterms={assignmentKeyterms}
              onSubmit={handleDictation}
              recoveredText={recoveredDictation}
              noticeLine={scribeNotice}
              readAloud={readAloud}
              onToggleReadAloud={toggleReadAloud}
              savingVoicePref={savingVoicePref}
            />
          )}

          {phase === 'preview' && pendingScribe && (
            <div className="px-5 py-4 flex flex-col gap-2" style={{ backgroundColor: 'var(--bg-page)', borderTop: '1px solid var(--border-default)' }}>
              <div className="flex gap-3">
                <button
                  onClick={() => saveParagraph(pendingScribe.paragraph, pendingScribe.rawText, pendingScribe.isThin)}
                  className="flex-1 text-white text-sm font-semibold rounded-xl py-3 transition active:scale-95"
                  style={{ backgroundColor: 'var(--status-success)' }}>
                  ✓ Yes, add it to my essay
                </button>
                <button onClick={discardParagraph}
                  className="flex-1 text-sm font-semibold rounded-xl py-3 border-2 transition active:scale-95"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)', backgroundColor: 'var(--surface-card)' }}>
                  ✗ Not quite right
                </button>
              </div>
              <button
                onClick={() => { setPendingScribe(null); setPhase('listening') }}
                className="text-xs font-medium hover:underline self-center"
                style={{ color: 'var(--text-muted)' }}>
                ← Keep talking to your coach
              </button>
            </div>
          )}

        </div>

        {/* ── Essay panel ── */}
        <div className={`flex-1 flex-col min-h-0 border-t-2 md:border-t-0 md:border-l-2 ${activeTab === 'essay' ? 'flex' : 'hidden md:flex'}`}
          style={{ backgroundColor: 'var(--bg-page)', borderColor: 'var(--border-accent)' }}>
          <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ backgroundColor: 'var(--surface-card)', borderBottom: '1px solid var(--border-default)' }}>
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Your Draft</p>
              {/* Neutral progress against the assignment's stated targets (words /
                  paragraphs) — just the count, no judgment. Falls back to the scaffold
                  paragraph count when the assignment states no numeric requirement. */}
              {session.requirements?.targets?.length > 0 ? (
                <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                  {session.requirements.targets.map(t => chipState(t, reqActual)?.full).filter(Boolean).join(' · ')}
                </span>
              ) : scaffold && scaffold.total_paragraphs > 1 && (
                <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                  {scaffold.components.filter(p => p.status === 'complete').length} / {scaffold.total_paragraphs} paragraphs
                </span>
              )}
            </div>
            {paragraphs.length > 0 && (
              <button onClick={() => navigator.clipboard.writeText(fullEssayWithSources)}
                className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                Copy essay
              </button>
            )}
          </div>

          {/* Research & Citations v1: the sources shelf. Form-gated to essays; a mis-
              emitted [SOURCE:] on a non-essay never reaches here (sourcesEnabled). */}
          {sourcesEnabled && (
            <div className="mx-4 mt-3 shrink-0">
              <SourcesShelf
                sources={sources}
                captures={captureQueue}
                style={citationStyle}
                onSave={saveSource}
                onDismiss={dismissCapture}
                onAdd={() => enqueueSourceCapture('', true)}
                onDelete={deleteSource}
              />
            </div>
          )}

          {/* "You can stop here" — quiet permission to bank progress and return.
              Shows only at a clean paragraph boundary (0 < done < total, not
              mid-paragraph). Muted, not orange — this is reassurance, not an action.
              Keeps the promise consistent with the coach's "it'll all be here" offer. */}
          {stopAffordance && (
            <div className="mx-4 mt-3 shrink-0 rounded-xl px-4 py-2.5 flex items-start gap-2"
              style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
              <Icon name="check" size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--text-subtle)' }} />
              <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                You've got {stopAffordance.done} strong {stopAffordance.done === 1 ? 'paragraph' : 'paragraphs'} saved — you can stop here and pick up anytime.
              </p>
            </div>
          )}

          {/* Celebration toast */}
          {sectionJustCompleted && !sessionComplete && (
            <div className="mx-4 mt-4 shrink-0 rounded-2xl px-5 py-3 flex items-center gap-3"
              style={{ backgroundColor: 'var(--accent)', color: '#fff', animation: 'fadeSlideIn 0.25s ease' }}>
              <Icon name="sparkles" size={20} className="shrink-0" style={{ color: '#fff' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Paragraph {sectionJustCompleted.number} of {sectionJustCompleted.total} done!</p>
                <p className="text-xs opacity-90 mt-0.5 truncate">{sectionJustCompleted.title}</p>
              </div>
              <button onClick={() => setSectionJustCompleted(null)}
                style={{ color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '4px' }}>
                ✕
              </button>
            </div>
          )}

          {/* ── Scaffold / essay body ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">

            {/* Thesis callout (when confirmed) */}
            {scaffold?.thesis && (
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--surface-spark)', border: '1.5px solid var(--border-accent)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>Thesis</p>
                <p className="text-sm leading-relaxed italic" style={{ color: 'var(--text-body)' }}>"{scaffold.thesis}"</p>
              </div>
            )}

            {/* No scaffold yet */}
            {!scaffold?.components?.length && (
              <p className="text-sm italic text-center pt-10" style={{ color: 'var(--text-subtle)' }}>
                Your essay will build here as you write it…
              </p>
            )}

            {/* Scaffold paragraph cards */}
            {scaffold?.components?.map((para, paraIdx) => {
              const isCurrentPara = paraIdx === (scaffold.current_paragraph_index ?? 0)
              const isComplete    = para.status === 'complete'
              const isLocked      = para.status === 'locked'
              const assembledPara = paragraphs.find(p => (p.paragraph_index ?? p.position) === paraIdx)
              const isPending     = isCurrentPara && phase === 'preview' && pendingScribe?.sectionIndex === paraIdx
              const allConfirmed  = (para.items ?? []).length > 0 && (para.items ?? []).every(c => c.status === 'confirmed') && !assembledPara && !isPending
              // Completed sections stay EXPANDED by default — the finished work must
              // not disappear the moment it locks in (only the green flip should signal
              // "done"). Still collapsible via the header toggle for a long essay.
              const isExpanded    = isComplete ? (expandedParas[paraIdx] !== false) : true
              const heading       = sectionHeading(para, paraIdx, scaffold.total_paragraphs)

              return (
                <div key={paraIdx} className="rounded-xl overflow-hidden transition-all"
                  style={{
                    border: isComplete
                      ? '1.5px solid var(--status-success)'
                      : isPending
                        ? '1.5px dashed var(--accent)'
                        : isCurrentPara
                          ? '1.5px solid var(--border-accent)'
                          : '1.5px solid var(--border-default)',
                    backgroundColor: isComplete
                      ? 'var(--status-success-bg)'
                      : isPending || isCurrentPara
                        ? 'var(--surface-spark)'
                        : 'var(--surface-card)',
                    opacity: isLocked ? 0.65 : 1,
                  }}>

                  {/* Paragraph header — clickable to collapse/expand when complete */}
                  <div
                    className={`px-4 pt-3 pb-2 flex items-center justify-between gap-2${isComplete ? ' cursor-pointer select-none' : ''}`}
                    onClick={isComplete ? () => setExpandedParas(prev => ({ ...prev, [paraIdx]: !isExpanded })) : undefined}
                  >
                    {/* Section header. No leading dot on the active/locked states — a
                        bullet made "WRITING NOW" read as a list item, not a title
                        (Robert). Colour + label carry the state; complete keeps its ✓. */}
                    <div className="flex items-center gap-2">
                      {isComplete ? (
                        <>
                          <span className="text-sm" style={{ color: 'var(--status-success)' }}>✓</span>
                          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--status-success)' }}>
                            {heading || 'Done'}
                          </span>
                        </>
                      ) : isPending ? (
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                          {heading ? `${heading} — confirming…` : 'Confirming…'}
                        </span>
                      ) : isCurrentPara ? (
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                          {heading ? `${heading} — writing now` : 'Writing now'}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>
                          {heading || 'Locked'}
                        </span>
                      )}
                    </div>
                    {/* Collapse chevron for completed paragraphs */}
                    {isComplete && (
                      <span className="text-[10px]" style={{ color: 'var(--status-success)', opacity: 0.7 }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    )}
                  </div>

                  {/* Card body — hidden when collapsed */}
                  {isExpanded && (
                    <>
                      {/* Pending preview */}
                      {isPending && !assembledPara && (
                        <div className="px-4 pb-3">
                          <p className="text-sm leading-relaxed opacity-50 italic" style={{ color: 'var(--text-body)' }}>{pendingScribe.paragraph}</p>
                        </div>
                      )}

                      {/* Assembled prose — editable */}
                      {assembledPara && (
                        <div className={`px-4 pb-2${para.items?.some(i => i.status === 'confirmed') ? '' : ' pb-3'}`}>
                          {editingParaIdx === paraIdx ? (
                            <div className="space-y-2">
                              <textarea
                                value={editDraft}
                                onChange={e => setEditDraft(e.target.value)}
                                rows={5}
                                className="w-full text-sm rounded-xl border-2 px-3 py-2 focus:outline-none resize-none leading-relaxed"
                                style={{ color: 'var(--text-body)', borderColor: 'var(--accent)', backgroundColor: 'var(--surface-card)' }}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveDirectEdit(paraIdx, editDraft.trim())}
                                  disabled={!editDraft.trim() || phase === 'tutor-thinking'}
                                  className="flex-1 text-xs font-semibold text-white rounded-lg py-2 transition disabled:opacity-40"
                                  style={{ backgroundColor: 'var(--status-success)' }}
                                >
                                  Save &amp; share with coach
                                </button>
                                <button
                                  onClick={() => setEditingParaIdx(null)}
                                  className="text-xs font-semibold rounded-lg py-2 px-4 border transition"
                                  style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)', backgroundColor: 'var(--surface-card)' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="group/para relative">
                              <p className="text-sm leading-relaxed pr-8" style={{ color: 'var(--text-body)' }}>{assembledPara.scribed_text}</p>
                              <button
                                onClick={() => { setEditDraft(assembledPara.scribed_text); setEditingParaIdx(paraIdx) }}
                                title="Edit paragraph"
                                className="absolute top-0 right-0 opacity-0 group-hover/para:opacity-100 transition text-[10px] font-semibold rounded-md px-1.5 py-0.5"
                                style={{ color: 'var(--accent)', backgroundColor: 'var(--surface-spark)' }}
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Component items — for both complete (checklist) and current (in-progress) paragraphs */}
                      {!isPending && para.items?.length > 0 && (isComplete || isCurrentPara) && (
                        <div className={`px-4 pb-3 space-y-3${assembledPara ? ' pt-2 border-t border-green-100 mt-0' : ''}`}>
                          {para.items.map(item => {
                            const isConfirmed = item.status === 'confirmed'
                            // For completed paragraphs, skip items with no content to show
                            if (isComplete && !isConfirmed && !item.text && !item.nuggetText) return null

                            const statusColors = {
                              locked:    { dot: 'var(--border-strong)',   text: 'var(--text-subtle)' },
                              working:   { dot: 'var(--accent)',          text: 'var(--text-body)' },
                              candidate: { dot: 'var(--accent)',          text: 'var(--text-body)' },
                              confirmed: { dot: 'var(--status-success)',  text: 'var(--text-body)' },
                            }
                            const sc = statusColors[item.status] ?? statusColors.locked
                            const isEditingThis = editingComponent?.paraIdx === paraIdx && editingComponent?.componentId === item.id
                            const itemText = item.text || item.nuggetText || ''

                            return (
                              <div key={item.id} className="flex items-start gap-2">
                                {isComplete && isConfirmed ? (
                                  <span className="text-[10px] shrink-0 mt-0.5 font-bold" style={{ color: 'var(--status-success)' }}>✓</span>
                                ) : (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                                    style={{ backgroundColor: sc.dot }} />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: sc.dot }}>
                                      {item.label}
                                      {!isComplete && (item.status === 'confirmed' ? ' ✓' : item.status === 'working' ? ' →' : item.status === 'candidate' ? ' ◆' : '')}
                                    </span>
                                    {/* Revise = an orange filled button (white text) so it reads
                                        as a tappable control, not a label (Robert). Orange = action
                                        per the design system. */}
                                    {isConfirmed && itemText && !isEditingThis && (
                                      <button
                                        onClick={() => { setComponentEditDraft(itemText); setEditingComponent({ paraIdx, componentId: item.id }) }}
                                        title="Revise this"
                                        className="transition text-[11px] font-semibold rounded-md px-2 py-0.5 hover:opacity-90"
                                        style={{ color: 'var(--text-on-accent)', backgroundColor: 'var(--accent)' }}
                                      >
                                        Revise
                                      </button>
                                    )}
                                  </div>

                                  {/* Confirmed item — editable */}
                                  {isConfirmed && itemText && (
                                    isEditingThis ? (
                                      <div className="mt-1 space-y-1.5">
                                        <textarea
                                          value={componentEditDraft}
                                          onChange={e => setComponentEditDraft(e.target.value)}
                                          rows={3}
                                          className="w-full text-xs rounded-lg border-2 px-2.5 py-1.5 focus:outline-none resize-none leading-relaxed"
                                          style={{ color: 'var(--text-body)', borderColor: 'var(--accent)', backgroundColor: 'var(--surface-card)' }}
                                          autoFocus
                                        />
                                        <div className="flex gap-1.5">
                                          <button
                                            onClick={() => saveComponentEdit(paraIdx, item.id, componentEditDraft.trim())}
                                            disabled={!componentEditDraft.trim() || phase === 'tutor-thinking'}
                                            className="flex-1 text-[10px] font-semibold text-white rounded-md py-1.5 transition disabled:opacity-40"
                                            style={{ backgroundColor: 'var(--status-success)' }}
                                          >
                                            Save &amp; share with coach
                                          </button>
                                          <button
                                            onClick={() => setEditingComponent(null)}
                                            className="text-[10px] font-semibold rounded-md py-1.5 px-3 border transition"
                                            style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)', backgroundColor: 'var(--surface-card)' }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-sm leading-relaxed mt-1" style={{ color: sc.text }}>
                                        "{itemText}"
                                      </p>
                                    )
                                  )}

                                  {/* Non-confirmed item text (candidate) */}
                                  {!isConfirmed && itemText && (
                                    <p className="text-xs leading-snug mt-0.5" style={{ color: sc.text }}>
                                      "{itemText}"
                                    </p>
                                  )}

                                  {/* Nugget action buttons — only for current paragraph in listening phase */}
                                  {!isComplete && item.status === 'candidate' && phase === 'listening' && (
                                    <div className="flex gap-1.5 mt-1.5">
                                      <button
                                        onClick={() => confirmNugget(paraIdx, item.id, item.nuggetText)}
                                        className="text-[10px] font-semibold rounded-lg px-2.5 py-1 transition"
                                        style={{ backgroundColor: 'var(--status-success)', color: 'white' }}
                                      >
                                        Lock it in ✓
                                      </button>
                                      <button
                                        onClick={() => skipNugget(paraIdx, item.id)}
                                        className="text-[10px] font-semibold rounded-lg px-2.5 py-1 border transition"
                                        style={{ borderColor: 'var(--border-accent)', color: 'var(--text-muted)', backgroundColor: 'var(--surface-card)' }}
                                      >
                                        Keep going →
                                      </button>
                                    </div>
                                  )}

                                  {/* Fallback lock-in for custom parts: if the coach never proposed
                                      a candidate, let the student lock the active part in directly
                                      (prefilled with their last reply). Only shows for a WORKING
                                      custom part — never alongside the candidate buttons above or a
                                      confirmed line, so it can't duplicate. */}
                                  {!isComplete && para.type === 'custom' && item.status === 'working' && phase === 'listening' && (
                                    (lockingComponent?.paraIdx === paraIdx && lockingComponent?.componentId === item.id) ? (
                                      <div className="mt-1.5 space-y-1.5">
                                        <textarea
                                          value={lockDraft}
                                          onChange={e => setLockDraft(e.target.value)}
                                          rows={2}
                                          placeholder="Type or paste this part's final words…"
                                          className="w-full text-xs rounded-lg border-2 px-2.5 py-1.5 focus:outline-none resize-none leading-relaxed"
                                          style={{ color: 'var(--text-body)', borderColor: 'var(--accent)', backgroundColor: 'var(--surface-card)' }}
                                          autoFocus
                                        />
                                        <div className="flex gap-1.5">
                                          <button
                                            onClick={() => { confirmNugget(paraIdx, item.id, lockDraft.trim()); setLockingComponent(null) }}
                                            disabled={!lockDraft.trim()}
                                            className="text-[10px] font-semibold rounded-lg px-2.5 py-1 text-white transition disabled:opacity-40"
                                            style={{ backgroundColor: 'var(--status-success)' }}
                                          >
                                            Lock it in ✓
                                          </button>
                                          <button
                                            onClick={() => setLockingComponent(null)}
                                            className="text-[10px] font-semibold rounded-lg px-2.5 py-1 border transition"
                                            style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)', backgroundColor: 'var(--surface-card)' }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => { setLockDraft(item.nuggetText || lastUserMessage || ''); setLockingComponent({ paraIdx, componentId: item.id }) }}
                                        className="mt-1.5 text-[10px] font-semibold rounded-lg px-2.5 py-1 transition inline-flex items-center gap-1.5 text-white"
                                        style={{ backgroundColor: 'var(--status-success)' }}
                                      >
                                        <Icon name="pencil" size={13} /> Lock in this part
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                            )
                          })}

                          {/* All parts confirmed. Custom (non-prose) forms are already
                              finished — the parts ARE the draft, so don't merge them into
                              prose; offer to finish. Prose paragraphs get assembled.
                              In the onboarding warm-up the coach auto-completes and the
                              brand "See your opening line" banner is the clear next step,
                              so we hide this off-brand manual finish button entirely. */}
                          {isCurrentPara && allConfirmed && !onboarding && (
                            para.type === 'custom' ? (
                              <button
                                onClick={markSessionComplete}
                                disabled={phase !== 'listening' || sessionComplete}
                                className="mt-3 w-full text-sm font-semibold rounded-xl py-2.5 transition disabled:opacity-40"
                                style={{ backgroundColor: 'var(--status-success)', color: 'white' }}
                              >
                                {sessionComplete ? '✓ Finished' : 'Lock in all parts'}
                              </button>
                            ) : (
                              <button
                                onClick={() => assembleCurrentParagraph(paraIdx, para)}
                                disabled={phase !== 'listening'}
                                className="mt-3 w-full text-sm font-semibold rounded-xl py-2.5 transition disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                                style={{ backgroundColor: 'var(--primary)', color: 'white' }}
                              >
                                <Icon name="sparkles" size={13} /> Assemble paragraph
                              </button>
                            )
                          )}
                        </div>
                      )}

                      {/* Summary fallback — only when no assembled text and no item content */}
                      {isComplete && !assembledPara && !para.items?.some(i => i.status === 'confirmed') && para.summary && (
                        <div className="px-4 pb-3">
                          <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>{para.summary}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}

            {/* Full essay assembly — when all paragraphs complete */}
            {scaffold?.components?.length > 1
              && scaffold.components.every(p => p.status === 'complete')
              && paragraphs.length >= scaffold.total_paragraphs
              && !assembledEssay && (
              <div className="rounded-xl px-5 py-4 text-center"
                style={{ border: '1.5px dashed var(--accent)', backgroundColor: 'var(--surface-spark)' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-body)' }}>
                  All paragraphs are done — ready to assemble the full essay.
                </p>
                <button
                  onClick={assembleFullEssay}
                  disabled={isAssemblingEssay || phase !== 'listening'}
                  className="text-sm font-semibold text-white rounded-xl px-5 py-2.5 transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {isAssemblingEssay ? 'Assembling…' : <><Icon name="sparkles" size={13} /> Assemble full essay →</>}
                </button>
              </div>
            )}

            {/* Assembled full essay */}
            {assembledEssay && (
              <div className="rounded-xl overflow-hidden"
                style={{ border: '1.5px solid var(--status-success)', backgroundColor: 'var(--status-success-bg)' }}>
                <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--status-success)' }}>
                    ✓ Full Essay — Assembled
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(worksCited ? `${assembledEssay}\n\n${worksCited}` : assembledEssay)}
                    className="text-[10px] font-semibold hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    Copy
                  </button>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  {assembledEssay.split('\n\n').map((para, i) => (
                    <p key={i} className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{para}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Paragraphs saved via dictation path (no scaffold) */}
            {!scaffold?.components?.length && paragraphs.map((p, i) => (
              <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--status-success)', backgroundColor: 'var(--status-success-bg)' }}>
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--status-success)' }}>✓ Paragraph {i + 1}</span>
                </div>
                <div className="px-4 pb-3">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{p.scribed_text}</p>
                </div>
              </div>
            ))}

            {/* Works Cited — the auto-generated bibliography, last card of the draft.
                Renders null when there are no sources (WorksCitedCard guards). */}
            {sourcesEnabled && (
              <WorksCitedCard sources={sources} style={citationStyle} onStyleChange={setCitationStyle} />
            )}

            {/* Completion card — lives at the BOTTOM of the draft, under the finished
                work: everything above it builds to this. (Was pinned above the draft.) */}
            {sessionComplete && (
              <div className="rounded-2xl px-5 py-4 flex items-start gap-3"
                style={{ backgroundColor: 'var(--status-success-bg)', border: '1.5px solid var(--status-success)' }}>
                <Icon name="sparkles" size={20} style={{ color: 'var(--status-success)' }} />
                <div className="flex-1 min-w-0">
                  {gym ? (
                    <>
                      <p className="text-sm font-bold" style={{ color: 'var(--status-success)' }}>{gym.skillLabel} — practiced!</p>
                      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>Nice rep. This one's in your portfolio now.</p>
                      <div className="flex items-center gap-3 mt-2">
                        <a href={gym.portfolioHref ?? '/skill-studio/portfolio'} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                          See your portfolio →
                        </a>
                        <a href={gym.backHref ?? '/skill-studio'} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--text-link)' }}>
                          Back to Skill Studio
                        </a>
                      </div>
                    </>
                  ) : onboarding ? (
                    <>
                      <p className="text-sm font-bold" style={{ color: 'var(--status-success)' }}>Your opening line is ready!</p>
                      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>That's the warm-up done — let's take a look at what you wrote.</p>
                      <a href="/onboarding/complete" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                        See your opening line →
                      </a>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold" style={{ color: 'var(--status-success)' }}>Assignment complete!</p>
                      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>Every section is done — your finished piece is right above.</p>
                      <a href={`/transcript/${session.id}`} className="inline-flex items-center gap-1 mt-2 text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                        View transcript →
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
      </div>
    </div>
  )
}
