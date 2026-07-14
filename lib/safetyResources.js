// lib/safetyResources.js — crisis resources for the student-only safety card.
//
// SAFETY INVARIANTS (see docs/specs/brainscribe-child-safety-*.md):
//  • These resources are surfaced OUT OF BAND to the STUDENT ONLY. They are never
//    written into `messages`, `paragraph_scaffolds`, or anything a linked watcher
//    (parent/teacher) can read — because the person a child needs help from may be
//    the linked parent themselves.
//  • The "trusted adult" language is deliberately NOT parent-defaulted: for an
//    abuse disclosure, defaulting a child to "tell your parent" can point them at
//    the abuser. Keep it "a trusted adult you choose."
//  • LOCATION IS NEVER STORED. The country code comes from the Vercel edge header
//    (x-vercel-ip-country) read at RENDER time only and passed as a prop — no DB
//    column, no cookie, no log (under-13 data-minimization).
//
// Extending to a new country = add a key to COUNTRY_RESOURCES. Everything else
// (default-to-US, always-append findahelpline) is country-agnostic.

// Universal first item — a trusted adult exists everywhere; not country-specific.
const TRUSTED_ADULT = {
  id: 'talk-to-adult',
  kind: 'guidance',
  label: 'Talk to a trusted adult',
  detail: 'A teacher, school counselor, coach, relative, or another adult you trust and choose.',
}

// Per-country crisis lines. US shipped; add UK/CA/AU/etc. as their own arrays.
// Each item: { id, kind, label, detail, tel?, sms?, smsBody?, url? }.
export const COUNTRY_RESOURCES = {
  US: [
    {
      id: '988',
      kind: 'call-text',
      label: '988 Suicide & Crisis Lifeline',
      detail: 'Call or text 988 — free, confidential, 24/7. You don’t have to be suicidal to reach out.',
      tel: '988',
      sms: '988',
    },
    {
      id: 'crisis-text-line',
      kind: 'text',
      label: 'Crisis Text Line',
      detail: 'Text HOME to 741741 to reach a trained crisis counselor, 24/7.',
      sms: '741741',
      smsBody: 'HOME',
    },
    {
      id: 'childhelp',
      kind: 'call',
      label: 'Childhelp — if an adult is hurting you',
      detail: 'Call or text 1-800-422-4453. They help kids who are being hurt or don’t feel safe at home.',
      tel: '18004224453',
    },
    {
      id: 'ncmec',
      kind: 'call',
      label: 'NCMEC CyberTipline — if someone online is exploiting you',
      detail: 'Call 1-800-843-5678, or report at report.cybertip.org, if someone online is pressuring, threatening, or exploiting you.',
      tel: '18008435678',
      url: 'https://report.cybertip.org',
    },
  ],
}

// Universal fallback — ALWAYS appended, every country and unknown. Throughline's
// findahelpline routes to free, confidential lines in 130+ countries, so a VPN /
// travelling / unknown-geo student still reaches a real local service.
const UNIVERSAL_FALLBACK = {
  id: 'findahelpline',
  kind: 'link',
  label: 'Find a helpline in your country',
  detail: 'findahelpline.com lists free, confidential support lines in 130+ countries.',
  url: 'https://findahelpline.com',
}

export const DEFAULT_COUNTRY = 'US'

// Normalize a raw x-vercel-ip-country value ('gb', 'US', null, '', 'XX') to a key
// we have resources for; anything unknown → the default (US). Case-insensitive.
export function normalizeCountry(raw) {
  const cc = (typeof raw === 'string' ? raw : '').trim().toUpperCase()
  return COUNTRY_RESOURCES[cc] ? cc : DEFAULT_COUNTRY
}

// The ordered resource list to render for a country: universal trusted-adult lead,
// the country's lines (US default when unknown), then the universal findahelpline.
export function resourcesForCountry(rawCountry) {
  const cc = normalizeCountry(rawCountry)
  return [TRUSTED_ADULT, ...COUNTRY_RESOURCES[cc], UNIVERSAL_FALLBACK]
}

// A short, warm, in-persona-neutral line the card leads with. Kept here (not in a
// component) so copy review has one home. NOT clinical, NOT a script dump.
export const CARD_INTRO =
  'Some things are bigger than any writing assignment. If you’re going through something hard, you don’t have to handle it alone — here are people who can help right now.'

export const CARD_FOOTER =
  'You can keep writing whenever you’re ready — your work is saved. This note is just for you.'
