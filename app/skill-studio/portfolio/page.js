import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { TIER_META } from '@/lib/gymCurriculum'

// Typed portfolio renders — the pair/blueprint shapes ARE the growth evidence, so
// they render structurally, not as flattened text (design §The Writing Portfolio).
// P1 captures what the writing flow produced; P2/P3 add in-session structured pair /
// blueprint capture and the async self-assessment lines.

function EntryBody({ entry }) {
  const c = entry.content ?? {}
  switch (entry.entry_type) {
    case 'pair':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-3" style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-bold)', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>Before</p>
            <p style={{ font: 'var(--type-body)', color: 'var(--text-body)', margin: 0, whiteSpace: 'pre-wrap' }}>{c.before ?? '—'}</p>
          </div>
          <div className="p-3" style={{ background: 'var(--surface-muted)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-bold)', color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>After</p>
            <p style={{ font: 'var(--type-body)', color: 'var(--text-body)', margin: 0, whiteSpace: 'pre-wrap' }}>{c.after ?? '—'}</p>
          </div>
        </div>
      )
    case 'blueprint':
      return Array.isArray(c.sections) && c.sections.length ? (
        <div>
          {c.thesis && <p style={{ font: 'var(--type-body)', color: 'var(--text-strong)', margin: '0 0 8px' }}><strong>Thesis:</strong> {c.thesis}</p>}
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {c.sections.map((s, i) => (
              <li key={i} style={{ font: 'var(--type-body)', color: 'var(--text-body)', marginBottom: 4 }}>
                <strong>{s.label}:</strong> {s.job}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ font: 'var(--type-body)', color: 'var(--text-body)', margin: 0, whiteSpace: 'pre-wrap' }}>{c.text ?? ''}</p>
      )
    case 'multi_paragraph':
      return (
        <div className="flex flex-col gap-3">
          {(c.paragraphs ?? []).map((p, i) => (
            <p key={i} style={{ font: 'var(--type-body)', color: 'var(--text-body)', margin: 0, whiteSpace: 'pre-wrap' }}>{p}</p>
          ))}
          {c.bridge && <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>Bridge: {c.bridge}</p>}
        </div>
      )
    case 'thesis':
      return (
        <div>
          <p style={{ font: 'var(--type-lead)', color: 'var(--text-strong)', margin: '0 0 6px' }}>{c.thesis ?? ''}</p>
          {c.rationale && <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 0 }}>Why it's arguable: {c.rationale}</p>}
        </div>
      )
    default: // paragraph | reflection | placement_warmup | capstone_letter
      return <p style={{ font: 'var(--type-body)', color: 'var(--text-body)', margin: 0, whiteSpace: 'pre-wrap' }}>{c.text ?? c.after ?? ''}</p>
  }
}

export default async function GymPortfolioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name, avatar_url, age_bracket').eq('id', user.id).single()

  const { data: entries } = await supabase
    .from('portfolio_entries')
    .select('id, skill_key, skill_label, tier, entry_type, content, self_assessment, created_at')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })

  const list = entries ?? []

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <Navbar user={user} profile={profile} />
      <main style={{ maxWidth: 'var(--width-prose)' }} className="mx-auto px-6 py-10">
        <a href="/skill-studio" style={{ font: 'var(--type-meta)', color: 'var(--text-link)', fontWeight: 'var(--fw-semibold)' }}>← Back to Skill Studio</a>
        <h1 style={{ font: 'var(--type-title)', color: 'var(--text-strong)', margin: '8px 0 4px' }}>Your portfolio</h1>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', marginBottom: 24 }}>
          Everything you've made in Skill Studio — proof of how your writing is growing.
        </p>

        {list.length === 0 ? (
          <div className="p-8 text-center" style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-default)' }}>
            <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', margin: 0 }}>
              Your portfolio will fill up as you finish practice sessions.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {list.map(entry => {
              const tier = TIER_META[entry.tier] ?? TIER_META[1]
              return (
                <article key={entry.id} className="p-5" style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: tier.color }} aria-hidden="true" />
                    <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)' }}>{entry.skill_label}</span>
                    <span style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', marginLeft: 'auto' }}>
                      {new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <EntryBody entry={entry} />
                  {entry.self_assessment && (
                    <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '12px 0 0', fontStyle: 'italic' }}>
                      In your words: {entry.self_assessment}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
