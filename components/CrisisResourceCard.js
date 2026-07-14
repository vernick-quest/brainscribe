'use client'

import { resourcesForCountry, CARD_INTRO, CARD_FOOTER } from '@/lib/safetyResources'

// CrisisResourceCard — the out-of-band, STUDENT-ONLY safety card.
//
// SAFETY CONTRACT (docs/specs/brainscribe-child-safety-redteam-spec.md):
//  • Rendered CLIENT-SIDE ONLY, from local React state in the writing session.
//  • It is NEVER persisted: not to `messages`, not to the scaffold, not to any
//    API. A linked parent/teacher reading the transcript can never see that this
//    card appeared — because the person a child needs protection from may be the
//    linked adult. Do not add any network call or analytics event here that could
//    make the disclosure observable to a watcher.
//  • Dismissible and non-blocking: it must not trap the student or force a choice
//    (that reads as alarming/punitive). Writing continues underneath.
//  • `country` (from the edge geo header, read at render only — never stored)
//    picks the local resource set; unknown → US default, always + findahelpline.
//
// It's presentational: the parent component owns when to show/hide it.
export default function CrisisResourceCard({ onDismiss, country = null }) {
  const resources = resourcesForCountry(country)
  return (
    <div
      role="complementary"
      aria-label="Support resources"
      className="rounded-2xl p-5 space-y-3"
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1.5px solid var(--border-accent)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div className="flex items-start gap-2.5">
        <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--text-strong)' }}>
          {CARD_INTRO}
        </p>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Close support resources"
            className="shrink-0 rounded-lg leading-none px-1.5 py-0.5 transition"
            style={{ color: 'var(--text-muted)', fontSize: 18 }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-muted)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            ×
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {resources.map(r => (
          <li
            key={r.id}
            className="rounded-xl px-3.5 py-2.5"
            style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {resourceAction(r)}
            </p>
            <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
              {r.detail}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-xs leading-snug" style={{ color: 'var(--text-subtle)' }}>
        {CARD_FOOTER}
      </p>
    </div>
  )
}

// Turn a resource into an actionable label. On a phone the tel:/sms: links dial;
// on desktop they're still readable text. External links (findahelpline, NCMEC
// report) open in a new tab. No tracking params, ever — and no auto-fired request:
// every link is user-initiated navigation, so the card still makes zero network
// calls on render (a watcher can never observe that it appeared).
function resourceAction(r) {
  if (r.tel) {
    return <a href={`tel:${r.tel}`} style={{ color: 'var(--accent-text)' }}>{r.label}</a>
  }
  if (r.sms) {
    const href = r.smsBody ? `sms:${r.sms}?&body=${encodeURIComponent(r.smsBody)}` : `sms:${r.sms}`
    return <a href={href} style={{ color: 'var(--accent-text)' }}>{r.label}</a>
  }
  if (r.url) {
    return <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>{r.label}</a>
  }
  return r.label
}
