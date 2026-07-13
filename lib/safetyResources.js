// lib/safetyResources.js — crisis resources for the student-only safety card.
//
// SAFETY INVARIANTS (see docs/specs/brainscribe-child-safety-redteam-spec.md):
//  • These resources are surfaced OUT OF BAND to the STUDENT ONLY. They are never
//    written into `messages`, `paragraph_scaffolds`, or anything a linked watcher
//    (parent/teacher) can read — because the person a child needs help from may be
//    the linked parent themselves.
//  • The "trusted adult" language is deliberately NOT parent-defaulted: for an
//    abuse disclosure, defaulting a child to "tell your parent" can point them at
//    the abuser. Keep it "a trusted adult you choose."
//
// ⚠️ PENDING DECISION (Robert/counsel) — US-ONLY numbers.
// 988 / 741741 / Childhelp are US services. BrainScribe is invite-only today, but
// before any international traffic these need a locale-aware set (or a neutral
// "find help near you" link). Tracked as decision (d) in the child-safety memo.
// The `region` field makes that swap a data change, not a code change.
export const SAFETY_REGION = 'US'

// Ordered most-general → most-specific. `kind` lets the card show tel:/sms: links.
export const CRISIS_RESOURCES = [
  {
    id: 'talk-to-adult',
    kind: 'guidance',
    label: 'Talk to a trusted adult',
    detail: 'A teacher, school counselor, coach, relative, or another adult you trust and choose.',
  },
  {
    id: '988',
    kind: 'call-text',
    label: '988 Suicide & Crisis Lifeline',
    detail: 'Call or text 988 — free, confidential, 24/7. You don’t have to be suicidal to reach out.',
    tel: '988',
    sms: '988',
    region: 'US',
  },
  {
    id: 'crisis-text-line',
    kind: 'text',
    label: 'Crisis Text Line',
    detail: 'Text HOME to 741741 to reach a trained crisis counselor, 24/7.',
    sms: '741741',
    smsBody: 'HOME',
    region: 'US',
  },
  {
    id: 'childhelp',
    kind: 'call',
    label: 'Childhelp — if an adult is hurting you',
    detail: 'Call or text 1-800-422-4453. They help kids who are being hurt or don’t feel safe at home.',
    tel: '18004224453',
    region: 'US',
  },
]

// A short, warm, in-persona-neutral line the card leads with. Kept here (not in a
// component) so copy review has one home. NOT clinical, NOT a script dump.
export const CARD_INTRO =
  'Some things are bigger than any writing assignment. If you’re going through something hard, you don’t have to handle it alone — here are people who can help right now.'

export const CARD_FOOTER =
  'You can keep writing whenever you’re ready — your work is saved. This note is just for you.'
