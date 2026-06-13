import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import NewSessionForm from '@/components/NewSessionForm'
import SessionsList from '@/components/SessionsList'

import ImpersonationBanner from '@/components/ImpersonationBanner'
import Navbar from '@/components/Navbar'
import { getImpersonation } from '@/lib/impersonation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fast-path admin redirect using a minimal query
  const { data: roleCheck } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (roleCheck?.role === 'admin') redirect('/admin')

  const { data: adminProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name, email, coppa_consent_required, coppa_consent_given')
    .eq('id', user.id)
    .single()
  if (profileError) console.error('[dashboard] profile fetch error:', profileError.message)

  // Check for admin impersonation
  const imp = await getImpersonation(adminProfile)
  const targetId = imp?.userId ?? user.id

  // If not impersonating, enforce role redirects
  if (!imp) {
    if (adminProfile?.role === 'parent')  redirect('/parent')
    if (adminProfile?.role === 'teacher') redirect('/teacher')

    // COPPA guard: under-13 students must complete parental consent
    if (adminProfile?.coppa_consent_required && !adminProfile?.coppa_consent_given) {
      redirect('/coppa/pending')
    }
  }

  // Fetch profile for the target user (self or impersonated)
  const service = imp ? createServiceClient() : supabase
  const { data: profile } = await service.from('profiles').select('*').eq('id', targetId).single()

  const { data: sessions } = await service
    .from('sessions')
    .select('id, assignment_text, status, persona, created_at, updated_at, title, subject, subject_custom_label')
    .eq('student_id', targetId)
    .order('updated_at', { ascending: false })

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      {imp && <ImpersonationBanner name={imp.name} role={imp.role} />}

      <Navbar user={user} profile={adminProfile} />

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>Hey, {firstName}! 👋</h1>
          <p className="mt-1" style={{ color: 'var(--text-muted)', font: 'var(--type-lead)' }}>What are we writing today? Add your assignment, pick the coach who fits it best, and we'll take it from there.</p>
        </div>

        {/* Hide new session form when impersonating — admin shouldn't create sessions for other users */}
        {!imp && <NewSessionForm />}

        <SessionsList sessions={sessions ?? []} />

      </main>
    </div>
  )
}
