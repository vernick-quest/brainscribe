import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Avatar from '@/components/Avatar'
import ProfileForm from '@/components/ProfileForm'
import WritingProfileCard from '@/components/WritingProfileCard'
import InviteParentForm from '@/components/InviteParentForm'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { getImpersonation } from '@/lib/impersonation'
import { getSubject } from '@/lib/subjects'

export default async function ProfilePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin remote-in: view the IMPERSONATED user's profile (writing profile +
  // linked parents), so an admin troubleshooting sees exactly what the user sees
  // and can link a parent as them. Reads go through the service client; profile
  // EDITS are disabled while impersonating (view + link only — no destructive
  // account changes). Only a real admin's cookie is honoured.
  const { data: actorProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  const imp = await getImpersonation(actorProfile)
  const targetId = imp?.userId ?? user.id
  const db = imp ? createServiceClient() : supabase

  const { data: profile } = await db
    .from('profiles')
    .select('role, full_name, avatar_url, age_bracket, writing_profile_aggregate, phone')
    .eq('id', targetId)
    .single()

  const isStudent = profile?.role === 'student'

  const [
    { count: sessionCount },
    { count: completeCount },
    { data: parents },
    { data: subjectRows },
  ] = await Promise.all([
    isStudent
      ? db.from('sessions').select('id', { count: 'exact', head: true }).eq('student_id', targetId)
      : Promise.resolve({ count: 0 }),
    isStudent
      ? db.from('sessions').select('id', { count: 'exact', head: true }).eq('student_id', targetId).eq('status', 'complete')
      : Promise.resolve({ count: 0 }),
    // Parents connected to this student. Service client: RLS lets the student read
    // the relationship row but NOT the watcher's profile — the student is entitled
    // to see who their linked parent is (name + photo).
    isStudent
      ? createServiceClient().from('relationships').select('watcher_id, created_at, profiles!relationships_watcher_id_fkey(full_name, avatar_url)').eq('student_id', targetId)
      : Promise.resolve({ data: [] }),
    // Count sessions by subject
    isStudent
      ? db.from('sessions').select('subject, subject_custom_label').eq('student_id', targetId)
      : Promise.resolve({ data: [] }),
  ])

  // Cross-assignment aggregate — synthesized at completion, stored on the
  // durable profiles row (not the latest session's per-essay profile).
  const writingProfile = isStudent ? (profile?.writing_profile_aggregate ?? null) : null

  // Build subject breakdown
  const subjectCounts = {}
  for (const s of (subjectRows ?? [])) {
    const key = s.subject === 'other'
      ? (s.subject_custom_label || 'Other')
      : s.subject === 'unspecified' || !s.subject
        ? 'Unspecified'
        : (getSubject(s.subject)?.label ?? s.subject)
    subjectCounts[key] = (subjectCounts[key] ?? 0) + 1
  }
  const subjectBreakdown = Object.entries(subjectCounts)
    .filter(([key]) => key !== 'Unspecified')
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}
      <Navbar user={user} profile={profile} />

      <main className="max-w-xl mx-auto px-6 py-10 space-y-8">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              {imp ? `${profile?.full_name?.split(' ')[0] ?? 'This user'}'s profile` : 'Your profile'}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {imp ? "Viewing as admin — you can link a parent below." : 'Manage your account details.'}
            </p>
          </div>
          {/* Sign out hidden while impersonating (it would sign out the admin). */}
          {!imp && (
            <div className="flex items-center gap-2 shrink-0 mt-1">
              {profile?.role === 'admin' && (
                <a href="/admin"
                  className="text-xs font-semibold rounded-full px-3 py-1.5 transition"
                  style={{ border: '1px solid var(--border-default)', color: 'var(--text-link)' }}>
                  Admin ↗
                </a>
              )}
              <form action="/api/auth/signout" method="POST">
                <button type="submit"
                  className="text-xs font-semibold rounded-full px-3 py-1.5 transition"
                  style={{ border: '1px solid var(--border-default)', color: 'var(--status-error)', background: 'transparent' }}>
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Profile form */}
        <div
          className="rounded-2xl p-6"
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <ProfileForm profile={profile} user={user} impersonating={!!imp} />
        </div>

        {/* Parents section — students only */}
        {isStudent && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Parents
            </h2>

            {parents && parents.length > 0 ? (
              <div className="space-y-3">
                {parents.map(p => {
                  const name = p.profiles?.full_name ?? 'Parent'
                  const linked = p.created_at
                    ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : null
                  return (
                    <div key={p.watcher_id} className="flex items-center gap-3 rounded-xl px-4 py-3"
                      style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
                      {/* Parents are adults → '13plus' surfaces their photo. */}
                      <Avatar name={name} avatarUrl={p.profiles?.avatar_url} ageBracket="13plus" size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-strong)' }}>{name}</p>
                        {linked && (
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Linked {linked}</p>
                        )}
                      </div>
                      <span className="text-xs rounded-full px-2.5 py-1 font-medium shrink-0"
                        style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
                        Connected
                      </span>
                    </div>
                  )
                })}
                <div className="pt-1">
                  <InviteParentForm />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  No parents connected yet. Invite one so they can follow your writing progress.
                </p>
                <InviteParentForm />
              </div>
            )}
          </div>
        )}

        {/* Stats + writing profile — students only */}
        {isStudent && (
          <>
            <div
              className="rounded-2xl p-6 space-y-5"
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Writing stats
              </h2>

              {/* Count tiles */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl p-4 text-center"
                  style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
                  <p className="text-3xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
                    {sessionCount ?? 0}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Assignments started
                  </p>
                </div>
                <div className="rounded-xl p-4 text-center"
                  style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
                  <p className="text-3xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
                    {completeCount ?? 0}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Completed
                  </p>
                </div>
              </div>

              {/* Subject breakdown */}
              {subjectBreakdown.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-subtle)' }}>By subject</p>
                  {subjectBreakdown.map(([label, count]) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: 'var(--surface-muted)' }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.round((count / (sessionCount ?? 1)) * 100)}%`,
                            backgroundColor: 'var(--accent)',
                            opacity: 0.8,
                          }} />
                      </div>
                      <span className="text-xs shrink-0" style={{ color: 'var(--text-body)', minWidth: 80 }}>{label}</span>
                      <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-strong)', minWidth: 20, textAlign: 'right' }}>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className="rounded-2xl p-6"
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <h2 className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: 'var(--text-muted)' }}>
                Writing profile
              </h2>
              <WritingProfileCard
                profile={writingProfile}
                sessionComplete={(completeCount ?? 0) > 0}
                studentName={profile?.full_name?.split(' ')[0] ?? null}
              />
            </div>
          </>
        )}

      </main>
    </div>
  )
}
