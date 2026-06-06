import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewSessionForm from '@/components/NewSessionForm'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, assignment_text, status, created_at')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-indigo-700">Hey, {firstName}! 👋</h1>
            <p className="text-gray-500 text-sm mt-1">Ready to write something great?</p>
          </div>
          <form action="/api/auth/signout" method="POST">
            <button className="text-sm text-gray-400 hover:text-gray-600">Sign out</button>
          </form>
        </header>

        <NewSessionForm />

        {sessions && sessions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Past Sessions</h2>
            <div className="space-y-2">
              {sessions.map(s => (
                <Link
                  key={s.id}
                  href={`/session/${s.id}`}
                  className="block bg-white rounded-xl px-4 py-3 shadow-sm hover:shadow transition border border-gray-100"
                >
                  <p className="text-sm text-gray-800 font-medium truncate">{s.assignment_text.slice(0, 80)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(s.created_at).toLocaleDateString()} · {s.status}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
