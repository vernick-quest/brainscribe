import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'

// Blog posts are plain Markdown files in content/blog/, each with a small
// frontmatter block. Read at build time (the index + each post are statically
// generated). Publishing = commit the .md file; it goes live on its `date` (see
// scheduling note below), then deploy.
//
// File shape:
//   ---
//   title: Your post title
//   date: 2026-06-17
//   summary: One line shown on the index.
//   tag: Update            (optional)
//   ---
//   Markdown body…

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

// Scheduled publishing. A post is "published" once its date is today or earlier.
// Future-dated posts are hidden in PRODUCTION — so we can commit a backlog (e.g.
// a Mon/Thu cadence written ahead) and have each go live on its own date. Because
// the site is statically built, revealing a scheduled post requires a rebuild on
// or after its date (pair this with a daily Vercel rebuild). In development every
// post is shown, so authors can preview a scheduled post locally. Undated posts
// always show. Dates compare as ISO 'YYYY-MM-DD' strings in UTC (a post goes live
// at UTC midnight of its date).
function isPublished(dateStr) {
  if (!dateStr) return true
  if (process.env.NODE_ENV !== 'production') return true
  const todayUTC = new Date().toISOString().slice(0, 10)
  return dateStr <= todayUTC
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: raw }
  const data = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (key) data[key] = val
  }
  return { data, body: m[2] }
}

function readPostFile(slug) {
  try {
    return fs.readFileSync(path.join(BLOG_DIR, `${slug}.md`), 'utf8')
  } catch {
    return null
  }
}

// All posts, newest first (sorted by the ISO `date` string). Body not parsed.
export function getAllPosts() {
  let files = []
  try {
    files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'))
  } catch {
    return []
  }
  return files
    .map(file => {
      const slug = file.replace(/\.md$/, '')
      const { data } = parseFrontmatter(fs.readFileSync(path.join(BLOG_DIR, file), 'utf8'))
      return {
        slug,
        title: data.title ?? slug,
        date: data.date ?? '',
        summary: data.summary ?? '',
        tag: data.tag || null,
      }
    })
    .filter(post => isPublished(post.date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

// Every slug on disk regardless of publish date. Used by generateStaticParams so
// each SCHEDULED post is already a known static route: the page still 404s (via
// getPostBySlug → notFound) until the post's date, and with ISR revalidation the
// route re-generates and reveals the post on its date — no manual rebuild needed.
export function getAllSlugs() {
  try {
    return fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
  } catch {
    return []
  }
}

// One post with its rendered HTML, or null if the slug doesn't exist.
export function getPostBySlug(slug) {
  const raw = readPostFile(slug)
  if (raw == null) return null
  const { data, body } = parseFrontmatter(raw)
  // Future-dated posts 404 until their date (keeps a scheduled URL from leaking).
  if (!isPublished(data.date)) return null
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? '',
    summary: data.summary ?? '',
    tag: data.tag || null,
    html: marked.parse(body),
  }
}
