// Next allows exactly ONE slug name per dynamic path position. Two sibling dynamic folders
// with different names — app/api/sessions/[id] beside app/api/sessions/[sessionId] — make
// `next dev` and `next start` throw
//
//   Error: You cannot use different slug names for the same dynamic path ('id' !== 'sessionId')
//
// on EVERY request, while `next build` still exits 0. That is the whole hazard: the repo's
// definition-of-done gate is build + tests, so nothing in it can see this. It shipped in
// 3374cee and sat in main, undetected locally, while production served fine (Vercel builds
// its own routing). Same blind spot already recorded for app/globals.css.
//
// So the check lives here, in the test suite, where the gate DOES look.

// Route groups `(auth)` and parallel slots `@modal` do not occupy a path position, and
// `_private` folders are removed from routing entirely along with everything beneath them.
// Collisions are judged on the path Next actually resolves, not the one on disk — which is
// why `app/(a)/[id]` and `app/(b)/[slug]` DO collide even though they are not siblings.
const isRouteGroup = (seg) => seg.startsWith('(') && seg.endsWith(')')
const isParallelSlot = (seg) => seg.startsWith('@')
const isPrivate = (seg) => seg.startsWith('_')

/** `[id]` / `[...slug]` / `[[...slug]]` → the slug name. Non-dynamic segments → null. */
export function slugName(segment) {
  const m = /^\[{1,2}(?:\.\.\.)?(.+?)\]{1,2}$/.exec(segment)
  return m ? m[1] : null
}

/**
 * Turn a slash-separated app-relative directory path into the URL path positions Next
 * resolves it to. Returns null when the path is not routable at all (under a `_private`
 * folder), which is different from an empty path (the app root).
 */
export function routePositions(dirPath) {
  const out = []
  for (const seg of String(dirPath).split('/')) {
    if (!seg || seg === '.') continue
    if (isPrivate(seg)) return null
    if (isRouteGroup(seg) || isParallelSlot(seg)) continue
    out.push(seg)
  }
  return out
}

/**
 * Given every directory under app/ (app-relative, '/'-separated, in any order), return one
 * entry per dynamic path position that is claimed by more than one slug name.
 *
 * Each entry: { path, slugs: [...sorted], dirs: [...sorted] } — `path` is the resolved
 * parent path the collision sits under, `dirs` the on-disk folders to look at.
 */
export function findSlugCollisions(dirPaths) {
  // resolved parent path → slug name → the on-disk dirs that introduced it
  const byParent = new Map()

  for (const dirPath of dirPaths) {
    const positions = routePositions(dirPath)
    if (!positions || positions.length === 0) continue
    const leaf = positions[positions.length - 1]
    const name = slugName(leaf)
    if (!name) continue
    const parent = positions.slice(0, -1).join('/')
    if (!byParent.has(parent)) byParent.set(parent, new Map())
    const slugs = byParent.get(parent)
    if (!slugs.has(name)) slugs.set(name, [])
    slugs.get(name).push(dirPath)
  }

  const collisions = []
  for (const [parent, slugs] of byParent) {
    if (slugs.size < 2) continue
    collisions.push({
      path: parent,
      slugs: [...slugs.keys()].sort(),
      dirs: [...slugs.values()].flat().sort(),
    })
  }
  return collisions.sort((a, b) => a.path.localeCompare(b.path))
}
