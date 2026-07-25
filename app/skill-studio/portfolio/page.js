import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import GymPortfolioView from '@/components/GymPortfolioView'
import { getImpersonation } from '@/lib/impersonation'

// The Skill Studio portfolio. Two audiences, one render:
//   • the student's own work        → /skill-studio/portfolio
//   • a parent viewing their child  → /skill-studio/portfolio?student=<childId>
// (This route was /gym/portfolio before the Skill Studio rename; /gym/ now keeps only a
// ROOT redirect stub, so every link must point at /skill-studio/portfolio.)
// Parent access mirrors assignment sessions (design §The Writing Portfolio: "Parent —
// full access automatically"). RLS on portfolio_entries already grants a parent read
// via the parent-filtered relationships predicate; we additionally verify the link
// server-side so an unlinked ?student= param redirects cleanly instead of rendering empty.

export default async function GymPortfolioPage({ searchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: signedIn } = await supabase
    .from('profiles').select('role, full_name, avatar_url, age_bracket').eq('id', user.id).single()

  // Remote-in: act as the impersonated user, same posture as /parent — the cookie is
  // only honoured for a real admin, and the elevated client is used ONLY on that branch.
  const imp = await getImpersonation(signedIn)
  const db = imp ? createServiceClient() : supabase
  const viewerId = imp?.userId ?? user.id
  const viewerRole = imp?.role ?? signedIn?.role
  const { data: viewer } = imp
    ? await db.from('profiles').select('role, full_name, avatar_url, age_bracket').eq('id', viewerId).single()
    : { data: signedIn }

  const params = await searchParams
  const requested = params?.student ?? null
  const viewingChild = requested && requested !== viewerId

  let targetId = viewerId
  let childName = null

  if (viewingChild) {
    // Authorize: a linked PARENT (or an admin) may view this student's portfolio.
    // Role-filtered on purpose — teachers also appear in `relationships`, but gym
    // visibility for a teacher is grant-only (migration 025's RLS says the same), so a
    // bare watcher link must not open the portfolio.
    const { data: rel } = await db
      .from('relationships').select('student_id').eq('watcher_id', viewerId).eq('student_id', requested).maybeSingle()
    const authorized = viewerRole === 'admin' || (viewerRole === 'parent' && !!rel)
    if (!authorized) redirect('/parent')
    targetId = requested
    const { data: childProfile } = await createServiceClient()
      .from('profiles').select('full_name').eq('id', targetId).single()
    childName = childProfile?.full_name?.split(' ')[0] ?? 'your student'
  }

  // Entries are read with the CALLER's client, so RLS stays the real boundary: a parent
  // reads through the parent-filtered predicate and anyone unlinked gets nothing even if
  // they somehow reached this line. (An admin who is NOT remoting in has no RLS arm on
  // portfolio_entries and so sees an empty list — remote in as the parent instead.)
  const { data: entries } = await db
    .from('portfolio_entries')
    .select('id, skill_key, skill_label, tier, entry_type, content, self_assessment, created_at')
    .eq('student_id', targetId)
    .order('created_at', { ascending: false })

  const backHref = viewingChild ? '/parent' : '/skill-studio'
  const backLabel = viewingChild ? '← Back to dashboard' : '← Back to Skill Studio'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}
      <Navbar user={user} profile={viewer} />
      <main style={{ maxWidth: 'var(--width-prose)' }} className="mx-auto px-6 py-10">
        <a href={backHref} style={{ font: 'var(--type-meta)', color: 'var(--text-link)', fontWeight: 'var(--fw-semibold)' }}>{backLabel}</a>
        <GymPortfolioView
          entries={entries ?? []}
          heading={viewingChild ? `${childName}'s portfolio` : 'Your portfolio'}
          subheading={viewingChild
            ? `Everything ${childName} has made in Skill Studio — proof of how their writing is growing.`
            : "Everything you've made in Skill Studio — proof of how your writing is growing."}
          emptyText={viewingChild
            ? `${childName}'s portfolio will fill up as they finish practice sessions.`
            : 'Your portfolio will fill up as you finish practice sessions.'}
          selfAssessmentPrefix={viewingChild ? `In ${childName}'s words:` : 'In your words:'}
        />
      </main>
    </div>
  )
}
