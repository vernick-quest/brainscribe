import { CANONICAL_URL, CANONICAL_DESCRIPTION, SUPPORT_EMAIL, SAME_AS } from '@/lib/site'

// JSON-LD builders. Kept as plain objects so any server component can drop them
// into a <JsonLd> tag. The entity description is the one canonical sentence
// (lib/site.js) — do not paraphrase it here; consistency is the whole point for
// AI-assistant entity resolution.

const LOGO = `${CANONICAL_URL}/brainscribe-logo.png`

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${CANONICAL_URL}/#organization`,
    name: 'BrainScribe',
    url: CANONICAL_URL,
    logo: LOGO,
    description: CANONICAL_DESCRIPTION,
    email: SUPPORT_EMAIL,
    // `sameAs` = the authoritative external profiles for this entity. OMITTED
    // while lib/site.js's SAME_AS is empty — an empty array is noise, and a
    // guessed URL is actively harmful. See the note on SAME_AS in lib/site.js.
    ...(SAME_AS.length > 0 ? { sameAs: SAME_AS } : {}),
  }
}

export function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${CANONICAL_URL}/#software`,
    name: 'BrainScribe',
    url: CANONICAL_URL,
    description: CANONICAL_DESCRIPTION,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    image: LOGO,
    publisher: { '@id': `${CANONICAL_URL}/#organization` },
    audience: {
      '@type': 'EducationalAudience',
      educationalRole: 'student',
      audienceType: 'Middle and high school students, grades 6–12 (ages 11–17), including students with ADHD and dysgraphia',
    },
    // NO `offers`. BrainScribe is invite-only early access: there is no public
    // sign-up, no live /pricing page, and no launched paid tier — so any offer we
    // could emit would be a claim we can't back. This previously asserted
    // `price: '0' / "Free to start"`, which outlived the free-trial era and kept
    // telling Google and AI assistants the product was free to sign up for. An
    // ABSENT offer is neutral; a wrong one is an accuracy problem (and trips
    // Google's offer-mismatch checks). Re-add a real Offer only when pricing
    // actually ships, and update the visible copy in the same change.
  }
}

// BlogPosting for one post. Lives HERE, not inline in app/blog/[slug]/page.js —
// that page used to build its own jsonLd object and hand-roll a <script> tag,
// which is exactly how the stale "Free to start" offer survived unnoticed in this
// file: two places emitting schema, only one of them ever reviewed.
//
// `post` is the shape lib/blog.js returns ({ title, date, summary, … }); `url` is
// the post's canonical absolute URL. `dateModified` falls back to `datePublished`
// (frontmatter has no separate `updated` field yet) — Google reads it for
// freshness, and an absent one is treated as unknown. Author/publisher stay
// Organization: BrainScribe has no named-Person byline decision yet.
export function blogPostingSchema(post, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary || undefined,
    datePublished: post.date || undefined,
    dateModified: post.updated || post.date || undefined,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: `${url}/opengraph-image`,
    author: { '@type': 'Organization', name: 'BrainScribe', url: CANONICAL_URL },
    publisher: {
      '@type': 'Organization',
      '@id': `${CANONICAL_URL}/#organization`,
      name: 'BrainScribe',
      logo: { '@type': 'ImageObject', url: LOGO },
    },
  }
}

// Builds a FAQPage from [{ question, answer }]. `answer` must be plain text that
// MATCHES the visible on-page answer (Google requires FAQ schema to mirror
// visible content) — so pass the same strings the page renders.
export function faqPageSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  }
}
