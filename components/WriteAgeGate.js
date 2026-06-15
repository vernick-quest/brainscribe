'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Shown on /write when the account has no age on file yet (e.g. a parent/teacher
// who joined before age-first onboarding). Coaches require 13+. Confirming keeps
// their existing role, records the age, and reloads them into the writer.
export default function WriteAgeGate({ role }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [tooYoung, setTooYoung] = useState(false)
  const [error, setError] = useState('')

  async function pick(bracket) {
    setError('')
    if (bracket === 'under13') { setTooYoung(true); return }
    setLoading(true)
    const res = await fetch('/api/profile/confirm-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role ?? 'student', age_bracket: '13plus' }),
    })
    if (!res.ok) { setError('Something went wrong. Please try again.'); setLoading(false); return }
    router.refresh()
  }

  return (
    <div className="rounded-2xl p-6 space-y-5"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
      {tooYoung ? (
        <div className="space-y-2">
          <p className="font-bold" style={{ color: 'var(--text-strong)' }}>Coaches are for ages 13 and older</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            If you're a student under 13, you'll need a parent or guardian's consent before writing with a coach.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <p className="font-bold" style={{ color: 'var(--text-strong)' }}>Quick check before you write</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Writing with a coach is for ages 13 and older.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { bracket: '13plus', label: "I'm 13 or older" },
              { bracket: 'under13', label: "I'm under 13" },
            ].map(({ bracket, label }) => (
              <button key={bracket} onClick={() => pick(bracket)} disabled={loading}
                className="rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                style={{ border: '2px solid var(--border-strong)', color: 'var(--text-strong)', backgroundColor: 'var(--surface-card)' }}>
                {label}
              </button>
            ))}
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--status-error)' }}>{error}</p>}
        </>
      )}
    </div>
  )
}
