'use client'

export default function CopyButton({ text }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text)}
      className="text-xs font-medium hover:underline"
      style={{ color: 'var(--accent)' }}
    >
      Copy
    </button>
  )
}
