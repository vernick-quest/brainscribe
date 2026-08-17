import { describe, it, expect } from 'vitest'
import {
  mailDecision, selectRecipients, unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl,
} from './blogMail.js'

// Bulk mail is the only thing here that reaches many strangers at once, and the two
// mistakes that matter are both unrecoverable: mailing someone who opted out, and
// letting a stranger opt someone else out. Both are pinned below.

const row = (over = {}) => ({ email: 'reader@example.com', source: 'blog', ...over })

// Vitest does not load .env.local, and token generation deliberately THROWS without a
// secret rather than falling back to a constant — see the last test in this file.
process.env.UNSUBSCRIBE_SECRET = 'test-secret-not-a-real-one'

describe('mailDecision', () => {
  it('mails a blog subscriber', () => {
    expect(mailDecision(row())).toEqual({ mail: true, reason: 'ok' })
  })

  // THE ONE THAT MUST NEVER REGRESS. Checked before every other rule so nothing can
  // reach someone who has told us to stop.
  it('NEVER mails an unsubscribed address, whatever else is true', () => {
    expect(mailDecision(row({ unsubscribed_at: '2026-08-16T12:00:00Z' })).mail).toBe(false)
    expect(mailDecision(row({ unsubscribed_at: '2026-08-16T12:00:00Z' })).reason).toBe('unsubscribed')
  })

  // The mirror of the waitlist card's rule: someone who asked for ACCESS did not ask
  // for blog posts. Same error, opposite direction.
  it('does not mail a waitlist signup — they asked for access, not posts', () => {
    expect(mailDecision(row({ source: 'waitlist' })))
      .toEqual({ mail: false, reason: 'not_a_blog_subscriber' })
  })

  it('skips a row with no address rather than mailing an empty string', () => {
    expect(mailDecision(row({ email: '' })).reason).toBe('no_email')
  })
})

describe('selectRecipients', () => {
  it('lowercases, and reports WHY each skip happened', () => {
    const { recipients, skipped } = selectRecipients([
      row({ email: 'Reader@Example.com' }),
      row({ email: 'gone@example.com', unsubscribed_at: '2026-08-16T12:00:00Z' }),
      row({ email: 'asked@example.com', source: 'waitlist' }),
    ])
    expect(recipients).toEqual(['reader@example.com'])
    // A dry-run showing "0 recipients" with no reasons is indistinguishable from a
    // broken query, which is why skips are counted rather than dropped.
    expect(skipped).toEqual({ unsubscribed: 1, not_a_blog_subscriber: 1 })
  })

  it('is empty, not undefined, for no rows', () => {
    expect(selectRecipients([])).toEqual({ recipients: [], skipped: {} })
  })
})

describe('unsubscribe token', () => {
  it('is stable for the same address and differs across addresses', () => {
    expect(unsubscribeToken('a@example.com')).toBe(unsubscribeToken('a@example.com'))
    expect(unsubscribeToken('a@example.com')).not.toBe(unsubscribeToken('b@example.com'))
  })

  it('ignores case and surrounding space, so a link survives a mail client', () => {
    expect(unsubscribeToken('  A@Example.COM ')).toBe(unsubscribeToken('a@example.com'))
  })

  it('accepts its own token', () => {
    expect(verifyUnsubscribeToken('a@example.com', unsubscribeToken('a@example.com'))).toBe(true)
  })

  // Without this, anyone could unsubscribe anyone by guessing addresses.
  it('rejects another address token, a wrong-length token, and junk', () => {
    expect(verifyUnsubscribeToken('a@example.com', unsubscribeToken('b@example.com'))).toBe(false)
    expect(verifyUnsubscribeToken('a@example.com', 'short')).toBe(false)
    expect(verifyUnsubscribeToken('a@example.com', '')).toBe(false)
    expect(verifyUnsubscribeToken('a@example.com', null)).toBe(false)
  })

  it('builds a URL carrying the address and its token', () => {
    const url = unsubscribeUrl('a+tag@example.com', 'https://www.brainscribe.io')
    expect(url).toContain('/api/unsubscribe?e=a%2Btag%40example.com')
    expect(url).toContain(`t=${unsubscribeToken('a+tag@example.com')}`)
  })
  // A silently-empty secret would make every token identical, and therefore forgeable
  // by anyone who had ever received one email. Failing loudly is the only safe
  // behaviour, so it is pinned.
  it('THROWS with no secret rather than issuing a constant token', () => {
    const saved = process.env.UNSUBSCRIBE_SECRET
    const savedCron = process.env.CRON_SECRET
    const savedSvc = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.UNSUBSCRIBE_SECRET
    delete process.env.CRON_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    try {
      expect(() => unsubscribeToken('a@example.com')).toThrow(/secret/)
    } finally {
      process.env.UNSUBSCRIBE_SECRET = saved
      if (savedCron !== undefined) process.env.CRON_SECRET = savedCron
      if (savedSvc !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSvc
    }
  })
})
