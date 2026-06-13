import React from 'react'
import { Button } from '../core/Button.jsx'
import { Badge } from '../core/Badge.jsx'

function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style')
    el.id = id
    el.textContent = css
    document.head.appendChild(el)
  }
}

const CSS = `
.bs-scribe {
  font-family: var(--font-sans);
  background: var(--surface-spark);
  border: 1.5px solid var(--border-accent);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex; flex-direction: column; gap: var(--space-4);
}
.bs-scribe__head { display: flex; align-items: center; gap: 10px; }
.bs-scribe__eyebrow { font-size: var(--text-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: var(--tracking-caps); color: var(--orange-700); }
.bs-scribe__note { font-size: var(--text-sm); color: var(--amber-500); background: var(--status-thin-bg); border-radius: var(--radius-sm); padding: 9px 13px; }
.bs-scribe__para { font-size: var(--text-md); line-height: var(--leading-relaxed); color: var(--text-body); margin: 0; }
.bs-scribe__edit { font-family: var(--font-sans); font-size: var(--text-md); line-height: var(--leading-relaxed); color: var(--text-body); width: 100%; box-sizing: border-box; border: 1.5px solid var(--border-accent); border-radius: var(--radius-md); padding: 12px 14px; resize: vertical; min-height: 110px; }
.bs-scribe__edit:focus { outline: none; box-shadow: var(--focus-ring); }
.bs-scribe__actions { display: flex; gap: 10px; align-items: center; }
`

/** Review card for a freshly scribed paragraph before it joins the essay. */
export function ScribePreview({
  paragraph, isThin = false, thinNote, onApprove, onEdit, onDiscard,
}) {
  useStyle('bs-scribe', CSS)
  const [editing, setEditing] = React.useState(false)
  const [text, setText] = React.useState(paragraph)

  React.useEffect(() => { setText(paragraph) }, [paragraph])

  return (
    <div className="bs-scribe">
      <div className="bs-scribe__head">
        <span className="bs-scribe__eyebrow">Scribed paragraph — your review</span>
        {isThin && <Badge tone="thin">Thin</Badge>}
      </div>

      {isThin && thinNote && <p className="bs-scribe__note">{thinNote}</p>}

      {editing ? (
        <textarea className="bs-scribe__edit" value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <p className="bs-scribe__para">{paragraph}</p>
      )}

      <div className="bs-scribe__actions">
        {editing ? (
          <>
            <Button variant="primary" onClick={() => { onEdit && onEdit(text); setEditing(false) }}>Save edits</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={onApprove}>Add to essay</Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={onDiscard}>Discard</Button>
          </>
        )}
      </div>
    </div>
  )
}
