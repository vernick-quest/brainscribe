'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PersonaAvatar, getPersona } from '@/lib/personas'
import { useCoachVoice } from '@/lib/useCoachVoice'
import Icon from '@/components/Icon'

const OWEN = getPersona('owen')

// The three components that come AFTER the hook on a real assignment — shown greyed
// here so the student sees where this leads without having to write them now.
const NEXT_PARTS = ['Context', 'Body', 'Closing']

export default function OnboardingComplete({ studentName = 'there', practiceSessionId = null, hook = null }) {
  const router = useRouter()
  const { speak, stop } = useCoachVoice('owen')

  // Spoken reflection — short, so the voice payoff lands fast. Names that the line
  // is theirs, then points at the real thing.
  const reflection = hook
    ? `That's yours, ${studentName} — you wrote that. One line, and it's already got something real in it. That's exactly how this works on your real assignments. Ready for the real thing?`
    : `Nice work, ${studentName} — you just talked out your first opening line. That's exactly how this works on your real assignments too. Ready for the real thing?`

  useEffect(() => { speak(reflection) }, [reflection, speak])

  function go(href) {
    stop()
    router.push(href)
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-12" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <PersonaAvatar personaId="owen" size={44} />
          <div>
            <p className="font-bold leading-tight" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
              {OWEN.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Your writing coach</p>
          </div>
        </div>

        <div className="rounded-3xl p-6 sm:p-8 space-y-6"
          style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>

          <div className="flex items-center gap-2">
            <Icon name="sparkles" size={22} style={{ color: 'var(--status-success)' }} />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--status-success)' }}>
              You wrote your first line
            </p>
          </div>

          {/* The hook, revealed large — the "that's mine" moment. */}
          {hook && (
            <div className="rounded-2xl px-6 py-6 text-center" style={{ backgroundColor: 'var(--surface-spark)', border: '1.5px solid var(--border-accent)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--accent-text)' }}>
                {studentName}&rsquo;s opening line
              </p>
              <p className="leading-snug" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)' }}>
                &ldquo;{hook}&rdquo;
              </p>
            </div>
          )}

          <p className="leading-relaxed" style={{ color: 'var(--text-strong)', fontSize: 'var(--text-lg)' }}>
            {reflection}
          </p>

          {/* What comes next on a real assignment — the hook is done, these aren't. */}
          <div className="rounded-2xl px-5 py-4 space-y-2.5" style={{ backgroundColor: 'var(--bg-page)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 18, height: 18, backgroundColor: 'var(--status-success)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Opening line</span>
              <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>— done</span>
            </div>
            {NEXT_PARTS.map(part => (
              <div key={part} className="flex items-center gap-2.5">
                <span className="rounded-full shrink-0" style={{ width: 18, height: 18, border: '2px solid var(--border-strong)' }} />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{part}</span>
              </div>
            ))}
            <p className="text-xs pt-1 leading-snug" style={{ color: 'var(--text-subtle)' }}>
              On a real assignment you&rsquo;ll build these the same way — one piece at a time, all in your own words.
            </p>
          </div>

          {/* Teacher-trust note, reinforced right after they see their own voice on the page. */}
          {practiceSessionId && (
            <div className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
              <p>When you add a teacher to an assignment, this is what they see — the conversation, so they know the words came from you.</p>
              <a href={`/transcript/${practiceSessionId}`}
                className="inline-flex items-center gap-1 mt-1.5 font-semibold hover:underline"
                style={{ color: 'var(--accent-text)' }}>
                See the full transcript →
              </a>
            </div>
          )}

          <div className="space-y-3 pt-1">
            <p className="text-sm leading-snug" style={{ color: 'var(--text-muted)' }}>
              Ready for the real thing? Paste in an actual assignment and we&rsquo;ll build the
              whole paragraph together — the same way, one piece at a time.
            </p>
            <button onClick={() => go('/assignment/new')}
              className="w-full font-bold rounded-full py-3 transition"
              style={{ color: 'var(--text-on-accent)', backgroundColor: 'var(--accent)' }}>
              Start my first assignment →
            </button>
            <button onClick={() => go('/dashboard')}
              className="block w-full text-center text-sm font-semibold hover:underline"
              style={{ color: 'var(--text-muted)' }}>
              Go to my dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
