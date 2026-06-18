import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'

// Blog posts are plain Markdown files in content/blog/, each with a small
// frontmatter block. Read at build time (the index + each post are statically
// generated), so publishing a post = commit the .md file and deploy.
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
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

// One post with its rendered HTML, or null if the slug doesn't exist.
export function getPostBySlug(slug) {
  const raw = readPostFile(slug)
  if (raw == null) return null
  const { data, body } = parseFrontmatter(raw)
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? '',
    summary: data.summary ?? '',
    tag: data.tag || null,
    html: marked.parse(body),
  }
}
