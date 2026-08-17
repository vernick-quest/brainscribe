# Waitlist / `subscribers` — COPPA review

**Prepared by:** auth-coppa lane (engineering) · **Date:** 2026-08-16
**Status:** MEMO for Robert + counsel. One narrow code fix shipped (§5); everything
else is deliberately NOT built pending counsel.

**This is not legal advice.** I own the consent flow, not the legal judgment. Below I
separate what I *verified in the code and data* (fact) from what I *believe follows*
(engineering read, for counsel to confirm or correct).

---

## 1. Facts — verified independently, not inherited

Confirming the conductor's findings against `main`:

| Claim | Verified |
|---|---|
| `subscribers` stores email + source + timestamps, nothing else identifying | ✅ migrations 044, 066 — columns are `id, email, source, created_at, invited_at, invited_code, dismissed_at` |
| No delete path touches `subscribers` | ✅ grep across `app/api` — the only writers are `/api/subscribe` and `/api/admin/waitlist`. `deleteUser()` cannot reach it: the table has **no FK** to `profiles` or `auth.users`, so nothing cascades |
| Waitlist form has **no age gate** | ✅ neither `components/NewsletterSignup.js` nor `app/api/subscribe/route.js` asks age, birthdate, or anything 13-related |
| `/api/subscribe` auto-emails `source='waitlist'` | ✅ `sendWaitlistAck` via `after()`, gated on a genuine new insert |
| Admin can send an access code to any listed address | ✅ `app/api/admin/waitlist/route.js` → `sendWaitlistCode`, stamps `invited_at` |

**Live data (3 rows, all `source='waitlist'`, none invited yet):**
- 2 rows match existing profiles, both `age_bracket='13plus'` — the known adults.
- 1 row has **no profile** (never signed up). It is on a Japanese school domain
  (`*.ed.jp`). ⚠️ I would not record this one as "confirmed adult": a school domain
  is consistent with either staff or a student. Robert has emailed them personally
  and may know which; until then treat the age as **unknown**, not adult.

**Three findings I added:**

**(a) The Privacy Policy does not disclose this collection at all.** Answering Q5
directly. The "we collect only what we need" list enumerates six categories —
Account information, Assignment content, Voice/spoken text, Session transcripts,
Written paragraphs, Relationship data — every one of them scoped to an
**account holder** ("provided when you sign in with Google"). An email address
collected from a **non-account visitor** via a marketing form is not covered by any
of them. There is also no marketing/newsletter/waitlist section anywhere in the
document.

**(b) A related line is now inaccurate.** The policy says *"Resend — Used to send
notification emails to teachers and parents."* As of today Resend also mails a
waitlist acknowledgment to someone who is neither a teacher, nor a parent, nor an
account holder.

**(c) The acknowledgment email's own copy promises a second contact:** *"We'll email
you a code as soon as there's room."* That matters for Q1 — see below.

---

## 2. What the questions turn on

COPPA reaches this **only if** either (i) the waitlist is part of a service
"directed to children," or (ii) we have actual knowledge we collected from an
under-13.

Relevant prior work: `docs/specs/brainscribe-coppa-marketing-posture-2026-07.md`
walked the live landing copy and concluded it is **parent-directed** (no mascots, no
kid-voiced copy, no child-directed CTAs; the conversion action is an adult one). The
waitlist form renders on `app/page.js` (landing) and `app/blog/page.js` — both
marketing surfaces covered by that analysis. **That is the strongest fact in our
favour** and counsel should be given it.

The counterweight, also ours: BrainScribe targets grades 6–12, which **includes
under-13s by design**, and we run a consent flow precisely because we know that.
That is what puts the waitlist in "mixed audience" territory rather than plainly
outside COPPA — and mixed-audience is exactly where the age-screen question lives.

---

## 3. The six questions

**Q1 — Does the one-time-contact exception (16 CFR 312.5(c)(3)) cover the ack?**
*Engineering read: no, and the blocker is not the ack itself.* That exception is
written around collecting online contact info to respond **once**, then deleting it.
Two features of our mechanism sit outside that shape, both verifiable in our own
code: we **retain indefinitely** (no deletion, no policy — Q4), and the ack email
**states in writing that we will email again** ("we'll email you a code"). A
mechanism whose stated purpose is a later second contact is not a one-time response.
The conductor's instinct here reads correct to me. **Counsel to confirm.**

**Q2 — Does the multiple-contact exception (312.5(c)(4)) apply?**
*Engineering read: it is the right shelf, but we do not meet its condition.* That
exception contemplates contacting more than once, but conditions it on reasonable
efforts to give the **parent** direct notice and an opportunity to opt out. We give
**no parental notice at any point** in the waitlist flow — there is no parent in the
flow at all. So if COPPA reaches this and we are relying on (c)(4), we are relying on
an exception whose condition is unmet. **Counsel to confirm, including whether the
notice obligation is triggered only once we have reason to believe a subscriber is a
child.**

**Q3 — Should `subscribers` be swept by the COPPA deletion path?**
**Yes — and this one I shipped, because it does not depend on the legal answer.** See
§5. Regardless of how Q1/Q2/Q4 resolve, there is no reading in which we must *retain*
a deleted under-13's email in a marketing table. And we already promise the opposite
in our own published words (§5).

