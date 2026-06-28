'use client'

import Navbar from '@/components/Navbar'
import ProfileForm from '@/components/ProfileForm'
import UserAvatar from '@/components/UserAvatar'
import BirthdateField from '@/components/BirthdateField'
import AddChildForm from '@/components/AddChildForm'
import UnlinkChildButton from '@/components/UnlinkChildButton'
import CoParentInviteForm from '@/components/CoParentInviteForm'
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
      <UserAvatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={64} />
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
  // The co-parent invite posts as the authenticated user, so it can't work while
  // an admin is remoting in (the guardian check is against the real caller) —
  // hide it in that case rather than offer a button that would 403.
  const showCoParent = child.canAddCoParent && !impersonating
  return (
    <div className="rounded-2xl px-5 py-4 space-y-3"
      style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>

      <div className="flex items-center gap-4">
        <UserAvatar name={child.full_name} avatarUrl={child.avatar_url} ageBracket={child.age_bracket} size={40} />
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

      {showCoParent && (
        <div className="pt-1">
          <CoParentInviteForm childId={child.id} childName={firstName} />
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────
export default function ParentSettings({ user, profile, viewerId, children = [], maxChildren = 3, impersonating = false }) {
  const atCap = children.length >= maxChildren

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

          {children.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No children linked yet. Invite one below — or ask them to invite you from their own dashboard.
            </p>
          ) : (
            <div className="space-y-3">
              {children.map(child => (
                <ChildRow key={child.id} child={child} viewerId={viewerId} impersonating={impersonating} />
              ))}
            </div>
          )}

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
        </section>

      </main>
    </div>
  )
}
