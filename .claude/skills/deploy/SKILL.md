---
name: deploy
description: Build and deploy BrainScribe to production on Vercel, then verify the live site. Use when the user asks to deploy, ship, push to prod, or release.
---

# Deploy BrainScribe to production

Run this only when the user explicitly asks to deploy (it's outward-facing). Production is aliased to **www.brainscribe.io**; the remote build is atomic, so a failed build never swaps prod.

## Steps

1. **Show what will ship.** Run `git status -s`, the current branch, and the last commit so it's clear what's going out. Note that `vercel deploy --prod` ships the working tree, not just committed code — call out any uncommitted changes.

2. **Build + test gate.** Run `npm run build` AND `npm run test:run`. If EITHER fails, STOP and report — do not deploy. The Vitest suite is fast (~0.2s), pure, and deterministic, so a red test is a real regression in a safety/auth invariant (COPPA gate, open-redirect guard, access/Beta-Circle rules, greeting resolver), not flake. Do NOT add a skip/override flag and do NOT deploy around a red test — fix the code or, if the test itself is wrong, fix the test first.

3. **Deploy.** Run `vercel deploy --prod --yes`.

4. **Verify the live site.** Run each check and compare to the expected status (`curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' <url>`):

   | URL | Expect |
   |---|---|
   | `https://www.brainscribe.io/login` | `200` |
   | `https://brainscribe.vercel.app/login` | `308` → `https://www.brainscribe.io/login` (canonical-host redirect) |
   | `https://brainscribe.vercel.app/api/cron/coppa-cleanup` | `401` (NOT redirected — the Cron bearer path must stay reachable) |

5. **Report** the production URL from the deploy output plus a pass/fail table for the three checks. If the `308` or `401` check fails, surface it loudly — it usually means a regression in the canonical-host logic in `lib/supabase/middleware.js`.
