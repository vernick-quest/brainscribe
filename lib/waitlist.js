// lib/waitlist.js — who asked for access, and what has actually happened to them.
//
// PURE (no Next/Supabase imports) so the state machine can be tested without a DB.
//
// The trap this exists to avoid: `subscribers` is just "an address typed into a form".
// It is NOT a list of people waiting. Measured 2026-08-16, of the three addresses on
// it, TWO had already signed up and redeemed a code — a queue built on the table alone
// would have shown them as pending and invited people who were already inside. So
// every state below is derived by joining to what the account actually did, and only
// one fact ("we sent them a code") is stored, because nothing else records it.

// Ordered by how far through the funnel someone is. `needsAction` is the only thing
// the admin has to look at; everything else is there so the queue can prove it is
// not hiding someone.
export const WAITLIST_STATES = {
  writing:   { label: 'Writing',    needsAction: false, hint: 'Signed up and has started writing.' },
  signed_up: { label: 'Signed up',  needsAction: false, hint: 'Account created, nothing written yet.' },
  invited:   { label: 'Code sent',  needsAction: false, hint: 'We sent a code; no account yet.' },
  waiting:   { label: 'Waiting',    needsAction: true,  hint: 'Asked for access and has heard nothing.' },
  dismissed: { label: 'Dismissed',  needsAction: false, hint: 'Removed from the queue without an invite.' },
}

// classifySubscriber(row, account)
//   row     — a `subscribers` row: { email, created_at, invited_at, dismissed_at, ... }
//   account — the matching profile, or null. { access_code_used, sessionCount, turnCount }
//
// The account ALWAYS wins over our own bookkeeping: someone can arrive with a code a
// human handed them in person, so "we never emailed them" says nothing about whether
// they got in. Reading the account first is what stops the queue inventing work.
export function classifySubscriber(row = {}, account = null) {
  if (account) {
    return (account.turnCount > 0 || account.sessionCount > 0) ? 'writing' : 'signed_up'
  }
  // Dismissal only applies to someone who never showed up — an account outranks it,
  // so a dismissed address that signs up anyway reappears as a real user, not a ghost.
  if (row.dismissed_at) return 'dismissed'
  if (row.invited_at) return 'invited'
  return 'waiting'
}

// Days since a request, floored. Used to surface the oldest first — the failure mode
// here is silence, and silence has no other symptom.
export function daysWaiting(createdAt, now) {
  if (!createdAt) return 0
  const then = new Date(createdAt).getTime()
  const ms = new Date(now).getTime() - then
  return ms > 0 ? Math.floor(ms / 86400000) : 0
}

// buildWaitlistView(rows, accountsByEmail, now)
// One pass producing the rendered queue plus the counts the card badges.
//
// `needsAction` — NOT the row count. A badge that counts everything trains you to
// ignore it; this one is the number of people who asked and have heard nothing.
export function buildWaitlistView(rows = [], accountsByEmail = {}, now = new Date().toISOString()) {
  const items = (rows ?? []).map(row => {
    const email = String(row.email ?? '').toLowerCase()
    const account = accountsByEmail[email] ?? null
    const state = classifySubscriber(row, account)
    return {
      email,
      source: row.source ?? null,
      created_at: row.created_at ?? null,
      invited_at: row.invited_at ?? null,
      invited_code: row.invited_code ?? null,
      dismissed_at: row.dismissed_at ?? null,
      state,
      needsAction: WAITLIST_STATES[state].needsAction,
      daysWaiting: daysWaiting(row.created_at, now),
      account: account
        ? {
            role: account.role ?? null,
            fullName: account.full_name ?? null,
            codeUsed: account.access_code_used ?? null,
            sessionCount: account.sessionCount ?? 0,
            turnCount: account.turnCount ?? 0,
            // Someone who got in and then stalled is a DIFFERENT problem from someone
            // still outside, and it is the one that stays invisible: they no longer
            // appear anywhere that looks like a queue.
            stalled: (account.sessionCount ?? 0) === 0,
          }
        : null,
    }
  })

  // Longest-waiting first among those needing action; everyone else by recency.
  items.sort((a, b) => {
    if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1
    if (a.needsAction) return String(a.created_at).localeCompare(String(b.created_at))
    return String(b.created_at).localeCompare(String(a.created_at))
  })

  const counts = { waiting: 0, invited: 0, signed_up: 0, writing: 0, dismissed: 0, stalled: 0 }
  for (const i of items) {
    counts[i.state]++
    if (i.account?.stalled) counts.stalled++
  }
  return { items, counts, needsAction: counts.waiting }
}
