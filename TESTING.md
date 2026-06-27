# Testing checklist — 2026-06-21 session

Everything shipped in the 2026-06-21 session, grouped by area. All changes are
live on www.brainscribe.io and on branch `feat/persona-rename`.

Status key: ✅ verified · 🔧 fixed today, needs (re)test · ⬜ not yet tested

**Accounts:** admin (`brainscribe.io@gmail.com`), student (`vernick@gmail.com`),
plus a parent + teacher (or remote-in from admin).

## Google sign-in (OAuth)
- [x] ✅ Admin account logs in cleanly
- [x] ✅ Student account logs in cleanly
- [x] ✅ Consent screen shows "BrainScribe" + logo
- [ ] 🔧 A *brand-new* Google account's **first** sign-in lands on age/role with **no bounce to /login** (fixed by making `/welcome` public — re-test with a fresh account)

## Admin remote-in
- [x] ✅ Coach greeting uses the **session owner's** name (Baron fix), even right after remoting into someone else
- [x] ✅ Exit remote-in returns to admin
- [ ] 🔧 **"Remote in" on a student** now lands on *their* assignments dashboard (was bouncing to /admin — redirect-order fixed)
- [ ] 🔧 Expand a user → click one of their sessions → land in it remoted-in as that user
- [ ] 🔧 **Delete user** (new): trash icon → confirm → user + all their data gone, list refreshes; deleting your own admin account is refused
- [ ] 🔧 **Red impersonation banner** persists into the coach workspace (remote-in → open an assignment → red "Viewing as…" bar stays at top)

## Student Assignments (dashboard redesign)
- [ ] ⬜ "Your assignments" title + orange New assignment button
- [ ] ⬜ Watcher line ("… can see your work") appears when a parent/teacher is linked
- [ ] ⬜ Filter pills (All / In progress / Done) filter correctly; empty filter shows "Nothing here yet."
- [ ] ⬜ Rows show coach avatar, 2-line title, `subject · coach · updated · status`
- [ ] ⬜ Teacher chip: assigned teacher shows with the Google "G" badge; "+ Add teacher" opens the email popover → sending invites a teacher
- [ ] ⬜ Overflow menu: Rename (inline), Open, Delete all work
- [ ] ⬜ Deleting your last assignment → redirected to the New-assignment page

## New assignment (Option A)
- [ ] ⬜ Back link → Assignments
- [ ] ⬜ "Use a sample assignment" fills the field; CTA disabled until non-empty
- [ ] ⬜ Upload a photo/PDF → OCR fills the assignment text
- [ ] ⬜ Coach grid: selecting a coach shows the glow + updates the description line
- [ ] ⬜ "Start writing with {coach}" creates the session and opens the coach
- [ ] ⬜ Visiting `/write` redirects to `/assignment/new`

## Coach workspace (declutter)
- [ ] ⬜ No sidebar; "← My assignments" back-link returns to the dashboard
- [ ] ⬜ Coach switcher (3-dot by the coach name) still switches coaches
- [ ] ⬜ Bubbles, draft panel, mic, and scribe all behave as before (engine unchanged)

## FTUE onboarding (resume + restyle)
- [ ] ⬜ Reset a student's onboarding flag in Admin → student is routed through the FTUE
- [ ] ⬜ "Step X of 7" indicator shows; restyled cards (cream bg, raised cards, pill dots) look right
- [ ] ⬜ Advance partway, reload → resumes at the same step (tour memory)
- [ ] ⬜ Start the practice, write a bit, close the tab, reopen → drops you back into the practice (not the tour)
- [ ] ⬜ Complete → transcript (Step 7 banner) → reflection → dashboard

## Parent dashboard (parent account or remote-in)
- [ ] ⬜ One block per child, each listing that child's assignments
- [ ] ⬜ "View profile" → read-only student profile (stats + writing profile)
- [ ] ⬜ "Your writing" block (parent's own work) with "+ New"
- [ ] ⬜ Try opening a non-child's `/profile/<id>` by URL → should redirect (access gate)

## Parent-initiated child linking (Entry Point B — new 2026-06-27)
Parent generates an invite link for their child; child claims it and is linked.
- [ ] ⬜ Empty parent dashboard (no children) shows "Add a child" + updated copy
- [ ] ⬜ "Add a child" card opens → enter child email → "Generate link" → copyable `/invite?token=…`
- [ ] ⬜ Entering the **parent's own** email is rejected ("That's your own email…")
- [ ] ⬜ Open the link in a fresh Google account → claims it → child is linked, appears on the parent dashboard
- [ ] ⬜ Claimed child still runs **their own** age-first onboarding (`/welcome`): under-13 → COPPA parent-email step; 13+ → normal student start. Linking is **not** parental consent — verify an under-13 child is still held at `/coppa/pending` until real consent
- [ ] ⬜ An existing **confirmed parent/teacher** account opening a student invite is refused ("already set up as a {role}")
- [ ] ⬜ Reusing an already-claimed link → "This invite has already been used."
- [ ] ⬜ A **student** account hitting `POST /api/invites` with `role:'student'` is rejected ("Only parents can invite a child."); a **parent** sending a `parent`/`teacher` invite is rejected ("Only students…")

## Teacher dashboard (teacher account or remote-in)
- [ ] ⬜ Collapsible block per student (expand/collapse); auto-open if only one student
- [ ] ⬜ Notification bell in the header opens (newly mounted today)
- [ ] ⬜ "View writing profile" link works; access gate holds for non-students

## Legal pages
- [ ] ⬜ `/privacy` and `/terms`: new layout (sticky TOC + "short version" callout), our copy
- [ ] ⬜ TOC highlights the active section on scroll; clicking a TOC item jumps
- [ ] ⬜ Narrow the window < 820px → collapses to one column
- [ ] ⬜ Footer Privacy/Terms links resolve

## Transcript
- [ ] ⬜ Conversation renders as bubbles (coach gray-left, student navy-right), matching the session
- [ ] ⬜ Final draft, assignment, and (for parent/teacher) writing profile all still show

## Mobile pass (iPhone 15 Pro, ~393px)
- [ ] 🔧 Assignments rows: no overlap — avatar-only teacher chip + "+" on phone; title and ⋯ don't collide (fixed, verify)
- [ ] 🔧 "Your assignments" header: New-assignment button stacks under the title on phone (fixed, verify)
- [ ] ⬜ New assignment: coach grid 2-up, CTA row wraps, upload box + textarea fit
- [ ] ⬜ Parent dashboard: child blocks, "View profile" pill, "Your writing" — no overlap
- [ ] ⬜ Teacher dashboard: collapsible student blocks, notification-bell panel, own-writing
- [ ] ⬜ FTUE: cards centered, dots + Step badge fit; practice/coach screens fit
- [ ] ⬜ Coach workspace: Coach/Draft tabs (not side-by-side), bar controls fit, back = arrow only
- [ ] ⬜ Legal pages collapse to one column; TOC wraps
- [ ] ⬜ Transcript bubbles fit the width

---

## Known deferred (not bugs)
- Coaching-session redesign (iMessage bubbles, split/stacked toggle, "Working on" context bar) — intentionally NOT applied; existing session preserved.
- Desktop split↔stacked layout toggle — deferred preference.
- "New assignment" while remoted-in (create *as* the student) — deferred; create currently attributes to the logged-in admin, so impersonating admins are kept out of the create page.
- Teacher feedback-count bubble, teacher roster picker + remove-teacher — no backend yet.
- Free-sessions usage meter — built but behind `SHOW_USAGE_METER=false`.
