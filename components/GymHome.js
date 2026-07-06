'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GYM_SKILLS, LEVELS, TIER_META, getSkill, isUnlocked, missingPrereqs,
} from '@/lib/gymCurriculum'

// Writing Gym home screen. Per the settled design (§UI): level meter + badge wall
// (Practiced full-color, Locked-In gleam), this week's practice card, all-skills
// browser with per-skill lock lines, and the streak DEMOTED below badges + level
// (Q2). The student only ever sees earned badges + embellishment-on-upgrade — no
// empty sockets, no "N of M locked in" meter (that honest split lives in the
// parent/teacher view). Upgrades are always gain-framed.

function levelIndex(key) {
  return Math.max(0, LEVELS.findIndex(l => l.key === key))
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function SkillBadge({ skill, state }) {
  const tier = TIER_META[skill.tier]
  const practiced = state === 'practiced' || state === 'locked_in'
  const lockedIn = state === 'locked_in'
  return (
    <div
      className="flex flex-col items-center gap-1.5 text-center"
      style={{ width: 84 }}
      title={practiced ? `${skill.label} — ${lockedIn ? 'Locked in' : 'Practiced'}` : skill.label}
    >
      <div
        className="flex items-center justify-center"
        aria-hidden="true"
        style={{
          width: 56, height: 56, borderRadius: '50%',
          background: practiced ? tier.color : 'var(--surface-sunken)',
          color: practiced ? '#fff' : 'var(--text-subtle)',
          border: practiced ? 'none' : '1px dashed var(--border-default)',
          fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: 20,
          boxShadow: lockedIn ? 'var(--shadow-spark)' : practiced ? 'var(--shadow-sm)' : 'none',
          opacity: practiced ? 1 : 0.55,
        }}
      >
        {skill.label.replace(/^The /, '').charAt(0)}
      </div>
      <span style={{ font: 'var(--type-meta)', color: practiced ? 'var(--text-body)' : 'var(--text-subtle)', lineHeight: 1.15 }}>
        {skill.label.replace(/^The /, '')}
      </span>
    </div>
  )
}

// ── All-skills row ──────────────────────────────────────────────────────────
function SkillRow({ skill, state, unlocked, blockedBy, isSuggested, onStart, starting }) {
  const practiced = state === 'practiced' || state === 'locked_in'
  const tier = TIER_META[skill.tier]
  return (
    <div
      className="flex items-center gap-3 py-3"
      style={{ borderBottom: '1px solid var(--border-default)' }}
    >
      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: tier.color, opacity: unlocked ? 1 : 0.3 }} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color: unlocked ? 'var(--text-strong)' : 'var(--text-muted)' }}>
            {skill.label}
          </span>
          {practiced && (
            <span style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-bold)', color: tier.color, background: 'var(--surface-muted)', borderRadius: 'var(--radius-pill)', padding: '1px 8px' }}>
              {state === 'locked_in' ? 'Locked in' : 'Practiced'}
            </span>
          )}
          {isSuggested && !practiced && (
            <span style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-bold)', color: 'var(--accent-text)' }}>Suggested</span>
          )}
        </div>
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
          {unlocked
            ? skill.description
            : `Complete ${blockedBy.map(k => getSkill(k)?.label ?? k).join(' and ')} to unlock`}
        </p>
      </div>
      {unlocked ? (
        <button
          onClick={() => onStart(skill.key)}
          disabled={starting}
          className="shrink-0 transition hover:opacity-90 disabled:opacity-50"
          style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)',
            color: practiced ? 'var(--text-body)' : 'var(--text-on-accent)',
            background: practiced ? 'var(--surface-muted)' : 'var(--accent)',
            border: practiced ? '1px solid var(--border-default)' : 'none',
            borderRadius: 'var(--radius-pill)', padding: '7px 16px' }}
        >
          {practiced ? 'Practice again' : 'Practice'}
        </button>
      ) : (
        <span className="shrink-0" aria-hidden="true" style={{ color: 'var(--text-subtle)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </span>
      )}
    </div>
  )
}

