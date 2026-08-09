// Simplified lightbulb-brain mark matching the BrainScribe logo.
//
// Currently has no consumers — kept because it is the only theme-adaptive logo
// asset in the repo (`/brainscribe-logo.png` is a navy lockup that needs a
// separate dark export). The base rects sit directly on the page background, so
// they follow --text-strong; the brain squiggles are hardcoded navy on purpose,
// because they sit on the orange bulb, which is the same color in both themes.
// components/Logo.test.js holds that invariant if this ever gets wired up.
export default function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bulbGrad" x1="32" y1="4" x2="32" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5A623"/>
          <stop offset="100%" stopColor="#F07B20"/>
        </linearGradient>
      </defs>
      {/* Bulb body */}
      <path d="M32 4C21.5 4 13 12.5 13 23c0 7.2 3.9 13.5 9.7 16.9V44h18.6v-4.1C47.1 36.5 51 30.2 51 23 51 12.5 42.5 4 32 4z" fill="url(#bulbGrad)"/>
      {/* Brain squiggles */}
      <path d="M24 20c0-1.1.9-2 2-2s2 .9 2 2M30 20c0-1.1.9-2 2-2s2 .9 2 2M36 20c0-1.1.9-2 2-2s2 .9 2 2" stroke="#1E2D5A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M22 25c2 0 3.5-1 4-2.5M30 25c0 0 1 2 3 2s3-2 3-2M38 25c.5 1.5 2 2.5 4 2.5" stroke="#1E2D5A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M25 30c1.5 1 3.5 1.5 7 1.5s5.5-.5 7-1.5" stroke="#1E2D5A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      {/* Base */}
      <rect x="22.5" y="44" width="19" height="3" rx="1.5" fill="var(--text-strong)"/>
      <rect x="24.5" y="48.5" width="15" height="3" rx="1.5" fill="var(--text-strong)"/>
      <rect x="26.5" y="53" width="11" height="3" rx="1.5" fill="var(--text-strong)"/>
    </svg>
  )
}
