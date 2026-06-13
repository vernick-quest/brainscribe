import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WritingProfileCard from '@/components/WritingProfileCard'
import CopyButton from '@/components/CopyButton'
import Navbar from '@/components/Navbar'
import { PersonaAvatar, getPersona } from '@/lib/personas'
import { getSubjectLabel } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'

export default async function TranscriptPage({ params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  // RLS enforces access — student owns, or watcher via relationship/assignment_teachers
  const { data: session } = await supabase
    .from('sessions')
    .select('*, profiles(full_name)')
    .eq('id', id)
    .single()

  if (!session) {
    const dest = profile?.role === 'parent' ? '/parent' : profile?.role === 'teacher' ? '/teacher' : '/dashboard'
    redirect(dest)
  }

  const { data: paragraphs } = await supabase
    .from('paragraphs')
    .select('*')
    .eq('session_id', id)
    .order('position')

  const { data: messages } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('session_id', id)
    .order('created_at')

  const essay = paragraphs?.map(p => p.scribed_text).join('\n\n') ?? ''
  const isStudent = profile?.role === 'student'
  const isComplete = session.status === 'complete'
  const backHref = profile?.role === 'parent' ? '/parent' : profile?.role === 'teacher' ? '/teacher' : '/dashboard'
  const backLabel = profile?.role === 'parent' ? 'Parent dashboard' : profile?.role === 'teacher' ? 'Teacher dashboard' : 'Dashboard'
  const coachPersona = getPersona(session.persona)
  const subjectLabel = getSubjectLabel(session)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <Navbar user={user} profile={profile} />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Back + title */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <a href={backHref} className="text-xs font-medium inline-flex items-center gap-1 mb-3 group"
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
                  : { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }
                }
              >
                {isComplete ? '✓ Done' : 'In progress'}
              </span>
            </div>
          </div>
        </div>

        {/* Assignment prompt */}
        <section className="rounded-2xl p-6 space-y-3"
          style={{ backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Assignment</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{session.assignment_text}</p>
        </section>

        {/* Final essay */}
        <section className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {isComplete ? 'Final essay' : 'Essay (in progress)'}
              </h2>
              {!isComplete && (
                <span className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  WIP
                </span>
              )}
            </div>
            {essay && <CopyButton text={essay} />}
          </div>
          {!paragraphs?.length ? (
            <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>No paragraphs yet.</p>
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
                    <details className="mt-2">
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

        {/* Writing profile — non-students only */}
        {!isStudent && (
          <section className="rounded-2xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Writing Profile</h2>
            <WritingProfileCard
              profile={session.writing_profile ?? null}
              sessionComplete={session.status === 'complete'}
              studentName={session.profiles?.full_name?.split(' ')[0]}
            />
          </section>
        )}

        {/* Full conversation transcript */}
        <section className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Conversation</h2>
          {!messages?.length ? (
            <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>No conversation recorded yet.</p>
          ) : (
            <div className="space-y-5">
              {messages.map((m, i) => {
                const isCoach = m.role === 'assistant'
                return (
                  <div key={i} className="flex gap-3">
                    {isCoach ? (
                      <PersonaAvatar personaId={session.persona} size={28} className="mt-0.5 shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                        {(session.profiles?.full_name?.[0] ?? 'S').toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold" style={{ color: isCoach ? coachPersona.color : 'var(--text-muted)' }}>
                        {isCoach ? coachPersona.name : (session.profiles?.full_name?.split(' ')[0] ?? 'Student')}
                      </span>
                      <p className="text-sm leading-relaxed mt-0.5" style={{ color: 'var(--text-body)' }}>{m.content}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
