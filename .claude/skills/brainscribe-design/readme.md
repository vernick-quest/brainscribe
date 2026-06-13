# BrainScribe Design System

A warm, modern, voice-first design system for **BrainScribe** — a Socratic writing
tutor for middle- and high-school students. The product helps kids develop *their
own* ideas: an AI tutor asks coaching questions, the student talks through their
thinking (speech-to-text), and a "scribe" tidies what they said into a paragraph
they approve. Teachers and parents can read the transcript to see the process and
confirm the work is genuinely the student's.

This system exists so any designer or agent can build on-brand BrainScribe
interfaces, assets, and prototypes — in production or as throwaway mocks.

---

## Sources

Everything here was reverse-engineered from materials provided by the team. If you
have access, explore them to build with even higher fidelity:

- **GitHub — product codebase:** `https://github.com/vernick-quest/brainscribe`
  A Next.js 16 / React 19 app (Supabase auth + Anthropic SDK). The real UX patterns
  live here: `components/TutorSession.js` (two-panel chat + document), `MicButton.js`,
  `NewSessionForm.js`, `lib/prompts.js` (the tutor + scribe system prompts),
  `app/dashboard`, `app/transcript`, `app/(auth)/login`.
- **Logo:** provided as `uploads/BrainScribe Logo.png`, preserved in
  `assets/brainscribe-logo-original.png`.

> ⚠️ **Brand vs. scaffolding.** The codebase ships with create-next-app's default
> indigo/purple Tailwind palette — that is *not* the brand. The real identity comes
> from the logo: **deep navy + warm orange on cream.** This system uses the logo
> palette and treats the indigo in the repo as incidental scaffolding to be replaced.

---

## Content fundamentals — how BrainScribe talks

The voice is a **warm, patient coach** — never a know-it-all, never babyish. It
talks *to* a teenager with respect, keeps things short, and celebrates effort.

- **Person:** Second person ("you", "your essay"). The tutor refers to itself by its
  persona name ("Sage", "Zip") rather than "I, the AI".
- **Tone:** Encouraging, curious, calm. It asks rather than tells. Questions over
  instructions: *"What's the strongest reason you believe that?"* not *"Add a reason."*
- **Brevity:** One question at a time (two max). 1–3 sentences. No preamble, no
  lecturing. Students with ADHD are the core audience — every extra word is friction.
- **Never writes for them.** Copy constantly reinforces ownership: *"using ONLY the
  ideas you expressed"*, *"let's build on **your** idea."* The product's integrity
  promise is in the words.
- **Gentle on "thin" work.** When an answer is sparse, never scold. The signature
  line pattern: *"You shared a good starting idea — let's build on it!"*
- **Casing:** Sentence case everywhere — buttons ("Add to essay", "Start writing"),
  headings, labels. Reserve UPPERCASE for tiny eyebrow labels only.
- **Punctuation & warmth:** Em dashes for a friendly aside, exclamation points used
  sparingly for genuine wins. A single waving-hand 👋 on the dashboard greeting is the
  *only* sanctioned emoji — see Iconography. No exclamation-spam, no slang cosplay.
- **Examples of in-product copy:**
  - CTA: *"Start writing with BrainScribe"* / *"Start writing"*
  - Empty state: *"Your paragraphs will appear here as you build your essay…"*
  - Mic: *"Tap to speak your answer"*
  - Review: *"Scribed paragraph — your review"* → *"Add to essay"*, *"Edit"*, *"Discard"*
  - Login: *"Your voice-first writing tutor."* / *"BrainScribe is invite-only."*
  - Tutor question: *"Nice setup. Now — what's one moment where Ponyboy starts to see
    things differently?"*

---

## Visual foundations

The feeling is **encouraging paper** — a calm cream page, navy ink for trust and
structure, and a single warm orange "spark" that marks the places where the
student's voice comes in. Friendly, never clinical; focused, never busy.

- **Color.** Three pillars: **Navy** (`#14385A`, the "BRAIN" wordmark) for headings,
  structure, and the student's own chat bubbles; **Orange** (`#F0811E`, the lightbulb)
  reserved for *voice & action* — the mic, primary CTAs, focus rings, highlights; and
  **Cream** (`#FDFBF3`) as the page "paper". Warm near-black **Ink** (`#211D17`) for
  body copy — never pure black. Semantic hues are soft and supportive: a calm green
  for "added", a warm amber for the "thin — build on this" flag, a muted clay red for
  destructive actions. Four **tutor-persona** accents (navy / orange / green / violet)
  distinguish coaching styles. See `tokens/colors.css`.
- **Type.** Display & headings in **Bricolage Grotesque** (warm, modern, a little
  expressive — friendly without being childish). UI & body in **Plus Jakarta Sans**
  (geometric, highly legible). Verbatim/raw transcript text in **JetBrains Mono** to
  signal "this is exactly what was said." Generous line-height (`1.65`) on reading
  copy to keep focus. Display tracking is tight (−0.02em); eyebrow labels use wide
  uppercase tracking. See `tokens/typography.css`.
- **Spacing.** 8px base grid, intentionally roomy — whitespace is a feature for a
  focusing student. Reading columns cap at ~42rem. Minimum touch target 44px. See
  `tokens/spacing.css`.
- **Backgrounds.** Flat warm cream. **No gradients** as surfaces, no photographic
  hero washes, no busy patterns. The only "glow" in the system is the soft orange
  drop-shadow under the mic and primary CTAs (`--shadow-spark`) — energy exactly where
  the voice happens.
