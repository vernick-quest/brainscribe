'use client'

import { useEffect, useState } from 'react'
import SiteHeader from '@/components/SiteHeader'

// Marketing-shell legal page (Privacy / Terms): sticky nav, lead header with a
// plain-language "short version" callout, then a two-column body — sticky TOC
// (active item tracked on scroll) + numbered prose. Collapses to one column
// under 820px (see .legal-doc styles in globals.css). The global SiteFooter
// (rendered in app/layout.js) supplies the bottom footer, so none is added here.
export default function LegalDoc({ title, updated, intro, tldr, sections }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? null)

  useEffect(() => {
    const els = sections.map(s => document.getElementById(s.id)).filter(Boolean)
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActiveId(e.target.id) }),
      { rootMargin: '-40% 0px -55% 0px' }
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [sections])

  return (
    <div className="legal-doc">
      <SiteHeader sticky />

      <main>
        <section className="lead-head">
          <div className="wide">
            <span className="eyebrow">Legal</span>
            <h1>{title}</h1>
            <span className="updated">Last updated {updated}</span>
            <p className="lead-intro">{intro}</p>
            <div className="tldr">
              <h2>The short version</h2>
              <p>{tldr}</p>
            </div>
          </div>
        </section>

        <div className="wide">
          <div className="legal">
            <aside className="toc">
              <p>On this page</p>
              <nav className="toc-nav">
                {sections.map(s => (
                  <a key={s.id} href={`#${s.id}`} className={activeId === s.id ? 'is-active' : ''}>
                    {s.label}
                  </a>
                ))}
              </nav>
            </aside>

            <article className="prose">
              {sections.map((s, i) => (
                <div key={s.id}>
                  <section id={s.id}>
                    <h2><span className="n">{String(i + 1).padStart(2, '0')}</span> {s.title}</h2>
                    {s.body}
                  </section>
                  {i < sections.length - 1 && <hr className="divider" />}
                </div>
              ))}
            </article>
          </div>
        </div>
      </main>
    </div>
  )
}
