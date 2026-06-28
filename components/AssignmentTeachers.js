'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import InviteTeacherForm from '@/components/InviteTeacherForm'

// Teacher access for one assignment (session), managed from the parent dashboard:
// shows who's added, lets the parent remove them, and reuses InviteTeacherForm to
// add more. Removal goes through the guarded endpoint so it also works under admin
// remote-in; the add path is the normal teacher-invite link.
export default function AssignmentTeachers({ sessionId, teachers = [] }) {
  const router = useRouter()
  const [removing, setRemoving] = useState(null)
  const [error, setError] = useState('')

  async function removeTeacher(teacherId) {
    setRemoving(teacherId)
    setError('')
    const res = await fetch('/api/assignment-teachers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, teacherId }),
    })
    const json = await res.json().catch(() => ({}))
    setRemoving(null)
    if (!res.ok || json.error) {
      setError(json.error ?? 'Could not remove that teacher.')
      return
    }
    router.refresh()
  }

  return (
    <div className="pl-2 space-y-2">
      {teachers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {teachers.map(t => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 text-xs rounded-full pl-3 pr-1.5 py-1"
              style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)', color: 'var(--text-body)' }}
            >
              <span className="truncate max-w-[12rem]">{t.full_name || t.email || 'Teacher'}</span>
              <button
                onClick={() => removeTeacher(t.id)}
                disabled={removing === t.id}
                aria-label={`Remove ${t.full_name || t.email || 'this teacher'}`}
                className="w-4 h-4 flex items-center justify-center rounded-full transition disabled:opacity-40"
                style={{ color: 'var(--text-subtle)' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--status-error-bg)'; e.currentTarget.style.color = 'var(--status-error)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-subtle)' }}
              >
                {removing === t.id ? '·' : '×'}
              </button>
            </span>
          ))}
        </div>
      )}

      <InviteTeacherForm assignmentId={sessionId} />

      {error && <p className="text-xs" style={{ color: 'var(--status-error)' }}>{error}</p>}
    </div>
  )
}
