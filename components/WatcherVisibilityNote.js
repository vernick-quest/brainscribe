'use client'

import Icon from '@/components/Icon'

// WatcherVisibilityNote — the ambient "linked adults can read this" indicator.
//
// WHY (docs/specs/brainscribe-child-safety-redteam-spec.md, BUILD 3):
// A student should never disclose something under a false assumption of privacy.
// Linked parents/teachers can read this transcript. This surfaces that fact
// PASSIVELY and PERSISTENTLY — it is deliberately NOT a modal and NOT triggered by
// a disclosure. A privacy warning that pops up the moment a kid says something
// heavy teaches them the coach is watching and to stay quiet; a calm, always-present
// line just sets honest expectations up front.
//
// Shown only when ≥1 adult can actually read this session (linked parent via
// `relationships`, or a teacher on this assignment). Zero watchers → nothing to
// disclaim, so it stays hidden (admin trust-and-safety review is covered by the
// privacy policy, not this line).
export default function WatcherVisibilityNote({ watcherCount = 0, className = '' }) {
  if (!watcherCount || watcherCount < 1) return null

  const who = watcherCount === 1 ? 'A linked adult' : `${watcherCount} linked adults`

  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${className}`}
      style={{ color: 'var(--text-subtle)' }}
    >
      <Icon name="eye" size={13} style={{ flexShrink: 0 }} />
      <span>{who} (your parent or teacher) can read this session.</span>
    </div>
  )
}
