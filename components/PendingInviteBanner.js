'use client'

import { useState } from 'react'

// Confirmation banner for an incoming connection the signed-in user hasn't
// claimed yet (they already had an account when they were invited). "Accept"
// routes through /invite?token=… — the one place that runs the real claim
// guards (email match, role/age gates, caps) and creates the relationship. So
// this component is purely presentational: it surfaces the pending invite; it
// never links anyone on its own.
const ROLE_COPY = {
  // A parent invited this student to link them (invite.role === 'student').
  student: 'wants to connect so they can follow your writing as your parent or guardian',
  // A student invited this person to be their parent/guardian.
  parent: 'invited you to follow their writing as their parent or guardian',
  // A student added this person as the teacher on one of their assignments.
  teacher: 'invited you to view one of their assignments as their teacher',
}

// A parent-role invite with coparent:true is an account-level co-parent invite
// (a primary parent adding a second parent), not a student inviting their parent.
const COPARENT_COPY = "invited you to join as a co-parent — you'll share their children (current and future), read-only"

function copyFor(inv) {
  if (inv.role === 'parent' && inv.coparent) return COPARENT_COPY
  return ROLE_COPY[inv.role] ?? 'invited you to connect'
}

// readOnly = an admin is remoted into this user, viewing their pending invites to
// troubleshoot ("did my invite land?"). The invites belong to the impersonated
// user, so accepting would run the claim as the WRONG identity — the action is
// suppressed and replaced with a "Pending" marker. View-only, mirrors the
// remote-in view+link posture.
export default function PendingInviteBanner({ invites = [], readOnly = false }) {
  const [dismissed, setDismissed] = useState([])
  const visible = invites.filter(i => !dismissed.includes(i.token))
  if (!visible.length) return null

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
      {visible.map(inv => (
        <div key={inv.token}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl px-5 py-4"
          style={{ backgroundColor: 'var(--surface-spark)', border: '1.5px solid var(--border-accent)' }}>
          <p className="text-sm" style={{ color: 'var(--text-strong)', margin: 0 }}>
            <span style={{ fontWeight: 'var(--fw-bold)' }}>{inv.inviterName}</span>{' '}
            {copyFor(inv)}.
          </p>
          {readOnly ? (
            <span className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0 self-start sm:self-auto"
              style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
              Pending · awaiting this user
            </span>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setDismissed(d => [...d, inv.token])}
                className="text-sm font-semibold rounded-full px-3 py-1.5 transition"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border-strong)', background: 'transparent' }}>
                Not now
              </button>
              <a
                href={`/invite?token=${inv.token}`}
                className="text-sm rounded-full px-4 py-1.5 transition hover:opacity-90"
                style={{ fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)', backgroundColor: 'var(--accent)' }}>
                Accept
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
