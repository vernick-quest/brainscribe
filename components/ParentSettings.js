'use client'

import { useState } from 'react'
import Navbar from '@/components/Navbar'
import ProfileForm from '@/components/ProfileForm'
import Avatar from '@/components/Avatar'
import BirthdateField from '@/components/BirthdateField'
import AddChildForm from '@/components/AddChildForm'
import AddCoParentForm from '@/components/AddCoParentForm'
import UnlinkChildButton from '@/components/UnlinkChildButton'
import Icon from '@/components/Icon'

const ROLE_LABELS = {
  student: 'Student',
  parent: 'Parent / Guardian',
  teacher: 'Teacher',
  admin: 'Admin',
}

// ── Read-only identity card (shown when an admin is impersonating) ──────
// ProfileForm edits the *authenticated* user, so it would mis-target the admin
// while remoting in — show the impersonated parent's details read-only instead.
function IdentityCard({ profile }) {
  const name = profile?.full_name ?? profile?.email ?? 'Parent'
  const role = ROLE_LABELS[profile?.role] ?? profile?.role ?? '—'
  return (
    <div className="flex items-center gap-4">
      {/* Parent's own identity card: an adult self-view, so pass '13plus' to keep
          the photo — the parent row may carry no birthdate-derived age_bracket. */}
      <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} ageBracket="13plus" size={64} />
      <div className="min-w-0">
        <p className="font-bold text-base truncate" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
          {name}
        </p>
        {profile?.email && (
          <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{profile.email}</p>
        )}
        <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 inline-block mt-1.5"
          style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
          {role}
        </span>
      </div>
    </div>
  )
}

// ── One linked child row ───────────────────────────────────────────────
function ChildRow({ child, viewerId, impersonating }) {
  const firstName = child.full_name?.split(' ')[0] ?? 'your student'
  return (
    <div className="rounded-2xl px-5 py-4 space-y-3"
      style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>

      <div className="flex items-center gap-4">
        <Avatar name={child.full_name} avatarUrl={child.avatar_url} ageBracket={child.age_bracket} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate" style={{ color: 'var(--text-strong)' }}>{child.full_name ?? 'Student'}</p>
          {child.email && (
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{child.email}</p>
          )}
        </div>
        <a href={`/profile/${child.id}`}
          className="shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 transition"
          style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          View profile →
        </a>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1"
        style={{ borderTop: '1px solid var(--border-default)' }}>
        <div className="pt-3">
          <BirthdateField studentId={child.id} birthdate={child.birthdate} label={`${firstName}'s birthday`} readOnly={child.canEditBirthdate === false} />
        </div>
        <div className="pt-3">
          <UnlinkChildButton studentId={child.id} watcherId={viewerId} childName={firstName} />
        </div>
      </div>

    </div>
  )
}

