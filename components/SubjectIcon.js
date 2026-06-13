// Inline SVG icons for each subject — 24×24, stroke-based, brand-consistent.
// All use strokeWidth=1.5, strokeLinecap=round, strokeLinejoin=round, fill=none.

const PATHS = {
  english: (
    // Open book
    <>
      <path d="M2 7a2 2 0 012-2h6v14H4a2 2 0 01-2-2V7z"/>
      <path d="M22 7a2 2 0 00-2-2h-6v14h8V7z"/>
      <line x1="12" y1="5" x2="12" y2="19"/>
    </>
  ),
  humanities: (
    // Classical columns
    <>
      <path d="M3 21h18"/>
      <path d="M12 4L3 9h18L12 4z"/>
      <line x1="6"  y1="9" x2="6"  y2="21"/>
      <line x1="12" y1="9" x2="12" y2="21"/>
      <line x1="18" y1="9" x2="18" y2="21"/>
    </>
  ),
  history_us: (
    // Folded map
    <>
      <path d="M3 6l6 2 6-2 6 2v14l-6-2-6 2-6-2V6z"/>
      <line x1="9"  y1="8"  x2="9"  y2="20"/>
      <line x1="15" y1="6"  x2="15" y2="18"/>
    </>
  ),
  history_world: (
    // Globe
    <>
      <circle cx="12" cy="12" r="9"/>
      <path d="M3 12h18"/>
      <path d="M12 3a14 14 0 014 9 14 14 0 01-4 9 14 14 0 01-4-9 14 14 0 014-9z"/>
    </>
  ),
  social_studies: (
    // Two people
    <>
      <circle cx="9" cy="7" r="3"/>
      <path d="M3 21v-1a6 6 0 0112 0v1"/>
      <path d="M16 11a3 3 0 100-6"/>
      <path d="M21 21v-1a5 5 0 00-4.9-5"/>
    </>
  ),
  civics: (
    // Gavel
    <>
      <path d="M9 9l-5.5 5.5a2.12 2.12 0 000 3l.5.5a2.12 2.12 0 003 0L12.5 13"/>
      <path d="M12.5 13l2.5-2.5m1-5l3.5 3.5-2.5 2.5-3.5-3.5 2.5-2.5z"/>
      <line x1="4" y1="21" x2="20" y2="21"/>
    </>
  ),
  economics: (
    // Rising bar chart
    <>
      <line x1="3" y1="20" x2="21" y2="20"/>
      <rect x="4"  y="14" width="4" height="6" rx="1"/>
      <rect x="10" y="9"  width="4" height="11" rx="1"/>
      <rect x="16" y="4"  width="4" height="16" rx="1"/>
    </>
  ),
  science_biology: (
    // Leaf
    <>
      <path d="M6 20c0-6 4-11 15-11-1 8-6 13-15 11z"/>
      <path d="M6 20L3 17"/>
    </>
  ),
  science_chemistry: (
    // Flask / beaker
    <>
      <path d="M9 3h6M9 3v7l-5 10a1 1 0 001 1h14a1 1 0 001-1L15 10V3"/>
      <line x1="6.5" y1="15" x2="17.5" y2="15"/>
    </>
  ),
  science_physics: (
    // Atom
    <>
      <circle cx="12" cy="12" r="2"/>
      <ellipse cx="12" cy="12" rx="10" ry="4"/>
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/>
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>
    </>
  ),
  science_general: (
    // Mountain peaks
    <>
      <path d="M3 20l6.5-11 4 6 2.5-3.5L21 20H3z"/>
      <path d="M13 9l1.5-2.5"/>
    </>
  ),
  foreign_language: (
    // Speech bubble with "A"
    <>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
      <path d="M9 11l3-5 3 5M10.5 9.5h3"/>
    </>
  ),
  psychology: (
    // Brain outline
    <>
      <path d="M9.5 2A5.5 5.5 0 004 7.5c0 1.5.6 2.9 1.6 3.9A4 4 0 004 15a4 4 0 004 4h8a4 4 0 004-4 4 4 0 00-1.6-3.6A5.5 5.5 0 0014.5 2a5.5 5.5 0 00-5 3"/>
      <path d="M12 2v20"/>
    </>
  ),
  art: (
    // Artist's palette
    <>
      <path d="M12 2a10 10 0 00-8.3 15.5c.9 1.2 2.3 1.5 3.3.7L9 17a3 3 0 014 0l1 1c1 .8 2.4.5 3.3-.7A10 10 0 0012 2z"/>
      <circle cx="8"  cy="9"  r="1" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="7"  r="1" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="9"  r="1" fill="currentColor" stroke="none"/>
    </>
  ),
  drama: (
    // Comedy / tragedy masks
    <>
      <path d="M5 3a4 4 0 000 8"/>
      <path d="M5 11c0 1.5 1 3 2.5 3.5"/>
      <path d="M3 7h4M4 5c.5.5 1.5.5 2 0"/>
      <path d="M13 6a4 4 0 000 8"/>
      <path d="M13 14c0 1.5-1 3-2.5 3.5"/>
      <path d="M15 10h4M16 8.5c.5.5 1.5.5 2 0"/>
      <path d="M9 6l4 1"/>
    </>
  ),
  music: (
    // Music note
    <>
      <path d="M9 18V6l12-2v12"/>
      <circle cx="6"  cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </>
  ),
  computer_science: (
    // Code brackets </>
    <>
      <path d="M8 9l-3 3 3 3"/>
      <path d="M16 9l3 3-3 3"/>
      <line x1="14" y1="6" x2="10" y2="18"/>
    </>
  ),
  health: (
    // Heart
    <>
      <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 000-7.8z"/>
    </>
  ),
  personal_statement: (
    // Diploma / scroll
    <>
      <path d="M4 4a2 2 0 012-2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/>
      <path d="M9 7h6M9 11h6M9 15h4"/>
      <circle cx="17" cy="17" r="2.5"/>
      <path d="M19 19l2.5 2.5"/>
    </>
  ),
  other: (
    // Three dots
    <>
      <circle cx="5"  cy="12" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    </>
  ),
  unspecified: (
    // Books stack
    <>
      <rect x="3" y="15" width="18" height="4" rx="1"/>
      <rect x="5" y="10" width="14" height="4" rx="1"/>
      <rect x="7" y="5"  width="10" height="4" rx="1"/>
    </>
  ),
}

export default function SubjectIcon({ value = 'unspecified', size = 18, className = '', style = {} }) {
  const paths = PATHS[value] ?? PATHS.unspecified
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}
