'use client'

import { useState } from 'react'

function initials(name) {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// Student avatar for watcher (teacher/parent) views.
// Shows the Google profile photo ONLY for students aged 13+ — under-13 accounts
// always fall back to initials, never their photo (COPPA data-minimization).
// Age is read-only here; it's set by the student or parent, never a watcher.
// A broken/blocked photo URL also falls back to initials.
export default function StudentAvatar({ name, avatarUrl, ageBracket, size = 44 }) {
  const [imgFailed, setImgFailed] = useState(false)
  const showPhoto = ageBracket === '13plus' && avatarUrl && !imgFailed

  if (showPhoto) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: 'var(--primary)', fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </div>
  )
}
