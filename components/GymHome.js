'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GYM_SKILLS, LEVELS, TIER_META, getSkill, isUnlocked, missingPrereqs, getTierSkillTree,
} from '@/lib/gymCurriculum'

// Skill-tree connector geometry. One gutter column per nesting level; a subtle
// vertical guide runs down the left from each parent, elbowing into the child's row
// — so a locked offshoot reads at a glance as hanging off its (open) prerequisite.
// Column width is responsive (clamps down on mobile) so deep nesting never overflows.
const STEP_W = 'clamp(16px, 4vw, 24px)' // one indent level
const LINE_X = '9px'                    // x of the vertical guide inside a column

// Writing Gym home screen. Per the settled design (§UI): level meter + badge wall
// (Practiced full-color, Locked-In gleam), this week's practice card, all-skills
// browser with per-skill lock lines, and the streak DEMOTED below badges + level
// (Q2). The student only ever sees earned badges + embellishment-on-upgrade — no
// empty sockets, no "N of M locked in" meter (that honest split lives in the
// parent/teacher view). Upgrades are always gain-framed.

function levelIndex(key) {
  return Math.max(0, LEVELS.findIndex(l => l.key === key))
}

// Flatten a prereq forest (from getTierSkillTree) into an ordered list of rows,
// depth-first / pre-order so each dependent sits directly beneath its prerequisite.
// Each entry carries `depth`, `isLast` (last among its siblings), and `trail` — the
// per-ancestor-column flags used to draw pass-through guide lines. Roots (depth 0)
// have no vertical guide between them; a child appends its parent's "has-later-sibling"
// flag so grandchildren draw the ancestor line correctly.
function flattenTree(nodes, depth = 0, trail = [], out = []) {
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1
    out.push({ skill: node.skill, depth, isLast, trail })
    if (node.children.length) {
      const childTrail = depth === 0 ? [] : [...trail, !isLast]
      flattenTree(node.children, depth + 1, childTrail, out)
    }
  })
  return out
}

// ── Level ladder ──────────────────────────────────────────────────────────────
// Visual belt of the four milestone levels (Scribe → Wordsmith → Stylist →
// Virtuoso). DISPLAY ONLY — the rank order is LEVELS (lib/gymCurriculum); which rung
// is current is driven by `curLevelIdx` (levelIndex(levelKey)); no level LOGIC here.
// Three states per rung: achieved (navy-filled, check) · current (orange-filled,
// spark glow — "you are here", the one rung that earns --accent) · locked (sunken,
// dashed, muted lock). A connecting track runs behind: navy up to the current rung,
// muted after — so the climb reads at a glance. Responsive belt: fixed-ish badge
// columns + flex-1 connectors, so all four rungs fit a 375px phone with no overflow.

function LockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

const RUNG = 52 // badge diameter (px)