// ── One pending (unclaimed) child invite ───────────────────────────────
// Shows a parent that "Add a child" worked and is waiting on the child, and lets
// them re-copy the link to share again. The child is linked only once they open
// this link and sign in with the invited email.
function PendingInviteRow({ invite }) {
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [gone, setGone] = useState(false)
  const expired = invite.expires_at && new Date(invite.expires_at) < new Date()

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/invite?token=${invite.token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function remove() {
    setRemoving(true)
    const res = await fetch(`/api/invites/${invite.id}`, { method: 'DELETE' })
    if (res.ok) setGone(true)
    else setRemoving(false)
  }

  if (gone) return null

  return (
    <div className="rounded-2xl px-5 py-4 flex items-center gap-4"
      style={{ backgroundColor: 'var(--surface-muted)', border: '1px dashed var(--border-strong)' }}>
      <span className="shrink-0 flex items-center justify-center rounded-full"
        style={{ width: 40, height: 40, backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
        <Icon name="mail" size={18} style={{ color: 'var(--text-subtle)' }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-strong)' }}>{invite.email}</p>
        <p className="text-xs mt-0.5" style={{ color: expired ? 'var(--status-error)' : 'var(--text-muted)' }}>
          {expired ? 'Link expired — generate a new one below' : 'Invited · waiting for them to sign in'}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {!expired && (
          <button onClick={copyLink}
            className="text-xs font-semibold rounded-full px-3 py-1.5 transition"
            style={{ border: '1px solid var(--border-strong)', color: copied ? 'var(--status-success)' : 'var(--text-muted)' }}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        )}
        <button onClick={remove} disabled={removing} aria-label={`Cancel invite to ${invite.email}`}
          className="text-xs font-semibold rounded-full px-3 py-1.5 transition disabled:opacity-50"
          style={{ border: '1px solid var(--border-default)', color: 'var(--status-error)' }}>
          {removing ? '…' : 'Remove'}
        </button>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────
export default function ParentSettings({ user, profile, viewerId, children = [], pendingInvites = [], coParents = [], coparentOf = null, primaryParentName = null, maxChildren = 3, impersonating = false }) {
  const atCap = children.length >= maxChildren
  const isCoParent = !!coparentOf
  const nothingYet = children.length === 0 && pendingInvites.length === 0

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <Navbar user={user} profile={profile} />

      <main className="max-w-xl mx-auto px-6 py-10 space-y-8">

        {/* Heading + back to dashboard */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              Account &amp; children
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Manage your details and the children linked to your account.
            </p>
          </div>
          <a href="/parent"
            className="shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 transition mt-1"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            ← Dashboard
          </a>
        </div>

        {/* Account */}
        <section className="rounded-2xl p-6 space-y-6"
          style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Your account
          </h2>

          {impersonating ? <IdentityCard profile={profile} /> : <ProfileForm profile={profile} user={user} />}

          <div className="pt-2" style={{ borderTop: '1px solid var(--border-default)' }}>
            <div className="pt-4">
              <BirthdateField studentId={viewerId} birthdate={profile?.birthdate} label="Your birthday" />
            </div>
          </div>
        </section>

        {/* Children */}
        <section className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Your children
            </h2>
            <span className="text-xs font-medium" style={{ color: 'var(--text-subtle)' }}>
              {children.length} of {maxChildren} linked
            </span>
          </div>

          {nothingYet && !isCoParent && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No children linked yet. Invite one below — or ask them to invite you from their own dashboard.
            </p>
          )}

          {children.length > 0 && (
            <div className="space-y-3">
              {children.map(child => (
                <ChildRow key={child.id} child={child} viewerId={viewerId} impersonating={impersonating} />
              ))}
            </div>
          )}

          {pendingInvites.length > 0 && (
            <div className="space-y-2">
              {children.length > 0 && (
                <p className="text-[11px] font-bold uppercase tracking-widest pt-1" style={{ color: 'var(--text-subtle)' }}>
                  Pending
                </p>
              )}
              {pendingInvites.map(inv => (
                <PendingInviteRow key={inv.id} invite={inv} />
              ))}
            </div>
          )}

          {/* Co-parents this account has linked (read-only mirrors of these children). */}
          {coParents.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest pt-1" style={{ color: 'var(--text-subtle)' }}>
                Co-parents
              </p>
              {coParents.map(cp => (
                <div key={cp.id} className="rounded-2xl px-5 py-3 flex items-center gap-3"
                  style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
                  <Avatar name={cp.full_name} avatarUrl={cp.avatar_url} ageBracket="13plus" size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-strong)' }}>{cp.full_name ?? cp.email ?? 'Co-parent'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Co-parent · shares your children (read-only)</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isCoParent ? (
            <div className="rounded-2xl px-5 py-4"
              style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                You're a co-parent linked to{' '}
                <span style={{ fontWeight: 'var(--fw-semibold)', color: 'var(--text-strong)' }}>{primaryParentName}</span>.
                Their children appear above — you share them read-only, and a co-parent can't add children.
              </p>
            </div>
          ) : (
            <>
              {atCap ? (
                <div className="flex items-center gap-2 rounded-2xl px-5 py-4"
                  style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
                  <Icon name="alert" size={16} style={{ color: 'var(--text-subtle)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    You've reached the maximum of {maxChildren} linked children. Unlink one to add another.
                  </p>
                </div>
              ) : (
                <AddChildForm />
              )}
              <AddCoParentForm />
            </>
          )}
        </section>

        {/* Sign out — lives here since the Navbar avatar links straight to this
            account page. Hidden while an admin is impersonating (it would sign
            out the admin, not the impersonated parent). */}
        {!impersonating && (
          <div>
            <form action="/api/auth/signout" method="POST">
              <button type="submit"
                className="text-sm font-semibold rounded-full px-4 py-2 transition"
                style={{ color: 'var(--status-error)', border: '1px solid var(--border-default)', backgroundColor: 'transparent' }}>
                Sign out
              </button>
            </form>
          </div>
        )}

      </main>
    </div>
  )
}
