'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Step-2 sign-in button: Google OAuth that returns to /coppa/confirm with the
// confirm token, mirroring the step-1 ConsentForm. Used only when the parent
// isn't already signed in (e.g. they opened the second email on another device).
export default function CoppaConfirmButton({ token }) {
  const [loading, setLoading] = useState(false)

  async function confirm() {
    setLoading(true)
    const supabase = createClient()
    const origin = window.location.origin
    const redirectTo = `${origin}/api/auth/callback?next=/coppa/confirm?token=${encodeURIComponent(token)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    // Navigates away — no need to reset loading.
  }

  return (
    <button
      onClick={confirm}
      disabled={loading}
      style={{
        width: '100%', padding: '1rem', borderRadius: 14, fontWeight: 700, fontSize: '1rem',
        color: '#fff', backgroundColor: loading ? 'var(--border-strong)' : 'var(--brand-orange)',
        border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      {loading ? 'Opening Google sign-in…' : 'Confirm and continue with Google'}
    </button>
  )
}
