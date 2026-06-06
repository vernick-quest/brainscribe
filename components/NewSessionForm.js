'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewSessionForm() {
  const [assignment, setAssignment] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!assignment.trim()) return
    setLoading(true)

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentText: assignment }),
    })
    const session = await res.json()
    router.push(`/session/${session.id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <h2 className="font-semibold text-gray-700">Start a new session</h2>
      <textarea
        value={assignment}
        onChange={e => setAssignment(e.target.value)}
        placeholder="Paste your writing assignment here…"
        rows={4}
        className="w-full text-sm rounded-xl border border-gray-200 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
        required
      />
      <button
        type="submit"
        disabled={loading || !assignment.trim()}
        className="w-full bg-indigo-600 text-white font-semibold rounded-xl py-3 hover:bg-indigo-700 transition disabled:opacity-50"
      >
        {loading ? 'Starting…' : 'Start writing with BrainScribe'}
      </button>
    </form>
  )
}
