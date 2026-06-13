'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getPersona, PersonaAvatar } from '@/lib/personas'
import { getSubject } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now - date) / 86400000)
  if (diffDays === 0) return 'Today, ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ClientDate({ dateStr, className, style }) {
  const [label, setLabel] = useState('')
  useEffect(() => { setLabel(formatDate(dateStr)) }, [dateStr])
  return <span className={className} style={style}>{label}</span>
}

export default function SessionsList({ sessions: initial }) {
  const [sessions, setSessions] = useState(initial)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const renameInputRef = useRef(null)
  const router = useRouter()

  // Focus the rename field as soon as it appears
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  // Close the open menu when clicking anywhere else
  useEffect(() => {
    if (!openMenuId) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenuId])

  // Close the confirm panel when clicking anywhere else
  useEffect(() => {
    if (!confirmDeleteId) return
    const close = () => setConfirmDeleteId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [confirmDeleteId])

  async function handleDelete(id) {
    setConfirmDeleteId(null)
    setDeletingId(id)
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    setSessions(prev => prev.filter(s => s.id !== id))
    setDeletingId(null)
  }

  async function handleRename(id) {
    const title = renameValue.trim()
    setRenamingId(null)
    if (!title) return
    // Optimistic update
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s))
    await fetch(`/api/sessions/${id}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
  }

  if (!sessions?.length) return null

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-strong)' }}>
        Assignments
      </h2>
      <div className="space-y-2">
        {sessions.map(s => {
          const meta = getPersona(s.persona)
          const displayTitle = s.title || s.assignment_text.slice(0, 70) + (s.assignment_text.length > 70 ? '…' : '')
          const subjectInfo = s.subject && s.subject !== 'unspecified' ? getSubject(s.subject) : null
          const subjectLabel = s.subject === 'other' ? (s.subject_custom_label || 'Other') : subjectInfo?.label
          const isDeleting = deletingId === s.id
          const isRenaming = renamingId === s.id

          return (
            <div key={s.id} className="relative">
              {/* Card */}
              <div
                onClick={() => !isRenaming && openMenuId !== s.id && router.push(`/assignment/${s.id}`)}
                className="rounded-2xl pl-4 pr-10 pt-3 pb-3 transition cursor-pointer select-none"
                style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)', opacity: isDeleting ? 0.4 : 1 }}
                onMouseEnter={e => { if (!isRenaming) e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-xs)'}
              >
                {/* Line 1: Assignment name */}
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(s.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={() => handleRename(s.id)}
                    onClick={e => e.stopPropagation()}
                    className="w-full text-sm font-bold rounded px-1 focus:outline-none border-b-2 mb-1"
                    style={{ color: 'var(--text-strong)', borderColor: 'var(--accent)', backgroundColor: 'transparent' }}
                  />
                ) : (
                  <p className="text-sm font-bold leading-snug mb-1" style={{ color: 'var(--text-strong)' }}>
                    {displayTitle}
                  </p>
                )}

                {/* Line 2: Coach + subject */}
                <span className="text-xs font-medium flex items-center gap-2 mt-0.5 flex-wrap" style={{ color: 'var(--text-muted)', display: 'flex' }}>
                  <span className="flex items-center gap-1.5">
                    <PersonaAvatar personaId={s.persona} size={16} />
                    {meta.name}
                  </span>
                  {subjectInfo && (
                    <>
                      <span style={{ color: 'var(--border-strong)' }}>·</span>
                      <span className="flex items-center gap-1">
                        <SubjectIcon value={s.subject} size={13} style={{ color: 'var(--text-muted)' }} />
                        {subjectLabel}
                      </span>
                    </>
                  )}
                </span>

                {/* Line 3: Last accessed */}
                <ClientDate dateStr={s.updated_at ?? s.created_at}
                  className="text-[11px] mt-0.5 block" style={{ color: 'var(--text-subtle)' }} />
              </div>

              {/* 3-dot vertical menu — anchored to bottom-right of the card */}
              <div className="absolute bottom-3 right-3">
                <button
                  onClick={e => {
                    e.stopPropagation()
                    setOpenMenuId(prev => prev === s.id ? null : s.id)
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-full transition"
                  style={{ color: openMenuId === s.id ? 'var(--accent)' : 'var(--text-subtle)' }}
                  onMouseEnter={e => { if (openMenuId !== s.id) e.currentTarget.style.color = 'var(--text-muted)' }}
                  onMouseLeave={e => { if (openMenuId !== s.id) e.currentTarget.style.color = 'var(--text-subtle)' }}
                  title="More options"
                >
                  {/* Vertical 3-dot icon */}
                  <svg viewBox="0 0 4 18" width="4" height="18" fill="currentColor">
                    <circle cx="2" cy="2"  r="1.6" />
                    <circle cx="2" cy="9"  r="1.6" />
                    <circle cx="2" cy="16" r="1.6" />
                  </svg>
                </button>

                {/* Dropdown menu */}
                {openMenuId === s.id && (
                  <div
                    className="absolute right-0 bottom-8 z-50 rounded-xl py-1 w-36 overflow-hidden"
                    style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-md)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setOpenMenuId(null)
                        setRenameValue(s.title ?? '')
                        setRenamingId(s.id)
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm transition flex items-center gap-2.5"
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ color: 'var(--text-strong)' }}
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
                        <path d="M11.5 2.5l2 2-9 9H2.5v-2l9-9z" strokeLinejoin="round" />
                      </svg>
                      Rename
                    </button>
                    <div className="mx-3 border-t" style={{ borderColor: 'var(--border-default)' }} />
                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenuId(null); setConfirmDeleteId(s.id) }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 transition flex items-center gap-2.5 text-red-500"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}

                {/* Branded inline confirmation — shown instead of browser confirm() */}
                {confirmDeleteId === s.id && (
                  <div
                    className="absolute right-0 bottom-8 z-50 rounded-2xl shadow-xl border overflow-hidden"
                    style={{ backgroundColor: 'var(--text-strong)', borderColor: 'var(--accent)', width: '200px' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-4 pt-3 pb-2">
                      <p className="text-xs font-bold text-white mb-1">Delete assignment?</p>
                      <p className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        This cannot be undone.
                      </p>
                    </div>
                    <div className="flex border-t" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDeleteId(null) }}
                        className="flex-1 py-2.5 text-xs font-semibold transition hover:bg-white/10"
                        style={{ color: 'rgba(255,255,255,0.6)' }}
                      >
                        Cancel
                      </button>
                      <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.15)' }} />
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(s.id) }}
                        className="flex-1 py-2.5 text-xs font-bold transition hover:bg-red-500/20 text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
