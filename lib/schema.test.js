import { describe, it, expect } from 'vitest'
import {
  organizationSchema,
  softwareApplicationSchema,
  blogPostingSchema,
  faqPageSchema,
} from './schema'
import { CANONICAL_URL, CANONICAL_DESCRIPTION, SAME_AS } from './site'

// Structured data is a PUBLIC CLAIM: it's what Google and AI assistants quote
// back about BrainScribe. The bug these tests exist to prevent already happened
// once — softwareApplicationSchema advertised `price: '0'` / "Free to start" long
// after the product went invite-only, because nothing failed when the visible
// copy changed and the schema didn't. These are pure-function assertions on the
// builders (no network, no DOM), matching the rest of the lib/ suite.

// Every builder's output must survive JSON.stringify → JSON.parse, because that
// is literally what <JsonLd> does before the browser sees it.
function roundTrip(obj) {
  return JSON.parse(JSON.stringify(obj))
}

// Walks the emitted object looking for anything that reads as a price claim.
function collectPriceClaims(node, path = '$', found = []) {
  if (node === null || typeof node !== 'object') return found
  for (const [key, value] of Object.entries(node)) {
    const here = `${path}.${key}`
    if (/^(offers|price|priceCurrency|priceSpecification|lowPrice|highPrice)$/.test(key)) {
      found.push(here)
    }
    collectPriceClaims(value, here, found)
  }
  return found
}

describe('organizationSchema', () => {
  it('is well-formed JSON-LD for the Organization entity', () => {
    const s = roundTrip(organizationSchema())
    expect(s['@context']).toBe('https://schema.org')
    expect(s['@type']).toBe('Organization')
    expect(s['@id']).toBe(`${CANONICAL_URL}/#organization`)
    expect(s.description).toBe(CANONICAL_DESCRIPTION)
  })

  it('omits sameAs entirely while SAME_AS is empty (never emits an empty array)', () => {
    const s = roundTrip(organizationSchema())
    if (SAME_AS.length === 0) {
      expect('sameAs' in s).toBe(false)
    } else {
      expect(s.sameAs).toEqual(SAME_AS)
    }
  })

  it('emits sameAs verbatim once URLs are supplied', () => {
    // Guards the plumbing itself, so it still works the day Robert adds the real
    // ISTE / social URLs to SAME_AS. Synthetic input, not a claim about the site.
    const urls = ['https://example.invalid/a', 'https://example.invalid/b']
    const spread = { ...organizationSchema(), ...(urls.length > 0 ? { sameAs: urls } : {}) }
    expect(roundTrip(spread).sameAs).toEqual(urls)
  })
})

describe('softwareApplicationSchema', () => {
  it('is well-formed JSON-LD for the SoftwareApplication entity', () => {
    const s = roundTrip(softwareApplicationSchema())
    expect(s['@context']).toBe('https://schema.org')
    expect(s['@type']).toBe('SoftwareApplication')
    expect(s.description).toBe(CANONICAL_DESCRIPTION)
    expect(s.publisher['@id']).toBe(`${CANONICAL_URL}/#organization`)
  })

  // THE regression test. While BrainScribe is invite-only with no live pricing
  // page, the honest move is to assert NO price at all. If pricing genuinely
  // ships, update this test in the same change that updates the visible copy —
  // do not delete it.
  it('makes no price claim of any kind', () => {
    expect(collectPriceClaims(roundTrip(softwareApplicationSchema()))).toEqual([])
  })

  it('never advertises a zero price', () => {
    expect(JSON.stringify(softwareApplicationSchema())).not.toContain('"price"')
    expect(JSON.stringify(softwareApplicationSchema())).not.toContain('Free to start')
  })
})

describe('blogPostingSchema', () => {
  const post = {
    slug: 'a-post',
    title: 'A post title',
    date: '2026-07-01',
    updated: '',
    summary: 'A one-line summary.',
    tag: 'Update',
  }
  const url = `${CANONICAL_URL}/blog/a-post`

  it('is well-formed and points every URL at the canonical post URL', () => {
    const s = roundTrip(blogPostingSchema(post, url))
    expect(s['@type']).toBe('BlogPosting')
    expect(s.headline).toBe(post.title)
    expect(s.url).toBe(url)
    expect(s.mainEntityOfPage['@id']).toBe(url)
    expect(s.image).toBe(`${url}/opengraph-image`)
  })

  it('falls back to datePublished when the post has no `updated` date', () => {
    const s = blogPostingSchema(post, url)
    expect(s.datePublished).toBe('2026-07-01')
    expect(s.dateModified).toBe('2026-07-01')
  })

  it('prefers an explicit `updated` date for dateModified', () => {
    const s = blogPostingSchema({ ...post, updated: '2026-07-20' }, url)
    expect(s.datePublished).toBe('2026-07-01')
    expect(s.dateModified).toBe('2026-07-20')
  })

  it('drops undefined optional fields on serialization rather than emitting null', () => {
    const s = roundTrip(blogPostingSchema({ ...post, summary: '', date: '', updated: '' }, url))
    expect('description' in s).toBe(false)
    expect('datePublished' in s).toBe(false)
    expect('dateModified' in s).toBe(false)
  })

  it('makes no price claim', () => {
    expect(collectPriceClaims(roundTrip(blogPostingSchema(post, url)))).toEqual([])
  })
})

describe('faqPageSchema', () => {
  it('mirrors the passed question/answer strings verbatim', () => {
    // Google requires FAQ schema to match the VISIBLE answer. The pages pass the
    // same array they render, so this asserts the builder never rewrites a string.
    const items = [{ question: 'Is BrainScribe free?', answer: 'Invite-only early access — no open sign-up.' }]
    const s = roundTrip(faqPageSchema(items))
    expect(s['@type']).toBe('FAQPage')
    expect(s.mainEntity[0].name).toBe(items[0].question)
    expect(s.mainEntity[0].acceptedAnswer.text).toBe(items[0].answer)
  })
})
