# Testing checklist — 2026-06-21 session

Everything shipped in the 2026-06-21 session, grouped by area. All changes are
live on www.brainscribe.io and on branch `feat/persona-rename`.

**Accounts:** admin (`brainscribe.io@gmail.com`), student (`vernick@gmail.com`),
plus a parent + teacher (or remote-in from admin).

## Google sign-in (OAuth)
- [ ] Admin account logs in cleanly
- [ ] Student account logs in cleanly
- [ ] A *different* Google account (not a test user) can log in — confirms the app is Published, not Testing
- [ ] Consent screen shows "BrainScribe" + logo (revoke at myaccount.google.com/permissions → incognito to see it fresh)

## Admin remote-in (the Baron fix)
- [ ] Expand a user on the admin page → click one of *their* sessions → land in it remoted-in as that user, greeted with that user's name
- [ ] The coach greeting name = the session owner, even right after remoting into someone else
- [ ] The standalone "Remote in" button still jumps to the user's dashboard
- [ ] Exit remote-in via the banner returns to admin

## Student Assignments (dashboard redesign)
- [ ] "Your assignments" title + orange New assignment button
- [ ] Watcher line ("… can see your work") appears when a parent/teacher is linked
- [ ] Filter pills (All / In progress / Done) filter correctly; empty filter shows "Nothing here yet."
- [ ] Rows show coach avatar, 2-line title, `subject · coach · updated · status`
- [ ] Teacher chip: assigned teacher shows with the Google "G" badge; "+ Add teacher" opens the email popover → sending invites a teacher
- [ ] Overflow menu: Rename (inline, Enter saves / Esc cancels), Open, Delete all work
- [ ] Deleting your last assignment → redirected to the New-assignment page

## New assignment (Option A)
- [ ] Back link → Assignments
- [ ] "Use a sample assignment" fills the field; CTA disabled until the field is non-empty
- [ ] Upload a photo/PDF → OCR fills the assignment text
- [ ] Coach grid: selecting a coach shows the glow + updates the description line
- [ ] "Start writing with {coach}" creates the session and opens the coach
- [ ] Visiting `/write` redirects to `/assignment/new`

## Coach workspace (declutter)
- [ ] No sidebar; "← My assignments" back-link returns to the dashboard
- [ ] Coach switcher (3-dot by the coach name) still switches coaches
- [ ] Bubbles, draft panel, mic, and scribe all behave as before (engine unchanged)

## FTUE onboarding (resume + restyle)
- [ ] Reset a student's onboarding flag in Admin → student is routed through the FTUE
- [ ] "Step X of 7" indicator shows; restyled cards (cream bg, raised cards, pill dots) look right
- [ ] Advance partway, reload → resumes at the same step (tour memory)
- [ ] Start the practice, write a bit, close the tab, reopen → drops you back into the practice (not the tour)
- [ ] Complete → transcript (Step 7 banner) → reflection → dashboard

## Parent dashboard (parent account or remote-in)
- [ ] One block per child, each listing that child's assignments
- [ ] "View profile" → read-only student profile (stats + writing profile)
- [ ] "Your writing" block (parent's own work) with "+ New"
- [ ] Try opening a non-child's `/profile/<id>` by URL → should redirect (access gate)

## Teacher dashboard (teacher account or remote-in)
- [ ] Collapsible block per student (expand/collapse); auto-open if only one student
- [ ] Notification bell in the header opens (newly mounted today)
- [ ] "View writing profile" link works; access gate holds for non-students

## Legal pages
- [ ] `/privacy` and `/terms`: new layout (sticky TOC + "short version" callout), our copy
- [ ] TOC highlights the active section as you scroll; clicking a TOC item jumps
- [ ] Narrow the window < 820px → collapses to one column
- [ ] Footer Privacy/Terms links resolve

## Transcript
- [ ] Conversation renders as bubbles (coach gray-left, student navy-right), matching the session
- [ ] Final draft, assignment, and (for parent/teacher) writing profile all still show

---

## Known deferred (not bugs)
- Coaching-session redesign (iMessage bubbles, split/stacked toggle, "Working on" context bar) — intentionally NOT applied; existing session preserved.
- Desktop split↔stacked layout toggle — deferred preference.
- Teacher feedback-count bubble, teacher roster picker + remove-teacher — no backend yet.
- Free-sessions usage meter — built but behind `SHOW_USAGE_METER=false`.
