// The seeded demo trio (app/api/admin/seed-demo/route.js). These emails are the
// durable identity of the demo accounts — they are constants the seeder OWNS, not
// fragile display names ("Demo Student — Mia R." can be renamed; the login can't).
// Anything that must never treat demo data as real (e.g. the draft-integrity
// alert) filters on these. Single source of truth — imported by the seeder, the
// admin dashboard's "demo seeded?" check, and the integrity route.
export const DEMO_EMAILS = [
  'demo-student@brainscribe.io',
  'demo-parent@brainscribe.io',
  'demo-teacher@brainscribe.io',
]

export function isDemoEmail(email) {
  return typeof email === 'string' && DEMO_EMAILS.includes(email.toLowerCase())
}