**Q4 — Should there be a retention policy on `subscribers`?**
*There is none today — confirmed.* A row persists forever, including after the
person is invited, redeems, and becomes a normal account holder (the two adult rows
are exactly that). My recommendation is yes, but the **duration** is a legal input I
should not invent. Options for counsel: (i) purge on redemption, once the address has
become an account; (ii) fixed TTL for uncontacted rows; (iii) purge on request only.
**Not built.**

**Q5 — Does the privacy policy disclose this?**
**No.** See §1(a) and §1(b). This is a fact about our own document, so I can answer it
outright — the collection is undisclosed and one adjacent sentence is now inaccurate.
Draft language is in §6, but I did **not** edit the policy: it is a legal document
with counsel review already open, and unilaterally rewriting it is exactly what the
constraint forbids.

**Q6 — Would an age affirmation change the analysis?**
*Two different things are being conflated, and the distinction is the whole answer.*
- A **checkbox reading "I'm 13 or older, or I'm a parent"** telegraphs the correct
  answer and gives the user a reason to tick it. As a compliance artifact I would
  expect that to be worth little; it mostly documents that we asked.
- A **neutral age screen** — asking birth year or age without signalling which
  answer unlocks the form, and not letting a rejected user immediately retry with a
  different answer — is a recognised mechanism for mixed-audience services, and is
  what would actually change the posture.

So: not worthless *in principle*, but worthless *as phrased in the question*. If
counsel wants an age gate here, it should be specced as a neutral screen. **Counsel
to decide whether one is needed at all; I have not built either version.**

---

## 4. Recommendation on the two features shipped today

The conductor offered to pull both. **My recommendation: pull neither, yet.**

- **The auto-acknowledgment — keep.** It is a single response to a request the person
  affirmatively made, which is the *least* exposed part of this. It exists because
  someone asked on 2026-07-29 and was still sitting in silence on 08-16; pulling it
  reinstates a concrete harm to fix a hypothetical one. The exposure lives in
  retention and disclosure, not in answering someone who wrote to us.
- **The admin code-send — keep, with a human check.** It is admin-initiated, not
  automatic; a person decides each time. That human step is the control. **Do not
  send a code to an address you have reason to believe belongs to a child** — which
  today means the `.ed.jp` school-domain row should not be invited until Robert has
  confirmed who is behind it.

**The trigger that changes this:** if counsel says the waitlist needs an age screen,
the auto-ack should pause until that screen ships — because at that point we would
be knowingly auto-contacting unknown-age addresses after being told not to.

---

## 5. The one change shipped

`app/api/cron/coppa-cleanup/route.js` — when the 7-day rule deletes an unconsented
under-13, their address is now also purged from `subscribers` (both the pending-row
path and the profile-side sweep; the email is read before the profile cascades).
Best-effort and counted as `subscribersPurged` in the run summary; a failure is
logged, never fatal, since the account deletion has already succeeded.

**Why this is not presuming a legal answer.** We already commit to this in our own
published words, three times in the Privacy Policy — the account and *"all associated
data"* are *"permanently deleted"* — and once to the child's face in `/welcome`:
*"If nobody sets it up within 7 days, we delete everything we've collected."* An
address left in `subscribers` made those statements untrue. Fixing that is making
behaviour match an existing promise, not taking a position on Q1, Q2, Q4 or Q6.

**No migration required** — this is a DELETE against an existing table, no schema
change. (For the record, the ledger reads `select max(version) from
public.schema_migrations` = **067**, so the next number would be 068 if one were
ever needed here.)

Build green; 522/522 tests pass.

**Related, NOT changed:** the admin user-delete path also leaves `subscribers`
behind. That affects adults and is a CCPA/GDPR-shaped question rather than a COPPA
one, so I left it alone and flag it here.

---

## 6. What to send counsel

1. Q1 and Q2 as framed above, with the two facts that drive them: **indefinite
   retention** and **an ack email that promises a later second contact**.
2. Q4 — the retention duration, which is a legal input, not an engineering choice.
3. Q6 — whether a **neutral** age screen is required on a mixed-audience marketing
   form, and whether a self-attestation checkbox has any value.
4. Q5 — approve disclosure language. Proposed, for counsel to edit:
   > **Waitlist and email updates** — if you ask for early access or to follow the
   > blog, we store the email address you give us so we can reply and let you know
   > when access is available. We do not use it for anything else, and you can ask us
   > to remove it at any time by emailing brainscribe.io@gmail.com.

   Plus a correction to the Resend line, which currently says "teachers and parents"
   and no longer describes all of its use.
5. **Jurisdiction, which nobody has asked yet:** one of the three rows is a Japanese
   address. COPPA is US law; a non-US minor sits under a different regime (Japan's
   APPI, and GDPR/UK-GDPR set the digital-consent age between 13 and 16 depending on
   member state). If the waitlist is open to the world — it is — counsel should say
   which regimes we are accepting exposure to. This also bears on the crisis-resource
   work, which already ships US-only hotline numbers with an international fallback.

**Urgency: low, and the conductor sized it correctly.** Three rows, none confirmed to
be a child, mechanism open but unexercised. This is a fix-before-it-matters item. The
one thing I would not leave open indefinitely is §1(a) — an undisclosed collection is
a live inaccuracy in a published document, independent of who is on the list.
