'use client'

import { useState } from 'react'

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// Shared avatar primitive: a user's Google photo with a blue-initial fallback.
//
// COPPA data-minimization: an under-13 account NEVER renders a photo — initials
// only — regardless of any avatar_url still on the row. Migration 019 nulls
// stored under-13 avatar_urls, but we guard here too so the rule holds even
// before it's applied and for any future re-population. Only 'under13' is
// suppressed; unknown/null age and '13plus' render the photo when present.
export default function UserAvatar({ name, avatarUrl, ageBracket, size = 40, className = '', style = {} }) {
  const [error, setError] = useState(false)
  const showPhoto = avatarUrl && ageBracket !== 'under13' && !error

  if (showPhoto) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size, ...style }}
        referrerPolicy="no-referrer"
        onError={() => setError(true)}
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
