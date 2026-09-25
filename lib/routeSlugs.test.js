import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { slugName, routePositions, findSlugCollisions } from '@/lib/routeSlugs'

// Why this file exists: `app/api/sessions/[sessionId]/starting-draft/` shipped next to
// `app/api/sessions/[id]/*` and broke `next dev` AND `next start` on EVERY request —
// while `npm run build` kept exiting 0, so the definition-of-done gate saw nothing and
// production stayed healthy (Vercel builds its own routing). It was a pure local blocker
// that reached main. The last section of this file is the part that stops a recurrence;
// the ones above it are here so that check is trustworthy.

describe('slugName', () => {
  it('reads the name out of every dynamic form', () => {
    expect(slugName('[id]')).toBe('id')
    expect(slugName('[...slug]')).toBe('slug')
    expect(slugName('[[...slug]]')).toBe('slug')
  })

  it('is null for static segments and near-misses', () => {
    for (const seg of ['sessions', '(auth)', '@modal', '_private', '[]', 'id]', '[id']) {
      expect(slugName(seg)).toBeNull()
    }
  })
})

describe('routePositions', () => {
  it('drops route groups and parallel slots, which occupy no path position', () => {
    expect(routePositions('(auth)/login')).toEqual(['login'])
    expect(routePositions('@modal/[id]')).toEqual(['[id]'])
  })

  it('returns null under a _private folder — those are not routes at all', () => {
    expect(routePositions('_lib/[id]')).toBeNull()
    expect(routePositions('api/_internal/[id]')).toBeNull()
  })

  it('keeps ordinary segments in order', () => {
    expect(routePositions('api/sessions/[id]/complete')).toEqual(['api', 'sessions', '[id]', 'complete'])
  })
})

describe('findSlugCollisions', () => {
  it('catches the exact shape that broke dev (the regression this file guards)', () => {
    const found = findSlugCollisions([
      'api/sessions',
      'api/sessions/[id]',
      'api/sessions/[id]/complete',
      'api/sessions/[sessionId]',
      'api/sessions/[sessionId]/starting-draft',
    ])
    expect(found).toHaveLength(1)
    expect(found[0].path).toBe('api/sessions')
    expect(found[0].slugs).toEqual(['id', 'sessionId'])
  })

  it('is quiet when one slug name is used consistently', () => {
    expect(findSlugCollisions([
      'api/sessions/[id]',
      'api/sessions/[id]/complete',
      'api/sessions/[id]/starting-draft',
    ])).toEqual([])
  })

  it('allows the same name at DIFFERENT path positions', () => {
    // app/api/scaffold/[sessionId] and app/api/sessions/[id] coexist today: different
    // parents, so neither constrains the other.
    expect(findSlugCollisions(['api/scaffold/[sessionId]', 'api/sessions/[id]'])).toEqual([])
  })

  it('catches a collision across route groups, which are not siblings on disk', () => {
    // The trap a naive "one dynamic child per folder" check would miss: (a) and (b)
    // vanish from the URL, so both slugs land on the same position.
    const found = findSlugCollisions(['(a)/[id]', '(b)/[slug]'])
    expect(found).toHaveLength(1)
    expect(found[0].path).toBe('')
    expect(found[0].slugs).toEqual(['id', 'slug'])
  })

  it('does not count a _private folder against a real route', () => {
    expect(findSlugCollisions(['api/sessions/[id]', 'api/sessions/_drafts/[sessionId]'])).toEqual([])
  })

  it('reports each colliding position once, with the dirs to look at', () => {
    const found = findSlugCollisions([
      'api/a/[id]', 'api/a/[aId]',
      'api/b/[id]', 'api/b/[bId]',
    ])
    expect(found.map((c) => c.path)).toEqual(['api/a', 'api/b'])
    expect(found[0].dirs).toEqual(['api/a/[aId]', 'api/a/[id]'])
  })
})

// ── The live check ────────────────────────────────────────────────────────────────────
// Everything above is synthetic. This is the one that fails when someone adds a second
// slug name to the real tree.

/** Every directory under app/, app-relative, '/'-separated. */
function appDirs() {
  const root = fileURLToPath(new URL('../app', import.meta.url))
  const out = []
  const walk = (rel) => {
    const abs = rel ? `${root}/${rel}` : root
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const next = rel ? `${rel}/${entry.name}` : entry.name
      out.push(next)
      walk(next)
    }
  }
  walk('')
  return out
}

describe('the real app/ route tree', () => {
  const dirs = appDirs()

  // POSITIVE CONTROL. Zero collisions is also what a walker that found nothing returns,
  // and a silent zero is how every false green in this repo has looked. Prove the walk
  // actually reached the tree — and specifically the folder that caused the outage —
  // before believing its verdict.
  it('was actually walked (guards against a vacuous pass)', () => {
    expect(dirs.length).toBeGreaterThan(20)
    expect(dirs).toContain('api/sessions/[id]')
    expect(dirs).toContain('api/sessions/[id]/starting-draft')
    expect(dirs.filter((d) => slugName(d.split('/').pop())).length).toBeGreaterThan(5)
  })

  it('uses exactly one slug name per dynamic path position', () => {
    const collisions = findSlugCollisions(dirs)
    // Spelled out on failure: the error Next throws names the two slugs but not the files.
    const detail = collisions
      .map((c) => `  /${c.path} is claimed by ${c.slugs.map((s) => `'${s}'`).join(' and ')} — ${c.dirs.map((d) => `app/${d}`).join(', ')}`)
      .join('\n')
    expect(collisions, collisions.length
      ? `Two slug names share one dynamic path position. next dev and next start will throw on EVERY request (next build will still exit 0):\n${detail}\nRename so one name is used throughout.`
      : '').toEqual([])
  })
})
