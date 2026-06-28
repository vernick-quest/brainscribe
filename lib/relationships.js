// Caps on parent↔student links (the `relationships` table: watcher = parent,
// student = child). Enforced on the voluntary invite paths — generation-time in
// app/api/invites and authoritatively at claim time in app/(auth)/invite.
//
// COPPA parental consent (app/coppa/complete) deliberately does NOT apply these
// caps: it must never fail closed on a legally-required action, so a child can
// end up with more than MAX_PARENTS_PER_CHILD if one of them is a consenting
// guardian.
export const MAX_CHILDREN_PER_PARENT = 3
export const MAX_PARENTS_PER_CHILD = 2
