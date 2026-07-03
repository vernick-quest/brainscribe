'use client'

import { useState } from 'react'

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// Shared user-avatar primitive for every human-account view (parent, teacher,
// admin). Renders the Google profile photo, else an initials circle.
//
// SINGLE fail-closed COPPA gate: the photo shows ONLY when ageBracket is exactly
// '13plus'. Anything else — 'under13', null, undefined, an unexpected value, or a
// broken/blocked photo URL — falls back to initials. Migration 019 nulls stored
// under-13 avatar_urls at the DB level, but the age-declaration write is app-side
// and can lag, so we hard-suppress here regardless of what avatar_url holds. A
// watcher/admin view must never surface a child's photo.
//
// Google's lh3.googleusercontent.com URLs 403 without referrerPolicy="no-referrer"
// and occasionally expire, so onError falls back to initials too.
//
// For an adult's OWN avatar (e.g. a parent's identity card) pass ageBracket="13plus"
// explicitly — the account row may carry no birthdate-derived bracket.
export default function Avatar({ name, avatarUrl, ageBracket, size = 40, className = '', style = {} }) {
  const [failed, setFailed] = useState(false)
  const showPhoto = ageBracket === '13plus' && avatarUrl && !failed

  if (showPhoto) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size, ...style }}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: 'var(--primary)', fontSize: Math.round(size * 0.4), ...style }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  )
}
