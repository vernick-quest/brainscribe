// lib/coachColors.js
// Single source of truth for per-coach accent colors. Do NOT hardcode these hex
// values anywhere else — import getCoachColor / COACH_COLORS from here.
//
// getCoachColor() returns CSS `var()` references rather than raw hex, so the six
// coaches follow the light/dark theme with no JS, no re-render and no flash. The
// hex lives in app/globals.css under `--tutor-*`; the two tables below mirror it
// so it is reviewable in one place and testable (lib/coachColors.test.js asserts
// this file and globals.css agree, so the two can't drift).
//
// Shape is unchanged — { name, tint, base, shade } — because consumers spread
// these straight into inline styles (background, border, color, color-mix).

/** Light theme — unchanged from what has always shipped. */
export const COACH_COLORS_LIGHT = {
  owen:     { name: 'Sage',       tint: '#EAF0E9', base: '#8BA888', shade: '#5A7357' },
  deon:     { name: 'Amber',      tint: '#F7EBD9', base: '#C88A3D', shade: '#8F5E22' },
  zoe:      { name: 'Coral',      tint: '#FBEAE6', base: '#E08A7A', shade: '#A85647' },
  alistair: { name: 'Slate Blue', tint: '#E8EDF2', base: '#7A94AB', shade: '#4C6377' },
  tilly:    { name: 'Teal',       tint: '#E2F0EE', base: '#5FA8A0', shade: '#367069' },
  jade:     { name: 'Plum',       tint: '#F0E7EF', base: '#9B6A93', shade: '#6B4165' },
}

/**
 * Dark theme — from the v2 design package.
 *
 * `base` is the ring: each hue steps up one stop so it clears 4.5:1 on the dark
 * card. `tint` is the persona hue composited at 14% over --surface-card (a soft
 * glow rather than a bright block). `shade` collapses onto `base`, because the
 * light-mode rule inverts here: light darkens the hue for text on a pale panel,
 * but on a dark panel the dark shade drops to 1.95–3.1:1 while the lifted ring
 * reads at 4.67–5.74:1 against its own tint.
 */
export const COACH_COLORS_DARK = {
  owen:     { name: 'Sage',       tint: '#28383C', base: '#8FBA93', shade: '#8FBA93' },
  deon:     { name: 'Amber',      tint: '#333530', base: '#E0A63C', shade: '#E0A63C' },
  zoe:      { name: 'Coral',      tint: '#353138', base: '#EC8874', shade: '#EC8874' },
  alistair: { name: 'Slate Blue', tint: '#283745', base: '#93B0D2', shade: '#93B0D2' },
  tilly:    { name: 'Teal',       tint: '#243941', base: '#74C0B7', shade: '#74C0B7' },
  jade:     { name: 'Plum',       tint: '#2C3343', base: '#B092C4', shade: '#B092C4' },
}

/** What components actually consume: theme-following CSS variable references. */
export const COACH_COLORS = Object.fromEntries(
  Object.entries(COACH_COLORS_LIGHT).map(([key, { name }]) => [
    key,
    {
      name,
      tint:  `var(--tutor-${key}-tint)`,
      base:  `var(--tutor-${key})`,
      shade: `var(--tutor-${key}-shade)`,
    },
  ])
)

export function getCoachColor(coachKey) {
  return COACH_COLORS[coachKey] || COACH_COLORS.owen  // default to Owen
}
