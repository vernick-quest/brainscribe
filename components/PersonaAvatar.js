'use client'

import { useState } from 'react'
import { getPersona } from '@/lib/personas'
import { getCoachColor } from '@/lib/coachColors'

// Shared coach-avatar primitive for every coach view (picker, folder, transcript,
// onboarding, admin roster, teacher view, live session). Renders the coach's
// illustration (public/coaches/{asset}.png), circular-cropped, with the coach's
// `base` color as a thin ring.
//
// IMPORTANT: coaches are FICTIONAL personas, not children — there is NO COPPA photo
// gate here (that lives in components/Avatar.js and applies only to real human
// photos). Coach illustrations always render regardless of ageBracket.
//
// Robustness: if the image is missing or fails to load (onError), fall back to the
// initials-on-`base` circle — never a blank avatar. Mirrors the Avatar.js
// useState(failed) pattern.
//
// Asset-key note: the persona key `matilda` maps to the asset/color key `tilly`
// (Tilly's file is /coaches/tilly.png). getPersona resolves the persona and its
// `asset` field carries the correct color/image key; unknown ids resolve to Owen.
export function PersonaAvatar({ personaId, size = 32, className = '' }) {
  const [failed, setFailed] = useState(false)
  const p = getPersona(personaId)
  const assetKey = p.asset
  const { base } = getCoachColor(assetKey)

  if (!failed) {
    return (
      <img
        src={`/coaches/${assetKey}.png`}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          boxShadow: `0 0 0 2px ${base}`,
        }}
        onError={() => setFailed(true)}
      />
    )
  }

  // Fallback: initials on the coach `base`, white text (matches the old avatar).
  return (
    <span
      className={`rounded-full font-bold text-white shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: base,
        fontSize: size * 0.4,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        boxShadow: 'var(--shadow-xs)',
      }}
      aria-hidden="true"
    >
      {p.initial}
    </span>
  )
}
