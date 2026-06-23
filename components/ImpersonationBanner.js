'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Icon from '@/components/Icon'

export default function ImpersonationBanner({ name, role }) {
  const router = useRouter()
  const [exiting, setExiting] = useState(false)

  async function handleExit() {
    setExiting(true)
    const res = await fetch('/api/admin/impersonate', { method: 'DELETE' })
    const { dest } = await res.json()
    window.location.href = dest
  }

  const roleLabel = role?.charAt(0).toUpperCase() + role?.slice(1)

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-4 px-5 py-2.5"
      style={{ backgroundColor: '#C0271E', color: 'white' }}>
      <div className="flex items-center gap-2 text-sm">
        <Icon name="eye" size={14} />
        <span>
          Viewing as <strong>{name ?? 'Unknown'}</strong>
          {role && <span className="ml-1 opacity-75">({roleLabel})</span>}
        </span>
        <span className="opacity-50 mx-1">—</span>
        <span className="text-xs opacity-75">Dev impersonation mode</span>
      </div>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="text-xs font-bold px-3 py-1 rounded-full transition"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.3)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
      >
        {exiting ? 'Exiting…' : '✕ Exit'}
      </button>
    </div>
  )
}
