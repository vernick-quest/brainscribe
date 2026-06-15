'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PersonaAvatar, getPersona } from '@/lib/personas'
import { useCoachVoice } from '@/lib/useCoachVoice'

const OWEN = getPersona('owen')

export default function OnboardingComplete({ studentName = 'there', practiceSessionId = null }) {
  const router = useRouter()
  const { speak, stop } = useCoachVoice('owen')

  const reflection = `There it is, ${studentName} — a full paragraph, in your own words. You talked it out and it came together. That's exactly how this works on your real assignments too. I'm your default coach, but there are five others with different styles — you can switch anytime, even in the middle of writing. Ready for the real thing?`

  useEffect(() => { speak(reflection) }, [reflection, speak])

  function toDashboard() {
    stop()
    router.push('/dashboard')
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5" style={{ backgroundColor: 'var(--bg-page)' }}>
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

        <div className="rounded-3xl p-6 sm:p-8 space-y-5"
          style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>

          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none">🎉</span>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--status-success)' }}>
              You wrote your first paragraph
            </p>
          </div>

          <p className="leading-relaxed" style={{ color: 'var(--text-strong)', fontSize: 'var(--text-lg)' }}>
            {reflection}
          </p>

          <button onClick={toDashboard}
            className="w-full text-white font-bold rounded-full py-3 transition"
            style={{ backgroundColor: 'var(--accent)' }}>
            Take me to my dashboard →
          </button>

          {practiceSessionId && (
            <a href={`/transcript/${practiceSessionId}`}
              className="block text-center text-sm font-semibold hover:underline"
              style={{ color: 'var(--accent)' }}>
              See your practice paragraph →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
