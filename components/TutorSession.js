'use client'

import { useState, useRef, useEffect, forwardRef, useImperativeHandle, memo } from 'react'
import { useRouter } from 'next/navigation'
import MicButton from './MicButton'
import ImpersonationBanner from './ImpersonationBanner'
import Navbar from './Navbar'
import { getPersona, PersonaAvatar } from '@/lib/personas'
import { SUBJECTS, getSubject } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'
import InviteTeacherForm from '@/components/InviteTeacherForm'
import Icon from '@/components/Icon'
import { computeActual, chipState } from '@/lib/requirements'
import { onboardingGreeting } from '@/lib/onboardingPrompts'

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

// Strips scaffold stream tokens + [DICTATE] from display text
const ALL_TOKEN_RE = /\[(SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE):[^\]]*\]|\[COMPLETE\]|\[DICTATE\]/g

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
    const g = {
      deon: `Hey ${name}. I've read the assignment. Have you started writing anything? Paste it below if so — if not, we'll build from scratch.`,
      zoe:    `Hi ${name}! I've read your assignment — have you written anything yet? Paste it below, or if you're starting fresh, no worries at all — we'll figure it out together!`,
      alistair: `Hello ${name}. I'm Alistair. I've read the assignment. Before we begin — have you written anything so far? Paste it below if you have. If not, no matter — we'll work through it.`,
      matilda:   `Hi ${name} — I'm Tilly, lovely to meet you. I've read through your assignment. Have you started anything yet? That's completely fine if not — we'll find our way in together.`,
      owen:    `Hi ${name}. I'm Owen. I've had a look at your assignment. There's no rush — we'll just take this one step at a time. Have you written anything so far? If not, that's totally okay.`,
      jade: `hey ${name}! okay I read the assignment — have you started anything yet? paste it below if you have. if not, no stress at all, we'll just figure it out together.`,
    }
    return g[persona] ?? g.owen
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
// Renders the 'listening' or 'dictating' footer and calls onSubmit with the
// final text. (Note: the previous inline textareas had a duplicate `style` prop,
// so React dropped the first object and the border/background never rendered;
// the styles below merge both into the intended design.)
const ReplyComposer = memo(function ReplyComposer({ mode, assignmentKeyterms, onSubmit }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)
  const micRef = useRef(null)
  const editingRef = useRef(false)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text])

  function resetHeight() {
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }
  function submit() {
    const t = text.trim()
    if (!t) return
    setText('')
    resetHeight()
    onSubmit(t)
  }

  // Live transcription writes into the box. Once the student starts editing,
  // ignore further interim updates so we don't clobber their changes. A mic
  // (re)start fires onInterim('') which re-enables transcription.
  function handleInterim(t) {
    if (t === '') { editingRef.current = false; setText(''); return }
    if (!editingRef.current) setText(t)
  }
  // Any manual edit (typing or paste) silently stops the mic so it can't keep
  // overwriting, and flags that we're now editing.
  function handleEdit(value) {
    micRef.current?.stop()
    editingRef.current = true
    setText(value)
  }

  if (mode === 'dictating') {
    return (
      <div className="border-t-2 flex flex-col gap-2 px-5 py-3"
        style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--surface-spark)' }}>
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
            onFinal={(t) => { if (t) { editingRef.current = false; setText(''); resetHeight(); onSubmit(t) } }}
          />
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
    <div className="px-5 py-3 flex items-center gap-3" style={{ backgroundColor: 'var(--bg-page)', borderTop: '1px solid var(--border-default)' }}>
      <MicButton
        ref={micRef}
        disabled={false}
        assignmentKeyterms={assignmentKeyterms}
        onInterim={handleInterim}
        onFinal={(t) => { if (t && !editingRef.current) setText(t) }}
      />
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
        <button type="submit" disabled={!text.trim()}
          className="text-sm text-white rounded-xl px-4 py-2.5 transition disabled:opacity-40 shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}>
          Send
        </button>
      </form>
    </div>
  )
})

// Sessions that have already shown their opening greeting, keyed by session id.
// Module-level (not a ref) so it survives a component remount — a remount would
// otherwise reset the per-instance hasGreeted ref and deliver the greeting twice.
const greetedSessions = new Set()

// ── Component ─────────────────────────────────────────────────────────────────

