'use client'

import { useState, useRef, useEffect } from 'react'
import { SUBJECTS } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'

// Chevron — matches brand stroke style
function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--text-subtle)' }}>
      <path d="M6 9l6 6 6-6"/>
    </svg>
  )
}

export default function SubjectPicker({ value, onChange, customLabel, onCustomLabelChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = value && value !== 'unspecified'
    ? SUBJECTS.find(s => s.value === value) ?? null
    : null

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="space-y-2">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition"
        style={{
          border: `1.5px solid ${open ? 'var(--border-strong)' : 'var(--border-default)'}`,
          backgroundColor: 'var(--surface-card)',
          color: selected ? 'var(--text-strong)' : 'var(--text-subtle)',
        }}
      >
        <SubjectIcon
          value={selected?.value ?? 'unspecified'}
          size={16}
          style={{ color: selected ? 'var(--accent)' : 'var(--text-subtle)', flexShrink: 0 }}
        />
        <span className="flex-1 truncate">
          {selected ? selected.label : 'Select a subject…'}
        </span>
        <Chevron open={open} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-30 rounded-2xl overflow-hidden"
          style={{
            width: 'calc(100% - 3rem)',
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: 296,
            overflowY: 'auto',
          }}
        >
          {/* Clear / not specified */}
          <button
            type="button"
            onClick={() => { onChange('unspecified'); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition"
            style={{ color: 'var(--text-subtle)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            <span>Not specified</span>
          </button>

          <div style={{ height: 1, backgroundColor: 'var(--border-default)', margin: '0 16px' }} />

          {SUBJECTS.map(s => {
            const isSelected = value === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => { onChange(s.value); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition"
                style={{
                  backgroundColor: isSelected ? 'var(--surface-muted)' : 'transparent',
                  color: isSelected ? 'var(--text-strong)' : 'var(--text-body)',
                  fontWeight: isSelected ? 600 : 400,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--surface-muted)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <SubjectIcon
                  value={s.value}
                  size={16}
                  style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}
                />
                <span className="flex-1">{s.label}</span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ color: 'var(--accent)', flexShrink: 0 }}>
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* "Other" free-text */}
      {value === 'other' && (
        <input
          type="text"
          placeholder="What class is this for?"
          value={customLabel || ''}
          onChange={e => onCustomLabelChange(e.target.value)}
          className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 transition"
          style={{
            border: '1px solid var(--border-default)',
            backgroundColor: 'var(--surface-card)',
            color: 'var(--text-strong)',
            '--tw-ring-color': 'var(--ring)',
          }}
        />
      )}
    </div>
  )
}