- **Corners.** Soft and friendly throughout — `14px` default cards/inputs, `20px`
  feature cards, full pills for buttons, chips, the mic, and avatars. Nothing sharp.
- **Cards.** Soft white paper on cream, a 1px warm hairline border (`--border-default`),
  and a low, warm **navy-tinted** shadow (`--shadow-sm`) — a gentle lift, never a hard
  drop. Variants: `muted` (cream, borderless), `ink` (navy panel), `raised`.
- **Shadows.** Warm navy-tinted, low-alpha, layered. Elevation ramps xs→lg; the
  orange `spark` shadow is special-purpose (mic / hero CTA only).
- **Borders.** 1px hairlines for structure; 1.5px on interactive controls. Focus is
  a 3px warm orange ring (`--focus-ring`), never the browser default.
- **Motion.** Gentle and reassuring. Ease-out fades and small lifts (`translateY(-2px)`
  on card hover), 120–360ms. The one looping animation is the mic's listening pulse —
  expanding rings that say "I'm hearing you." **No bounce, no spin, no parallax.** All
  motion respects `prefers-reduced-motion`.
- **Hover / press.** Hover deepens the fill one orange/navy step (or adds a faint navy
  tint on ghost/secondary). Press shrinks slightly (`scale(0.985–0.95)`) and nudges
  down 1px — a physical, tactile "tap".
- **Transparency & blur.** Used sparingly. The selected-tutor ring uses a
  `color-mix` translucent halo; otherwise surfaces are solid for legibility.
- **Imagery vibe.** Warm. The logo's brain-bulb is golden-orange line art on cream.
  If photography is ever introduced, keep it warm-toned and bright — never cold or
  desaturated.

---

## Iconography

- **Approach:** Minimal, line-first, low-count. BrainScribe leans on **clear words
  over icons** — a focusing student shouldn't have to decode a glyph. Icons appear
  only where they earn it: the **mic** (voice capture), the **speaker** (read aloud),
  small directional/status marks (check, stop, chevron).
- **What's in the codebase:** The repo carries only create-next-app's default SVGs
  (`file/globe/next/vercel/window.svg`) — none are brand assets, so they are **not**
  imported here. The mic and speaker icons are hand-built into the `MicButton` and
  `ChatBubble` components as simple, single-path glyphs matching a ~1.8px stroke /
  solid-fill style.
- **Recommended set:** For anything beyond the built-ins, use **Lucide**
  (`https://lucide.dev`, CDN-available) — its rounded 2px stroke matches the friendly,
  soft-cornered brand. *(Substitution flag: Lucide is a recommendation, not a set
  shipped by the team — confirm before standardizing.)*
- **Emoji:** Essentially off. The **only** sanctioned emoji is a single 👋 in the
  dashboard greeting ("Hey, Maya 👋"), inherited from the codebase. Do not introduce
  others — no emoji bullets, no emoji in buttons.
- **Unicode marks:** A few are used as quiet UI furniture — `…` (truncation / "thinking"),
  `↑` (pointing to the review card), `“ ”` curly quotes around raw spoken text.

---

## Foundations index — what's in this system

**Tokens** (`styles.css` imports all of these — consumers link `styles.css` only):
- `tokens/fonts.css` — webfont loading (Bricolage Grotesque, Plus Jakarta Sans, JetBrains Mono)
- `tokens/colors.css` — full palette + semantic aliases + tutor personas
- `tokens/typography.css` — families, scale, weights, line-heights, type roles
- `tokens/spacing.css` — 8px scale, container widths, touch target
- `tokens/effects.css` — radii, borders, warm shadows, focus rings, motion

**Specimen cards** (`guidelines/`, shown in the Design System tab):
Colors (brand, navy, orange, cream, ink, semantic, tutors), Type (display, body,
mono, scale), Spacing (scale, radii, shadows), Brand (logo, mark).

**Components** (`components/`, React + `.d.ts` + `.prompt.md`, bundled to
`window.BrainScribeDesignSystem_eceaf4`):
- `core/` — `Button`, `Badge`, `Card`, `Avatar`
- `forms/` — `Input` (text + multiline)
- `tutor/` — `MicButton`, `ChatBubble`, `ScribePreview`, `TutorCard`

**UI kit** (`ui_kits/app/`): the interactive student app — Login → Tutor picker →
Dashboard → Session (chat + document + mic + scribe) → Teacher transcript. See its
own `README.md`.

**Assets** (`assets/`): `brainscribe-logo.png` (full lockup), `brainscribe-mark.png`
(brain-bulb badge), `brainscribe-bulb.png` (bulb only), `brainscribe-logo-original.png`.

**Other:** `SKILL.md` (Agent Skills wrapper for Claude Code).

---

## Known substitutions / flags
- **Fonts** are loaded from the Google Fonts CDN (`tokens/fonts.css`), not self-hosted
  binaries — so the compiler reports "Fonts: none" (no local `@font-face`). The three
  families are the intended choices; if you need offline/self-hosted fonts, drop the
  `.woff2` files in `assets/fonts/` and replace the `@import` with `@font-face` rules.
- **Tutor personas** (Sage / Zip / Coach / Muse / Quill / Nova) are a brand extension of
  the single tutor prompt in the codebase, added per the product brief.
- **Lucide** is a recommended icon set, not one the team ships — confirm before adopting.
