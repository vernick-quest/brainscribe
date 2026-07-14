import { CANONICAL_URL, CANONICAL_DESCRIPTION, SUPPORT_EMAIL } from '@/lib/site'

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
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free to start',
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
