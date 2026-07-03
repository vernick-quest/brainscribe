import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getImpersonation } from '@/lib/impersonation'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import CopyButton from '@/components/CopyButton'
import Navbar from '@/components/Navbar'
import Icon from '@/components/Icon'
import TranscriptToolbar from '@/components/TranscriptToolbar'
import ConversationLog from '@/components/ConversationLog'
import { PersonaAvatar, getPersona } from '@/lib/personas'
import { getSubjectLabel } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'
import { computeActual, chipState } from '@/lib/requirements'

export default async function TranscriptPage({ params, searchParams }) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Honor admin "remote in": read the impersonated student's data (RLS would block
  // the admin) and route/label by their role.
  const { data: adminProfile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  const imp = await getImpersonation(adminProfile)
  const effectiveUserId = imp?.userId ?? user.id
  const db = imp ? createServiceClient() : supabase

  const profile = imp
    ? (await db.from('profiles').select('role, full_name').eq('id', effectiveUserId).single()).data
    : adminProfile

  const { data: session } = await db
    .from('sessions')
    .select('*, profiles(full_name)')
    .eq('id', id)
    .single()

  if (!session) {
    const dest = profile?.role === 'parent' ? '/parent' : profile?.role === 'teacher' ? '/teacher' : '/dashboard'
    redirect(dest)
  }

  const [{ data: paragraphs }, { data: scaffold }, { data: messages }] = await Promise.all([
    db.from('paragraphs').select('*').eq('session_id', id).order('position'),
    db.from('paragraph_scaffolds').select('components').eq('session_id', id).maybeSingle(),
    db.from('messages').select('role, content, created_at').eq('session_id', id).order('created_at'),
  ])

  // FTUE finale: landing on the practice transcript is the end of the tutorial.
  // Mark onboarding done for the real student (never during an admin remote-in).
  // Defer the write via after() so it runs once the response has flushed — the
  // first-time finale render shouldn't block on a profile UPDATE round-trip.
  const onboardingFinish = sp?.onboarding === '1' && session.is_onboarding === true
  if (onboardingFinish && !imp) {
    after(async () => {
      await createServiceClient()
        .from('profiles')
        .update({ onboarding_complete: true, onboarding_completed_at: new Date().toISOString() })
        .eq('id', effectiveUserId)
    })
  }

  // Final content lives in paragraphs for prose, but in the scaffold's confirmed
  // components for non-prose forms (e.g. a haiku's lines). Fall back to the scaffold.
  const scaffoldLines = (scaffold?.components ?? [])
    .flatMap(sec => sec.items ?? [])
    .filter(it => it.status === 'confirmed' && (it.text || it.nuggetText))
    .map(it => it.text || it.nuggetText)

  const essay = paragraphs?.length
    ? paragraphs.map(p => p.scribed_text).join('\n\n')
    : scaffoldLines.join('\n')
  const isStudent = profile?.role === 'student'
  const isComplete = session.status === 'complete'
  // Truly-empty transcript (e.g. an in-progress session opened by a watcher
  // before any writing happened): show one graceful empty state instead of two
  // separate "nothing yet" lines across the draft + conversation cards.
  const hasDraft = paragraphs?.length > 0 || scaffoldLines.length > 0
  const isEmpty = !hasDraft && !messages?.length

  // Neutral requirement readout (word/paragraph counts) — recomputed from the
  // written paragraphs so it's accurate even if requirements.actual is stale.
  const reqTargets = session.requirements?.targets ?? []
  const reqActual = reqTargets.length ? computeActual(paragraphs ?? []) : null
  const reqLine = reqTargets.length
    ? reqTargets.map(t => chipState(t, reqActual)?.full).filter(Boolean).join(' · ')
    : null
  const backHref = profile?.role === 'parent' ? '/parent' : profile?.role === 'teacher' ? '/teacher' : '/dashboard'
  const backLabel = profile?.role === 'parent' ? 'Parent dashboard' : profile?.role === 'teacher' ? 'Teacher dashboard' : 'Dashboard'
  const coachPersona = getPersona(session.persona)
  const subjectLabel = getSubjectLabel(session)

  return (
    <div className="transcript-root min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="no-print">
        <Navbar user={user} profile={profile} />
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* FTUE finale — the practice transcript is the end of the tutorial */}
        {onboardingFinish && (
          <section className="no-print rounded-2xl p-5 flex items-start gap-3"
            style={{ backgroundColor: 'var(--status-success-bg)', border: '1.5px solid var(--status-success)' }}>
            <Icon name="sparkles" size={22} style={{ color: 'var(--status-success)' }} />
            <div className="flex-1 min-w-0">
              {/* FTUE step 7 of 7 — see your paragraph + reflect */}
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--status-success)' }}>Step 7 of 7</p>
              <p className="text-sm font-bold" style={{ color: 'var(--status-success)' }}>That's your first paragraph!</p>
              <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>
                Here's the whole thing in your own words — plus the conversation that built it.
              </p>
              <a href="/onboarding/complete" className="inline-flex items-center gap-1 mt-3 text-sm font-bold rounded-full px-4 py-2 text-white"
                style={{ backgroundColor: 'var(--accent)' }}>
                Done — wrap up →
              </a>
            </div>
          </section>
        )}

        {/* Back + title */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <a href={backHref} className="no-print text-xs font-medium inline-flex items-center gap-1 mb-3 group"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={undefined}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              {backLabel}
            </a>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              Assignment Transcript
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <PersonaAvatar personaId={session.persona} size={20} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                {session.profiles?.full_name ?? 'Student'}
              </span>
              <span style={{ color: 'var(--border-strong)' }}>·</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {new Date(session.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
              {subjectLabel && (
                <>
                  <span style={{ color: 'var(--border-strong)' }}>·</span>
                  <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <SubjectIcon value={session.subject} size={14} />
                    {subjectLabel}
                  </span>
                </>
              )}
              <span
                className="text-[11px] font-semibold rounded-full px-2.5 py-0.5"
                style={isComplete
                  ? { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }
                  : { backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)' }
                }
              >
                {isComplete ? '✓ Done' : 'In progress'}
              </span>
            </div>
          </div>
          <TranscriptToolbar />
        </div>

        {/* Assignment prompt */}
        <section className="rounded-2xl p-6 space-y-3"
          style={{ backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Assignment</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{session.assignment_text}</p>
        </section>

        {isEmpty ? (
          /* Nothing written and no conversation yet — one graceful empty state. */
          <section className="rounded-2xl p-10 flex flex-col items-center text-center gap-2"
            style={{ backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
            <Icon name="doc" size={28} style={{ color: 'var(--text-subtle)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-body)' }}>Nothing here yet</p>
            <p className="text-xs max-w-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
              {isStudent
                ? 'Once you start writing with your coach, your draft and the conversation will show up here.'
                : 'This assignment hasn’t been started yet. The draft and coaching conversation will appear here once writing begins.'}
            </p>
          </section>
        ) : (
        <>
        {/* Final essay */}
        <section className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {isComplete ? 'Final draft' : 'Draft (in progress)'}
              </h2>
              {!isComplete && (
                <span className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                  WIP
                </span>
              )}
            </div>
            {essay && <CopyButton text={essay} />}
          </div>
          {reqLine && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{reqLine}</p>
          )}
          {!paragraphs?.length && scaffoldLines.length > 0 ? (
            <div className="space-y-1">
              {scaffoldLines.map((line, i) => (
                <p key={i} className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{line}</p>
              ))}
            </div>
          ) : !paragraphs?.length ? (
            <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>Nothing written yet.</p>
          ) : (
            <div className="space-y-4">
              {paragraphs.map((p, i) => (
                <div key={i}>
                  <p className="text-sm leading-relaxed" style={{ color: p.is_thin ? 'var(--text-muted)' : 'var(--text-body)' }}>
                    {p.scribed_text}
                  </p>
                  {p.is_thin && (
                    <p className="text-xs mt-1 italic" style={{ color: 'var(--status-thin)' }}>
                      Thin paragraph — student was building on this idea
                    </p>
                  )}
                  {!isStudent && (
                    <details className="no-print mt-2">
                      <summary className="text-xs cursor-pointer" style={{ color: 'var(--text-subtle)' }}>
                        Raw spoken text
                      </summary>
                      <p className="text-xs mt-1 rounded-lg p-2 font-mono"
                        style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-muted)' }}>
                        {p.raw_spoken_text}
                      </p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Full conversation transcript */}
        <section className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Conversation</h2>
            {messages?.length > 0 && (
              <span className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                {messages.length} {messages.length === 1 ? 'message' : 'messages'}
              </span>
            )}
          </div>
          {!messages?.length ? (
            <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>No conversation recorded yet.</p>
          ) : (
            <ConversationLog messages={messages} persona={session.persona} />
          )}
        </section>
        </>
        )}

        {/* Next actions — students only; this is the end of a finished piece, not
            a place to keep writing. Watchers (parent/teacher) use the back link. */}
        {isStudent && isComplete && (
          <section className="no-print flex flex-wrap items-center gap-3">
            <a href="/assignment/new"
              className="inline-flex items-center gap-2 text-sm font-bold rounded-full px-5 py-2.5 text-white"
              style={{ backgroundColor: 'var(--accent)' }}>
              <Icon name="pencil" size={16} />
              Start another assignment
            </a>
            <a href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-semibold rounded-full px-5 py-2.5"
              style={{ color: 'var(--text-body)', border: '1px solid var(--border-strong)' }}>
              Back to dashboard
            </a>
          </section>
        )}

      </main>
    </div>
  )
}
