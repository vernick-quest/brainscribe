---
name: brainscribe-design
description: Use this skill to generate well-branded interfaces and assets for BrainScribe, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick map
- `readme.md` — full design guide: brand context, content/voice rules, visual foundations, iconography, and a manifest of everything here.
- `styles.css` — the single global entry point. Link this one file; it `@import`s all tokens (`tokens/colors.css`, `typography.css`, `spacing.css`, `effects.css`, `fonts.css`).
- `tokens/` — CSS custom properties. Reference semantic aliases (`--accent`, `--text-strong`, `--surface-card`, `--shadow-spark`) over raw scale values.
- `guidelines/` — foundation specimen cards (color, type, spacing, brand).
- `components/` — React primitives (`core/`, `forms/`, `tutor/`), each with a `.jsx`, a `.d.ts` props contract, and a `.prompt.md` usage note.
- `ui_kits/app/` — interactive recreation of the student app (login → tutor picker → voice session → teacher transcript).
- `assets/` — logo lockup, brain-bulb mark, bulb-only.

## The one-paragraph brief
BrainScribe is a Socratic, voice-first writing tutor for middle/high schoolers
(ADHD-friendly). It never writes for the student — it asks coaching questions, the
student speaks their thinking, and a scribe cleans it into a paragraph they approve.
Brand = **navy ink + warm orange spark on cream paper**. Voice = warm, brief,
encouraging coach. Orange is reserved for *voice & action* (mic, primary CTAs, focus).
Soft corners, warm low shadows, gentle motion, words over icons, basically no emoji.
