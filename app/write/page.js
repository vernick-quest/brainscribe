import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewSessionForm from '@/components/NewSessionForm'
import Navbar from '@/components/Navbar'
import WriteAgeGate from '@/components/WriteAgeGate'

// "Write your own" entry point — lets ANY account (parent/teacher included) start
// their own coach session. Access to the coach is granted by ownership downstream;
// this page just gates on the 13+/consent age check.
export default async function WritePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, age_bracket, coppa_consent_required, coppa_consent_given')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  // Under-13 students must finish parental consent first (same gate as elsewhere).
  if (profile?.coppa_consent_required && !profile?.coppa_consent_given) redirect('/coppa/pending')

  const ageOk = profile?.age_bracket === '13plus' || profile?.coppa_consent_given === true

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <Navbar user={user} profile={profile} />
      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>Write something yourself</h1>
          <p className="mt-1" style={{ color: 'var(--text-muted)', font: 'var(--type-lead)' }}>
            Same coaches, same flow — start your own piece and talk it through.
          </p>
        </div>
        {ageOk ? <NewSessionForm /> : <WriteAgeGate role={profile?.role} />}
      </main>
    </div>
  )
}
