'use client'

import { useState } from 'react'
import Icon from '@/components/Icon'

// Print + Copy-link affordances for the finished-assignment transcript.
// Print drives the browser's native "Save as PDF" (our de-facto export); the
// @media print block in globals.css strips chrome and flattens the cards.
// Copy link copies the CANONICAL transcript URL to the clipboard — this page is
// RLS-protected, so the link only resolves for the student and their already-
// linked parent/teacher. It is NOT a public share token, so it stays COPPA-safe.
// We deliberately copy rather than invoke navigator.share: the OS share sheet is
// pointless for a private link (arbitrary recipients can't open it) and on
// desktop it surprises a button labelled "Copy link".
export default function TranscriptToolbar() {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard blocked (e.g. insecure context) — nothing graceful to do
    }
  }

  const btn = 'no-print inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3.5 py-2 transition-colors'

  return (
    <div className="no-print flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={copyLink}
        className={btn}
        style={{ color: 'var(--text-body)', border: '1px solid var(--border-strong)' }}
        aria-label="Copy a link to this transcript"
      >
        <Icon name={copied ? 'check' : 'link'} size={14} />
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className={btn}
        style={{ color: 'var(--text-body)', border: '1px solid var(--border-strong)' }}
        aria-label="Print or save this transcript as a PDF"
      >
        <Icon name="printer" size={14} />
        Print / PDF
      </button>
    </div>
  )
}
