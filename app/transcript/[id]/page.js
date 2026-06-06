import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function TranscriptPage({ params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Fetch session — RLS will enforce access (student owns, or watcher via relationship)
  const { data: session } = await supabase
    .from('sessions')
    .select('*, profiles(full_name)')
    .eq('id', id)
    .single()

  if (!session) redirect('/dashboard')

  const { data: paragraphs } = await supabase
    .from('paragraphs')
    .select('*')
    .eq('session_id', id)
    .order('position')

  const { data: messages } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('session_id', id)
    .order('created_at')

  const essay = paragraphs?.map(p => p.scribed_text).join('\n\n') ?? ''

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-indigo-700">Session Transcript</h1>
          <p className="text-sm text-gray-500 mt-1">
            {session.profiles?.full_name ?? 'Student'} · {new Date(session.created_at).toLocaleDateString()}
          </p>
        </div>

        <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-700">Assignment</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{session.assignment_text}</p>
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">Final Essay</h2>
            {essay && (
              <button
                onClick={() => navigator.clipboard.writeText(essay)}
                className="text-xs text-indigo-600 hover:underline"
              >
                Copy
              </button>
            )}
          </div>
          {paragraphs?.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No paragraphs yet.</p>
          ) : (
            <div className="space-y-4">
              {paragraphs?.map((p, i) => (
                <div key={i}>
                  <p className={`text-sm leading-relaxed ${p.is_thin ? 'text-gray-500' : 'text-gray-800'}`}>
                    {p.scribed_text}
                  </p>
                  {p.is_thin && (
                    <p className="text-xs text-amber-500 mt-1 italic">Thin paragraph — student was building on this idea</p>
                  )}
                  {profile?.role !== 'student' && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-400 cursor-pointer">Raw spoken text</summary>
                      <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded p-2">{p.raw_spoken_text}</p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {profile?.role !== 'student' && (
          <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">Session Dialogue</h2>
            <div className="space-y-3">
              {messages?.map((m, i) => (
                <div key={i} className={`text-sm ${m.role === 'assistant' ? 'text-indigo-700' : 'text-gray-700'}`}>
                  <span className="font-medium">{m.role === 'assistant' ? 'Tutor' : 'Student'}:</span>{' '}
                  {m.content}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
