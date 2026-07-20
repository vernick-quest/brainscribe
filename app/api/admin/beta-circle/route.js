import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { BETA_CIRCLE_CAP, maybeGrantBetaCircle } from '@/lib/access'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/beta-circle  → { count, cap, members, candidates, codes }
// POST /api/admin/beta-circle  → { action, ... } admin management actions
//
// The Beta Circle management panel behind /admin → Tools. All reads/writes go
// through the SERVICE role (the gate columns on profiles are service-role territory,
// and access_codes is RLS deny-by-default with no client policies), gated by the
// same requireAdmin() pattern as the rest of /api/admin/*.
//
// The cap + student-only rule is NOT reimplemented here: adds route through
// maybeGrantBetaCircle (lib/access.js), the single source of truth shared with the
// redeem/consent paths. This route is additive admin tooling — it never touches the
// access GATE (/api/sessions, /api/access/redeem, lib/coppa.js).
// ─────────────────────────────────────────────────────────────────────────────

// Copied verbatim from app/api/admin/seed-demo/route.js — never trust the client;
// the admin check is a server-side profiles.role lookup on the authed user.
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 }
  return { user }
}

// How many "not yet in the circle" students to surface for the Add picker. It's a
// picker, not a roster — a generous slice is plenty and keeps the payload bounded.
const CANDIDATE_LIMIT = 200

// Build the full GET-shape payload from live DB state. Reused by GET and returned
// from every successful POST so the client re-paints from authoritative data.
async function loadState(service) {
  const [{ count }, membersRes, candidatesRes, codesRes] = await Promise.all([
    // Live cohort size — the source of truth for the cap (students-only per mig 046).
    service.from('profiles').select('id', { count: 'exact', head: true }).eq('is_beta_circle', true),
    // Members: students currently in the circle, newest first.
    service.from('profiles')
      .select('id, full_name, email, created_at')
      .eq('role', 'student').eq('is_beta_circle', true)
      .order('created_at', { ascending: false }),
    // Candidates: students NOT in the circle — the Add picker's options.
    service.from('profiles')
      .select('id, full_name, email, created_at')
      .eq('role', 'student').eq('is_beta_circle', false)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT),
    // All access codes.
    service.from('access_codes')
      .select('code, label, active, uses, grants_beta_circle')
      .order('created_at', { ascending: true }),
  ])

  return {
    count: count ?? 0,
    cap: BETA_CIRCLE_CAP,
    members: membersRes.data ?? [],
    candidates: candidatesRes.data ?? [],
    codes: codesRes.data ?? [],
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const service = createServiceClient()
  try {
    return NextResponse.json(await loadState(service))
  } catch (e) {
    return NextResponse.json({ error: e.message ?? 'Load failed' }, { status: 500 })
  }
}

export async function POST(request) {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const service = createServiceClient()
  const body = await request.json().catch(() => ({}))
  const action = typeof body?.action === 'string' ? body.action : ''

  try {
    switch (action) {
      // ── add_member ────────────────────────────────────────────────────────
      // Single source of truth for student-only + cap — reuse the grant helper.
      // It returns false for a non-student OR a reached cap; re-derive which so the
      // UI can message it (the helper deliberately collapses both into false).
      case 'add_member': {
        const userId = body?.userId
        if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

        const granted = await maybeGrantBetaCircle(service, userId)
        if (!granted) {
          const { data: prof } = await service
            .from('profiles').select('role, is_beta_circle').eq('id', userId).maybeSingle()
          let reason = 'unknown'
          if (!prof || prof.role !== 'student') reason = 'not_student'
          else if (!prof.is_beta_circle) reason = 'cap_reached'
          // (prof.is_beta_circle === true would have returned granted=true above.)
          return NextResponse.json({ ok: false, reason, ...(await loadState(service)) })
        }
        return NextResponse.json({ ok: true, ...(await loadState(service)) })
      }

      // ── remove_member ─────────────────────────────────────────────────────
      // Frees a slot. Do NOT touch access_granted — leaving the cohort must not
      // revoke coach access.
      case 'remove_member': {
        const userId = body?.userId
        if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

        const { error } = await service
          .from('profiles').update({ is_beta_circle: false }).eq('id', userId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true, ...(await loadState(service)) })
      }

      // ── toggle_code ───────────────────────────────────────────────────────
      // Deactivating pauses new redemptions (the redeem endpoint filters active=true).
      case 'toggle_code': {
        const code = typeof body?.code === 'string' ? body.code.trim().toLowerCase() : ''
        const active = !!body?.active
        if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

        const { error } = await service
          .from('access_codes').update({ active }).eq('code', code)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true, ...(await loadState(service)) })
      }

      // ── create_code ───────────────────────────────────────────────────────
      // Normalize to lowercase; insert active + zero uses; duplicate-safe.
      case 'create_code': {
        const code = typeof body?.code === 'string' ? body.code.trim().toLowerCase() : ''
        const label = typeof body?.label === 'string' ? body.label.trim() : ''
        const grantsBetaCircle = body?.grantsBetaCircle !== false // default true
        if (!code) return NextResponse.json({ error: 'Enter a code.' }, { status: 400 })
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(code)) {
          return NextResponse.json(
            { error: 'Codes use lowercase letters, numbers, hyphen or underscore.' },
            { status: 400 }
          )
        }

        // Duplicate-safe: bail if the code already exists rather than clobbering it.
        const { data: existing } = await service
          .from('access_codes').select('code').eq('code', code).maybeSingle()
        if (existing) {
          return NextResponse.json({ error: `Code “${code}” already exists.` }, { status: 409 })
        }

        const { error } = await service.from('access_codes').insert({
          code,
          label: label || null,
          grants_beta_circle: grantsBetaCircle,
          active: true,
          uses: 0,
        })
        if (error) {
          // Unique-violation race → treat as a friendly duplicate.
          if (error.code === '23505') {
            return NextResponse.json({ error: `Code “${code}” already exists.` }, { status: 409 })
          }
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ ok: true, ...(await loadState(service)) })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action || '(none)'}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e.message ?? 'Request failed' }, { status: 500 })
  }
}