export default function TutorSession({
  session,
  initialMessages = [],
  initialParagraphs = [],
  initialScaffold = null,
  studentName = 'there',
  initialTeachers = [],
  user = null,
  profile = null,
  onboarding = false,
  impersonation = null,
}) {
  const [messages, setMessages]           = useState(
    initialMessages.map(m => m.role === 'assistant' ? { ...m, persona: session.persona } : m)
  )
  const [paragraphs, setParagraphs]       = useState(initialParagraphs)
  const [scaffold, setScaffold]           = useState(initialScaffold)
  const captionRef                        = useRef(null)
  const [pendingScribe, setPendingScribe] = useState(null)
  const [phase, setPhase]                 = useState('waiting')
  const [persona, setPersona]             = useState(session.persona ?? 'owen')
  const [showPersonaPicker, setShowPersonaPicker] = useState(false)
  const [sessionTitle, setSessionTitle]   = useState(session.title ?? null)
  const [titleExpanded, setTitleExpanded] = useState(false)
  const [assignmentSummary, setAssignmentSummary] = useState(session.assignment_summary ?? null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [editingTitle, setEditingTitle]   = useState(false)
  const [titleDraft, setTitleDraft]       = useState('')
  const [replayingIndex, setReplayingIndex] = useState(null)
  const [sessionComplete, setSessionComplete] = useState(session.status === 'complete')
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

  const chatBottomRef     = useRef(null)
  const titleInputRef     = useRef(null)
  const hasGreeted        = useRef(false)
  const audioRef          = useRef(null)   // single persistent <audio>, unlocked on first gesture
  const audioTimerRef     = useRef(null)
  const playSeqRef        = useRef(0)       // bumps each playback; stale playbacks bail
  const audioUnlockedRef  = useRef(false)
  const pendingGreetingRef = useRef(null)   // greeting that got autoplay-blocked, to re-speak on first gesture
  const everPlayedRef     = useRef(false)   // has any clip actually started playing yet?

  const barPanelRef       = useRef(null)
  const router           = useRouter()

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
    if (hasGreeted.current || greetedSessions.has(session.id)) return
    hasGreeted.current = true
    if (initialMessages.length > 0) {
      setPhase('listening')
      // The onboarding greeting is persisted server-side, so it arrives in
      // initialMessages even on first load. Speak it once in the background — the
      // student still hears Owen open, but the input is live immediately (no waiting
      // on audio, which previously gated the whole session behind the greeting clip).
      if (onboarding && initialMessages.length === 1 && initialMessages[0]?.role === 'assistant') {
        greetedSessions.add(session.id)
        replayAudioOnly(initialMessages[0].content, session.persona ?? 'owen')
      }
      return
    }
    greetedSessions.add(session.id)
    const activePersona = session.persona ?? 'owen'
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
    await replayAudioOnly(text, activePersona)
    setPhase('listening')
  }

  async function replayAudioOnly(text, activePersona = persona) {
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
          const paraIdx = parseInt(payload.slice(0, colonIdx))
          const summary = payload.slice(colonIdx + 1)
          if (!isNaN(paraIdx)) {
            sc = {
              ...sc,
              current_paragraph_index: paraIdx + 1,
              components: sc.components.map((p, i) =>
                i === paraIdx ? { ...p, status: 'complete', summary } : p
              ),
            }
            changed = true
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
    setPhase('tutor-thinking')
    captionRef.current?.set('…')

    try {
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          assignment: session.assignment_text,
          messages: history,
          persona: activePersona,
          scaffold,
        }),
      })

      if (!res.ok) {
        console.error('Tutor API error:', res.status, await res.text())
        captionRef.current?.clear()
        setPhase('listening')
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

        if (!firstSentence) {
          const clean = liveDisplay(full)
          const m = clean.match(/^\s*(.+?[.!?])(\s|$)/s)
          // Only split off a first sentence if there's clearly more coming after it
          if (m && m[1].trim().length >= 8 && clean.length > m[1].length + 1) {
            firstSentence = m[1].trim()
            firstPlay = (async () => {
              try { await playTtsUrl(await fetchTts(firstSentence, activePersona)) } catch {}
            })()
          }
        }
      }

      // Parse scaffold tokens and update scaffold state
      const newScaffold = await parseAndApplyScaffoldTokens(full, scaffold)
      if (newScaffold !== scaffold) setScaffold(newScaffold)

      if (full.includes('[COMPLETE]')) markSessionComplete()

      const hasDictateSignal = full.includes('[DICTATE]')
      const displayText = full.replace(ALL_TOKEN_RE, '').trim()
      captionRef.current?.set(displayText)

      if (firstSentence) {
        // Remainder after the first sentence; fetch its audio now (overlaps the
        // first sentence still playing), then play once the first finishes.
        const remainder = displayText.slice(firstSentence.length).trim()
        const remainderUrl = remainder ? fetchTts(remainder, activePersona).catch(() => null) : null
        await firstPlay
        if (remainderUrl) {
          const url = await remainderUrl
          if (url) await playTtsUrl(url)
        }
      } else {
        // Single short reply (no mid-stream sentence boundary) — speak it whole.
        await replayAudioOnly(displayText, activePersona)
      }

      setMessages([...(displayHistory ?? history), { role: 'assistant', content: displayText, persona: activePersona }])
      captionRef.current?.clear()
      setPhase(hasDictateSignal ? 'dictating' : 'listening')
    } catch (err) {
      console.error('askTutor failed:', err)
      captionRef.current?.clear()
      setPhase('listening')
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
    if (newPersona === persona) { setShowPersonaPicker(false); return }
    stopCurrentAudio()
    setShowPersonaPicker(false)
    setPersona(newPersona)
    await fetch(`/api/sessions/${session.id}/persona`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: newPersona }),
    })
    const essaySoFar = paragraphs.length > 0
      ? `Current essay so far:\n${paragraphs.map(p => p.scribed_text).join('\n\n')}`
      : 'Nothing written yet.'
    const displayName = PERSONA_META[newPersona]?.name ?? newPersona
    const switchMsg = {
      role: 'user',
      content: `[System: Student switched coach to ${displayName}. Your name is ${displayName} — never use any other name. Acknowledge the switch briefly in your own voice and continue coaching. ${essaySoFar}]`,
    }
    askTutor([...messages, switchMsg], newPersona, messages)
  }

  async function markSessionComplete() {
    if (sessionComplete) return
    setSessionComplete(true)
    try {
      const res = await fetch(`/api/sessions/${session.id}/complete`, { method: 'PATCH' })
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
    router.push('/dashboard')
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
      const paraPayload = paragraphs
        .filter(p => p.scribed_text)
        .map((p, i) => ({
          index: p.paragraph_index ?? i,
          type: scaffold?.components[p.paragraph_index ?? i]?.type ?? null,
          text: p.scribed_text,
        }))
      const res = await fetch('/api/assemble-essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraphs: paraPayload, thesis: scaffold?.thesis ?? null }),
      })
      const { assembled } = await res.json()
      setAssembledEssay(assembled)
    } catch (err) {
      console.error('[assembleFullEssay]', err)
    }
    setIsAssemblingEssay(false)
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
    stopCurrentAudio()
    const userMessage = { role: 'user', content: spokenText }
    const newHistory = [...messages, userMessage]
    setMessages(newHistory)
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, role: 'user', content: spokenText }),
    })
    askTutor(newHistory)
  }

  // ── Dictation handler (student speaks their paragraph → scribe) ──────────────

  async function handleDictation(spokenText) {
    stopCurrentAudio()
    const userMessage = { role: 'user', content: spokenText }
    const newHistory  = [...messages, userMessage]
    setMessages(newHistory)
    setPhase('scribe-thinking')

    const [, scribeRes] = await Promise.all([
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, role: 'user', content: spokenText }),
      }),
      fetch('/api/scribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spokenText, sessionId: session.id }),
      }),
    ])

    const scribed = await scribeRes.json()

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
  const reqActual    = computeActual(paragraphs)
  const currentMeta  = PERSONA_META[persona]
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
            {/* FTUE step 3 of 3 — your first opening line */}
            <span className="font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>Step 3 of 3</span>
            <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>Just your opening line — to get the feel of it. Nothing here is graded.</span>
            <button onClick={exitPractice}
              className="ml-auto font-semibold hover:underline" style={{ color: 'var(--text-muted)' }}>
              Exit practice
            </button>
          </div>
        )}

        {/* ── Assignment bar ── */}
        <div className="shrink-0" ref={barPanelRef} style={{ backgroundColor: 'var(--surface-card)', borderBottom: '1px solid var(--border-default)' }}>

          {/* Main row */}
          <div className="flex items-center gap-0 px-3 py-2.5" style={{ minHeight: 52 }}>

            {/* Back to the assignments list — replaces the old in-workspace sidebar.
                Role-aware: students land on /dashboard, parents/teachers on their home. */}
            {!onboarding && (
              <a href={profile?.role === 'parent' ? '/parent' : profile?.role === 'teacher' ? '/teacher' : '/dashboard'}
                className="-ml-1 mr-1 flex items-center gap-1.5 h-9 px-2 rounded-lg shrink-0 text-xs font-medium transition"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                title="My assignments">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                <span className="hidden sm:inline">My assignments</span>
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

            {/* RIGHT: Subject + Teacher chips */}
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
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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
                    {m.role === 'assistant' && (
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

          {/* Input area — changes based on phase */}
          {phase === 'listening' && (
            <ReplyComposer mode="listening" assignmentKeyterms={assignmentKeyterms} onSubmit={handleConversation} />
          )}

          {phase === 'dictating' && (
            <ReplyComposer mode="dictating" assignmentKeyterms={assignmentKeyterms} onSubmit={handleDictation} />
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

          {(phase === 'tutor-thinking' || phase === 'waiting') && (
            <div className="px-5 py-3 text-center" style={{ backgroundColor: 'var(--bg-page)', borderTop: '1px solid var(--border-default)' }}>
              <p className="text-xs italic" style={{ color: 'var(--text-subtle)' }}>{currentMeta.name} is thinking…</p>
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
              <button onClick={() => navigator.clipboard.writeText(fullEssay)}
                className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                Copy essay
              </button>
            )}
          </div>

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

          {sessionComplete && (
            <div className="mx-4 mt-4 rounded-2xl px-5 py-4 flex items-start gap-3 shrink-0"
              style={{ backgroundColor: 'var(--status-success-bg)', border: '1.5px solid var(--status-success)' }}>
              <Icon name="sparkles" size={20} style={{ color: 'var(--status-success)' }} />
              <div className="flex-1 min-w-0">
                {onboarding ? (
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
                    <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>Every section is done. Your full essay is below.</p>
                    <a href={`/transcript/${session.id}`} className="inline-flex items-center gap-1 mt-2 text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                      View transcript →
                    </a>
                  </>
                )}
              </div>
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
              // Completed paragraphs collapse by default; toggled via header click
              const isExpanded    = isComplete ? (expandedParas[paraIdx] === true) : true
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
                    onClick={isComplete ? () => setExpandedParas(prev => ({ ...prev, [paraIdx]: !prev[paraIdx] })) : undefined}
                  >
                    <div className="flex items-center gap-2">
                      {isComplete ? (
                        <>
                          <span className="text-sm" style={{ color: 'var(--status-success)' }}>✓</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--status-success)' }}>
                            {heading || 'Done'}
                          </span>
                        </>
                      ) : isPending ? (
                        <>
                          <span className="inline-block w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: 'var(--accent)' }} />
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                            {heading ? `${heading} — confirming…` : 'Confirming…'}
                          </span>
                        </>
                      ) : isCurrentPara ? (
                        <>
                          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--accent)' }} />
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                            {heading ? `${heading} — writing now` : 'Writing now'}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--border-strong)' }} />
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>
                            {heading || 'Locked'}
                          </span>
                        </>
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
                        <div className={`px-4 pb-3 space-y-1.5${assembledPara ? ' pt-2 border-t border-green-100 mt-0' : ''}`}>
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
                                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: sc.dot }}>
                                    {item.label}
                                    {!isComplete && (item.status === 'confirmed' ? ' ✓' : item.status === 'working' ? ' →' : item.status === 'candidate' ? ' ◆' : '')}
                                  </span>

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
                                      <div className="relative mt-0.5 pr-10">
                                        <p className="text-xs leading-snug" style={{ color: sc.text }}>
                                          "{itemText}"
                                        </p>
                                        <button
                                          onClick={() => { setComponentEditDraft(itemText); setEditingComponent({ paraIdx, componentId: item.id }) }}
                                          title="Revise this"
                                          className="absolute top-0 right-0 transition text-[10px] font-semibold rounded-md px-1.5 py-0.5"
                                          style={{ color: 'var(--accent)', backgroundColor: 'var(--surface-spark)' }}
                                        >
                                          Revise
                                        </button>
                                      </div>
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
                                        className="mt-1.5 text-[10px] font-semibold rounded-lg px-2.5 py-1 transition inline-flex items-center gap-1.5"
                                        style={{ color: 'var(--accent)', backgroundColor: 'var(--surface-spark)' }}
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
                                {sessionComplete ? '✓ Finished' : '✓ Finish — all parts locked in'}
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
                    onClick={() => navigator.clipboard.writeText(assembledEssay)}
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
          </div>
        </div>
        </div>
      </div>
      </div>
    </div>
  )
}
