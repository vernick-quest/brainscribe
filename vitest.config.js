import { defineConfig } from 'vitest/config'
import { transformWithOxc } from 'vite'
import { fileURLToPath } from 'node:url'

// This repo puts JSX in `.js` files (see CLAUDE.md), and Vite infers the parser
// from the extension — so before this, importing any component from a test was
// a hard parse error and no test could render one. Setting `oxc.include` is not
// enough: it makes oxc process `.js`, but still as plain JS. The language has
// to be named explicitly, which is what this does.
//
// Scoped to app/ and components/ so lib/ (plain JS, already tested) keeps its
// current transform path untouched.
const jsxInJs = {
  name: 'brainscribe:jsx-in-js',
  enforce: 'pre',
  transform(code, id) {
    if (!/\/(app|components)\/[^?]*\.js(\?|$)/.test(id)) return null
    return transformWithOxc(code, id, { lang: 'jsx' })
  },
}

export default defineConfig({
  plugins: [jsxInJs],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { environment: 'node', include: ['**/*.test.js'], exclude: [
      'node_modules/**', '.next/**',
      // Nested agent worktrees live under .claude/worktrees/ INSIDE this checkout.
      // Without this, `**/*.test.js` collects another branch's suite into this
      // one's gate: the run doubles in size and can fail for reasons that have
      // nothing to do with the code being shipped. A green gate has to mean THIS
      // checkout is green.
      '.claude/**', '**/.claude/worktrees/**',
    ] },
})
