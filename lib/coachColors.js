// lib/coachColors.js
// Single source of truth for per-coach accent colors. Do NOT hardcode these hex
// values anywhere else — import getCoachColor / COACH_COLORS from here.
export const COACH_COLORS = {
  owen:     { name: 'Sage',       tint: '#EAF0E9', base: '#8BA888', shade: '#5A7357' },
  deon:     { name: 'Amber',      tint: '#F7EBD9', base: '#C88A3D', shade: '#8F5E22' },
  zoe:      { name: 'Coral',      tint: '#FBEAE6', base: '#E08A7A', shade: '#A85647' },
  alistair: { name: 'Slate Blue', tint: '#E8EDF2', base: '#7A94AB', shade: '#4C6377' },
  tilly:    { name: 'Teal',       tint: '#E2F0EE', base: '#5FA8A0', shade: '#367069' },
  jade:     { name: 'Plum',       tint: '#F0E7EF', base: '#9B6A93', shade: '#6B4165' },
}
export function getCoachColor(coachKey) {
  return COACH_COLORS[coachKey] || COACH_COLORS.owen  // default to Owen
}
