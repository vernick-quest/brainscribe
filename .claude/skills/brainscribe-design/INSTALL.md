# Installing the BrainScribe design system into Claude Code

This folder is a self-contained **Agent Skill**. `SKILL.md` (with YAML frontmatter)
is the entry point; everything else is the design system it references.

## Option A — Claude Code Skill (recommended)

Drop the whole `brainscribe-design/` folder into a skills directory so Claude Code
auto-discovers it:

```bash
# Project-scoped (committed with the repo, shared with the team):
mkdir -p .claude/skills
cp -R brainscribe-design .claude/skills/

# — or — user-scoped (available in every project on your machine):
mkdir -p ~/.claude/skills
cp -R brainscribe-design ~/.claude/skills/
```

The folder name must stay `brainscribe-design` (it matches `name:` in `SKILL.md`).
Restart Claude Code if it's already running. Then just ask Claude to "use the
brainscribe-design skill" — or it will surface on its own when you're building
BrainScribe UI.

## Option B — Plain reference folder

If you don't want it as a skill, drop the folder anywhere in your repo (e.g.
`design/brainscribe/`) and point Claude Code at `readme.md`. It's the full design
guide and works standalone — `SKILL.md` is just a thin wrapper around it.

## What's inside

| Path | What it is |
|------|------------|
| `SKILL.md` | Skill manifest + quick map (read first) |
| `readme.md` | Full design guide: brand, voice, color/type/spacing, iconography |
| `styles.css` | Single CSS entry point — link this; it `@import`s all tokens |
| `tokens/` | CSS custom properties (colors, typography, spacing, effects, fonts) |
| `components/` | React primitives — each has `.jsx`, a `.d.ts` props contract, `.prompt.md` usage notes |
| `ui_kits/app/` | Interactive recreation of the student app (login → session → transcript) |
| `guidelines/` | Foundation specimen cards (color/type/spacing/brand) — open in a browser |
| `assets/` | Logo lockup, brain-bulb mark, wordmark |

## Notes for implementation

- The HTML files in `guidelines/` and `components/` are **design references** —
  recreate them in your codebase's existing framework (the product is Next.js /
  React 19), not by shipping the HTML.
- Fonts load from the Google Fonts CDN via `tokens/fonts.css`. For offline/self-hosted
  builds, drop `.woff2` files in `assets/fonts/` and swap the `@import` for `@font-face`.
- `_ds_bundle.js` / `_ds_manifest.json` are generated artifacts included only so the
  specimen HTML renders standalone — you don't need to edit or ship them.
