// app/api/sources/route.js — Research & Citations v1: the sources CRUD.
//
// Stores ONLY structured citation metadata (title/author/publisher/date/url) — never
// source content. RLS (migration 042) scopes every row to the session owner; the
// route additionally re-verifies ownership so a student can only write sources onto a
// session they own. URLs are canonicalized (query/fragment/PII stripped) on the way in.

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { canonicalizeStoredUrl } from '@/lib/ssrf'

const FIELDS = ['title', 'author', 'publisher', 'published_date', 'url']

async function ownsSession(supabase, userId, sessionId) {
  if (!sessionId) return false
  const { data } = await supabase
    .from('sessions').select('id').eq('id', sessionId).eq('student_id', userId).single()
  return !!data
}

// GET /api/sources?sessionId=… — list a session's sources (owner or watcher via RLS).
export async function GET(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (!sessionId) return Response.json({ error: 'Missing sessionId' }, { status: 400 })

  const { data, error } = await supabase
    .from('sources').select('*').eq('session_id', sessionId).order('position')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ sources: data ?? [] })
}

// POST /api/sources — create one source. Body: { sessionId, title, author, publisher,
// published_date, url, origin }. Only the owner may write (RLS + explicit check).
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await checkRateLimit(`sources:${user.id}`, 30, 60)) return rateLimited()

  const body = await request.json().catch(() => ({}))
  const { sessionId } = body
  if (!await ownsSession(supabase, user.id, sessionId)) {
    return Response.json({ error: 'Not found.' }, { status: 404 })
  }

  const row = { session_id: sessionId }
  for (const f of FIELDS) if (typeof body[f] === 'string') row[f] = body[f].trim() || null
  if (row.url) row.url = canonicalizeStoredUrl(row.url)
  row.origin = ['voice', 'typed', 'fetched'].includes(body.origin) ? body.origin : 'typed'

  // A source with nothing in it is not worth a row.
  if (!row.title && !row.url && !row.author) {
    return Response.json({ error: 'Empty source' }, { status: 400 })
  }

  // Append at the end (max position + 1) so the bibliography keeps insertion order.
  const { data: last } = await supabase
    .from('sources').select('position').eq('session_id', sessionId)
    .order('position', { ascending: false }).limit(1).maybeSingle()
  row.position = (last?.position ?? -1) + 1

  const { data, error } = await supabase.from('sources').insert(row).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ source: data })
}

// PATCH /api/sources — edit one source's fields (owner only, via RLS on the row's session).
export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { id } = body
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const update = {}
  for (const f of FIELDS) if (typeof body[f] === 'string') update[f] = body[f].trim() || null
  if (update.url) update.url = canonicalizeStoredUrl(update.url)
  if (!Object.keys(update).length) return Response.json({ error: 'No fields' }, { status: 400 })

  // RLS restricts UPDATE to rows on a session the student owns.
  const { data, error } = await supabase
    .from('sources').update(update).eq('id', id).select().maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Not found.' }, { status: 404 })
  return Response.json({ source: data })
}

// DELETE /api/sources?id=… — remove one source (owner only, via RLS).
export async function DELETE(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase.from('sources').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