function LevelRung({ level, index, state }) {
  const achieved = state === 'achieved'
  const current = state === 'current'
  // Circle visual per state. Orange (--accent) is reserved for the current rung only.
  const circle = current
    ? { background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', boxShadow: 'var(--shadow-spark)' }
    : achieved
      ? { background: 'var(--primary)', color: 'var(--text-on-dark)', border: 'none', boxShadow: 'var(--shadow-sm)' }
      : { background: 'var(--surface-sunken)', color: 'var(--text-subtle)', border: '1.5px dashed var(--border-strong)', boxShadow: 'none' }
  const label = achieved ? `${level.name} — achieved` : current ? `${level.name} — you are here` : `${level.name} — locked`
  return (
    <div
      className="flex flex-col items-center"
      style={{ width: 'clamp(56px, 17vw, 78px)', flexShrink: 0 }}
      role="listitem"
      aria-label={label}
    >
      <div
        className="flex items-center justify-center"
        aria-hidden="true"
        style={{
          width: RUNG, height: RUNG, borderRadius: '50%',
          fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: 18,
          transform: current ? 'scale(1.06)' : 'none',
          transition: 'transform var(--dur-base) var(--ease-out)',
          ...circle,
        }}
      >
        {achieved ? <CheckGlyph /> : current ? index + 1 : <LockGlyph />}
      </div>
      <span
        className="text-center"
        style={{
          font: 'var(--type-meta)', marginTop: 8, lineHeight: 1.2,
          fontWeight: current ? 'var(--fw-bold)' : 'var(--fw-medium)',
          color: current ? 'var(--text-strong)' : achieved ? 'var(--text-body)' : 'var(--text-subtle)',
        }}
      >
        {level.name}
      </span>
    </div>
  )
}

function LevelLadder({ curLevelIdx }) {
  return (
    <div className="flex items-start" role="list" aria-label="Level progress">
      {LEVELS.map((level, i) => {
        const state = i < curLevelIdx ? 'achieved' : i === curLevelIdx ? 'current' : 'locked'
        const connectorFilled = i < curLevelIdx // track up to the current rung reads filled
        return (
          <div key={level.key} className="flex items-start" style={i < LEVELS.length - 1 ? { flex: 1 } : undefined}>
            <LevelRung level={level} index={i} state={state} />
            {i < LEVELS.length - 1 && (
              <div
                aria-hidden="true"
                style={{
                  flex: 1, height: 3, borderRadius: 2, minWidth: 12,
                  marginTop: RUNG / 2 - 1.5,
                  background: connectorFilled ? 'var(--primary)' : 'var(--border-strong)',
                  opacity: connectorFilled ? 1 : 0.6,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
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

// Tree connector gutters: one column per nesting level. Ancestor columns draw a
// faint pass-through vertical (context); the last column draws the elbow into this
// row — a vertical stub down from the parent plus a horizontal reach into the row,
// continuing below only if this skill has a later sibling. `trail[j]` says whether
// ancestor column j still has siblings below (so its guide passes through this row).
function ConnectorGutters({ depth, isLast, trail }) {
  if (depth < 1) return null
  const cols = []
  for (let j = 0; j < depth; j++) {
    const isElbow = j === depth - 1
    cols.push(
      <div key={j} aria-hidden="true" style={{ width: STEP_W, flexShrink: 0, position: 'relative' }}>
        {isElbow ? (
          <>
            {/* vertical stub from the parent above, down to this row's centre */}
            <span style={{ position: 'absolute', left: LINE_X, top: 0, height: '50%', borderLeft: '1px solid var(--text-subtle)' }} />
            {/* continue below only if a later sibling follows */}
            {!isLast && <span style={{ position: 'absolute', left: LINE_X, top: '50%', bottom: 0, borderLeft: '1px solid var(--text-subtle)' }} />}
            {/* elbow reaching into the row */}
            <span style={{ position: 'absolute', left: LINE_X, top: '50%', width: `calc(${STEP_W} - ${LINE_X})`, borderTop: '1px solid var(--text-subtle)' }} />
          </>
        ) : (
          trail[j] && <span style={{ position: 'absolute', left: LINE_X, top: 0, bottom: 0, borderLeft: '1px solid var(--border-default)' }} />
        )}
      </div>
    )
  }
  return <>{cols}</>
}

// ── All-skills row ──────────────────────────────────────────────────────────
function SkillRow({ skill, state, unlocked, blockedBy, isSuggested, isQueued, onStart, starting, depth = 0, isLast = true, trail = [] }) {
  const practiced = state === 'practiced' || state === 'locked_in'
  const tier = TIER_META[skill.tier]
  return (
    <div
      className="flex items-stretch"
      style={{ borderBottom: '1px solid var(--border-default)' }}
    >
      <ConnectorGutters depth={depth} isLast={isLast} trail={trail} />
      <div className="flex items-center gap-3 py-3 flex-1 min-w-0">
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
          {isQueued && !practiced && !unlocked && (
            <span style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-bold)', color: tier.color }}>Queued for you</span>
          )}
        </div>
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
          {unlocked
            ? skill.description
            : isQueued
              ? `Queued from your writing profile — unlocks once you finish ${blockedBy.map(k => getSkill(k)?.label ?? k).join(' and ')}`
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
  suggestionReason = null,   // reasoned copy line from the suggestion engine (or null)
  queuedKeys = [],           // prereq-locked skills queued from the writing profile
  needsWarmup = false,       // brand-new gym-first student → placement warm-up first
  portfolioCount = 0,
}) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  const practicedSet = new Set(practicedKeys)
  const queuedSet = new Set(queuedKeys)
  const suggested = suggestedSkillKey ? getSkill(suggestedSkillKey) : null

  async function post(body) {
    const res = await fetch('/api/gym/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Could not start that session.')
    return data
  }

  async function startSkill(skillKey) {
    if (starting) return
    setStarting(true); setError(null)
    try {
      const data = await post({ skillKey, persona: 'owen' })
      router.push(`/gym/session/${data.gymSessionId}`)
    } catch (e) {
      console.error(e); setError(e.message ?? 'Something went wrong.'); setStarting(false)
    }
  }

  async function startWarmup() {
    if (starting) return
    setStarting(true); setError(null)
    try {
      const data = await post({ warmup: true, persona: 'owen' })
      router.push(`/gym/session/${data.gymSessionId}`)
    } catch (e) {
      console.error(e); setError(e.message ?? 'Something went wrong.'); setStarting(false)
    }
  }

  const curLevelIdx = levelIndex(levelKey)
  const badgeSkills = GYM_SKILLS.filter(s => practicedSet.has(s.key))

  return (
    <main style={{ maxWidth: 'var(--width-prose)' }} className="mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-8">
        <p style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-subtle)', fontWeight: 'var(--fw-bold)', margin: 0 }}>
          Skill Studio
        </p>
        <h1 style={{ font: 'var(--type-title)', color: 'var(--text-strong)', margin: '4px 0 0' }}>
          Practice a skill
        </h1>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', marginTop: 6 }}>
          No homework, no deadline — just one skill at a time, about 25 minutes.
        </p>
      </div>

      {/* Level ladder — visual belt of the four milestone levels */}
      <section className="mb-8 p-5" style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-default)' }}>
        <div className="mb-4">
          <LevelLadder curLevelIdx={curLevelIdx} />
        </div>
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 0 }}>
          You're a <strong style={{ color: 'var(--text-strong)' }}>{LEVELS[curLevelIdx].name}</strong>
          {' '}— {practicedCount} {practicedCount === 1 ? 'skill' : 'skills'} practiced so far.
        </p>
      </section>

      {/* Warm-up card — brand-new gym-first student. Never framed as a test. */}
      {needsWarmup ? (
        <section className="mb-8 p-6" style={{ background: 'var(--surface-spark)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-accent)' }}>
          <p style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-text)', fontWeight: 'var(--fw-bold)', margin: 0 }}>
            Start here
          </p>
          <h2 style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: '6px 0 4px' }}>A quick warm-up</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-body)', margin: '0 0 4px' }}>
            Write one short, fun paragraph so your coach can see how you already write — then we'll pick a great place to start. Nothing here is graded.
          </p>
          <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '0 0 16px' }}>~10 minutes · your coach is ready</p>
          <button
            onClick={startWarmup}
            disabled={starting}
            className="inline-flex items-center gap-2 transition hover:opacity-90 disabled:opacity-50"
            style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)', background: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '11px 22px' }}
          >
            {starting ? 'Starting…' : 'Start warm-up'}
          </button>
          {error && <p style={{ font: 'var(--type-meta)', color: 'var(--status-error)', marginTop: 10 }}>{error}</p>}
        </section>
      ) : suggested && (
        <section className="mb-8 p-6" style={{ background: 'var(--surface-spark)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-accent)' }}>
          <p style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-text)', fontWeight: 'var(--fw-bold)', margin: 0 }}>
            This week's practice
          </p>
          <h2 style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: '6px 0 4px' }}>{suggested.label}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-body)', margin: '0 0 4px' }}>{suggested.description}.</p>
          {/* Why this pick — the suggestion engine's reason line (with the matched phrase). */}
          <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            {suggestionReason ?? (practicedCount === 0 ? 'A good place to start.' : 'Next in your path.')} · ~25 minutes · your coach is ready
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
            {flattenTree(getTierSkillTree(tier)).map(({ skill, depth, isLast, trail }) => {
              const unlocked = isUnlocked(skill, practicedSet, completedSessionCount)
              return (
                <SkillRow
                  key={skill.key}
                  skill={skill}
                  state={skillStates[skill.key]}
                  unlocked={unlocked}
                  blockedBy={unlocked ? [] : (skill.volumeGate ? [] : missingPrereqs(skill, practicedSet))}
                  isSuggested={skill.key === suggestedSkillKey}
                  isQueued={queuedSet.has(skill.key)}
                  onStart={startSkill}
                  starting={starting}
                  depth={depth}
                  isLast={isLast}
                  trail={trail}
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
