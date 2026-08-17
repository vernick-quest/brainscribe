import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAllPosts, getPostBySlug } from '@/lib/blog'
import { selectRecipients, unsubscribeUrl } from '@/lib/blogMail'
import { sendBlogPost } from '@/lib/notifications'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/blog-send  → { posts, subscriberCount, sent }
// POST /api/admin/blog-send  → { slug, confirm } — mails a published post
//
// The blog form promised "we'll send new posts as they go up" from the day it shipped,
// and until now nothing sent one. This is deliberately MANUAL: an admin picks a
// published post and sends it. An automated pipeline is a bigger thing to get wrong,
// and the promise only requires that posts actually reach people.
//
// Two guards that matter more than the feature:
//   * `blog_sends.slug` is a PRIMARY KEY, so a double-click raises a unique violation
//     instead of mailing everyone twice. The row is written BEFORE any mail goes out.
//   * Nothing sends without an unsubscribe URL (lib/notifications refuses), and rule 0
//     in lib/subscriberRetention.js keeps the suppression record forever.
// ─────────────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 }
  return { user }
}

async function loadRows(service) {
  const { data, error } = await service
    .from('subscribers').select('email, source, unsubscribed_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const service = createServiceClient()
  try {
    const rows = await loadRows(service)
    const { recipients, skipped } = selectRecipients(rows)
    const { data: sends } = await service
      .from('blog_sends').select('slug, sent_at, recipient_count').order('sent_at', { ascending: false })
    const sentSlugs = new Set((sends ?? []).map(s => s.slug))
    return NextResponse.json({
      // Published only — a future-dated post is not live yet, and mailing a link to a
      // 404 is worse than not mailing at all.
      posts: getAllPosts().map(p => ({
        slug: p.slug, title: p.title, date: p.date, sent: sentSlugs.has(p.slug),
      })),
      recipientCount: recipients.length,
      skipped,
      sends: sends ?? [],
    })
  } catch (e) {
    console.error('[blog-send] load failed:', e?.message ?? e)
    return NextResponse.json({ error: 'Could not load the mailing state.' }, { status: 500 })
  }
}

export async function POST(request) {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const slug = String(body?.slug ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'A post slug is required.' }, { status: 400 })

  const post = getPostBySlug(slug)
  if (!post) return NextResponse.json({ error: 'No published post with that slug.' }, { status: 404 })

  const service = createServiceClient()
  try {
    const rows = await loadRows(service)
    const { recipients, skipped } = selectRecipients(rows)

    // Dry run by default. Bulk mail is irreversible, so seeing the real number and the
    // real skip reasons has to be possible WITHOUT sending.
    if (!body?.confirm) {
      return NextResponse.json({ dryRun: true, slug, title: post.title, recipientCount: recipients.length, skipped })
    }
    if (!recipients.length) {
      return NextResponse.json({ error: 'Nobody is subscribed to blog posts yet.' }, { status: 400 })
    }

    // CLAIM THE SLUG FIRST. The primary key is the idempotency guard, and it only
    // guards if the row lands before the mail does — claim-then-send can at worst fail
    // to send, while send-then-claim can mail the whole list twice.
    const { error: claimErr } = await service
      .from('blog_sends')
      .insert({ slug, recipient_count: recipients.length, sent_by: gate.user.id })
    if (claimErr) {
      if (claimErr.code === '23505') {
        return NextResponse.json({ error: `"${slug}" has already been mailed. Nothing was sent.` }, { status: 409 })
      }
      return NextResponse.json({ error: `Could not record the send: ${claimErr.message}` }, { status: 500 })
    }

    // Sequential on purpose: this list is small, and a burst is the fastest way to a
    // deliverability problem on a domain that has never sent bulk mail before.
    let sent = 0
    const failed = []
    for (const to of recipients) {
      const ok = await sendBlogPost({ to, post, unsubscribeUrl: unsubscribeUrl(to) })
      ok ? sent++ : failed.push(to)
    }
    if (failed.length) console.error(`[blog-send] ${failed.length} of ${recipients.length} failed for "${slug}"`)

    // Record what ACTUALLY went out, not what we intended to send.
    await service.from('blog_sends').update({ recipient_count: sent }).eq('slug', slug)

    return NextResponse.json({ ok: true, slug, title: post.title, sent, failed: failed.length, skipped })
  } catch (e) {
    console.error('[blog-send] failed:', e?.message ?? e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