export default function GymHome({
  levelKey = 'finder',
  streak = 0,
  practicedCount = 0,
  skillStates = {},          // { [skill_key]: 'practiced' | 'locked_in' }
  practicedKeys = [],        // keys at practiced+
  completedSessionCount = 0,
  suggestedSkillKey = null,
  portfolioCount = 0,
}) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  const practicedSet = new Set(practicedKeys)
  const suggested = suggestedSkillKey ? getSkill(suggestedSkillKey) : null

  async function startSkill(skillKey) {
    if (starting) return
    setStarting(true); setError(null)
    try {
      const res = await fetch('/api/gym/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillKey, persona: 'owen' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not start that session.'); setStarting(false); return }
      router.push(`/gym/session/${data.gymSessionId}`)
    } catch (e) {
      console.error(e); setError('Something went wrong starting your session.'); setStarting(false)
    }
  }

  const curLevelIdx = levelIndex(levelKey)
  const badgeSkills = GYM_SKILLS.filter(s => practicedSet.has(s.key))

  return (
    <main style={{ maxWidth: 'var(--width-prose)' }} className="mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-8">
        <p style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-subtle)', fontWeight: 'var(--fw-bold)', margin: 0 }}>
          Writing Gym
        </p>
        <h1 style={{ font: 'var(--type-title)', color: 'var(--text-strong)', margin: '4px 0 0' }}>
          Practice a skill
        </h1>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', marginTop: 6 }}>
          No homework, no deadline — just one skill at a time, about 25 minutes.
        </p>
      </div>

      {/* Level meter */}
      <section className="mb-8 p-5" style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {LEVELS.map((l, i) => (
              <div key={l.key} className="flex items-center gap-2">
                <span style={{
                  font: 'var(--type-ui)', fontWeight: i === curLevelIdx ? 'var(--fw-bold)' : 'var(--fw-medium)',
                  color: i < curLevelIdx ? 'var(--text-muted)' : i === curLevelIdx ? 'var(--text-strong)' : 'var(--text-subtle)',
                }}>
                  {l.name}
                </span>
                {i < LEVELS.length - 1 && <span aria-hidden="true" style={{ color: 'var(--text-subtle)' }}>›</span>}
              </div>
            ))}
          </div>
        </div>
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 0 }}>
          You're a <strong style={{ color: 'var(--text-strong)' }}>{LEVELS[curLevelIdx].name}</strong>
          {' '}— {practicedCount} {practicedCount === 1 ? 'skill' : 'skills'} practiced so far.
        </p>
      </section>

      {/* This week's practice card */}
      {suggested && (
        <section className="mb-8 p-6" style={{ background: 'var(--surface-spark)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-accent)' }}>
          <p style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-text)', fontWeight: 'var(--fw-bold)', margin: 0 }}>
            This week's practice
          </p>
          <h2 style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: '6px 0 4px' }}>{suggested.label}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-body)', margin: '0 0 4px' }}>{suggested.description}.</p>
          <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            {practicedCount === 0 ? "A good place to start." : "Next in your path."} · ~25 minutes · your coach is ready
          </p>
          <button
            onClick={() => startSkill(suggested.key)}
            disabled={starting}
            className="inline-flex items-center gap-2 transition hover:opacity-90 disabled:opacity-50"
            style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)', background: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '11px 22px' }}
          >
            {starting ? 'Starting…' : `Start — ${suggested.label}`}
          </button>
          {error && <p style={{ font: 'var(--type-meta)', color: 'var(--status-error)', marginTop: 10 }}>{error}</p>}
        </section>
      )}

      {/* Badge wall — only earned badges; no empty sockets */}
      {badgeSkills.length > 0 && (
        <section className="mb-8">
          <h2 style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: '0 0 4px' }}>Your badges</h2>
          <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            <a href="/gym/portfolio" style={{ color: 'var(--text-link)', fontWeight: 'var(--fw-semibold)' }}>See your portfolio →</a>
          </p>
          <div className="flex flex-wrap" style={{ gap: 16 }}>
            {badgeSkills.map(s => <SkillBadge key={s.key} skill={s} state={skillStates[s.key]} />)}
          </div>
        </section>
      )}

      {/* All-skills browser, grouped by tier */}
      <section className="mb-8">
        <h2 style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: '0 0 4px' }}>All skills</h2>
        {[1, 2, 3].map(tier => (
          <div key={tier} className="mb-6">
            <div className="flex items-center gap-2 mt-4 mb-1">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: TIER_META[tier].color }} aria-hidden="true" />
              <h3 style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', margin: 0 }}>
                Tier {tier} — {TIER_META[tier].name}
              </h3>
            </div>
            {GYM_SKILLS.filter(s => s.tier === tier).map(skill => {
              const unlocked = isUnlocked(skill, practicedSet, completedSessionCount)
              return (
                <SkillRow
                  key={skill.key}
                  skill={skill}
                  state={skillStates[skill.key]}
                  unlocked={unlocked}
                  blockedBy={unlocked ? [] : (skill.volumeGate ? [] : missingPrereqs(skill, practicedSet))}
                  isSuggested={skill.key === suggestedSkillKey}
                  onStart={startSkill}
                  starting={starting}
                />
              )
            })}
          </div>
        ))}
      </section>

      {/* Streak — demoted, softened (Q2). Anchored to cumulative portfolio, never loss-framed. */}
      <section className="mb-4 p-4 flex items-center gap-3" style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
        <span aria-hidden="true" style={{ fontSize: 20 }}>◆</span>
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 0 }}>
          {portfolioCount > 0
            ? <>Your portfolio has <strong style={{ color: 'var(--text-strong)' }}>{portfolioCount}</strong> {portfolioCount === 1 ? 'entry' : 'entries'}{streak > 1 ? <> · {streak}-week streak</> : null}.</>
            : <>Your portfolio starts with your first session.</>}
        </p>
      </section>
    </main>
  )
}
