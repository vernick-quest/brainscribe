-- 056 — Keep the words a [DONE:id:text] carried, so a broken promise can be RESTORED
--
-- Migration 054 recorded WHICH components the coach promised were saved. That makes loss
-- provable, but it does not make it recoverable: when the client's read loop dies partway
-- through a stream, it discards the entire turn, while the server has already persisted
-- the token-STRIPPED message. Any text that existed only inside a [DONE:id:exact words]
-- token is then gone from every store we have.
--
-- Storing the inline text alongside the commitment closes that: the same server-side
-- record that proves the promise now also carries what was promised.
--
-- Still written by the SERVICE ROLE only (see 054) — a client that could edit this could
-- forge the evidence used to check its own work.

alter table public.coach_commitments
  add column if not exists inline_text text;

comment on column public.coach_commitments.inline_text is
  'The exact words a [DONE:id:text] token carried, captured server-side from the raw '
  'stream in /api/tutor. Present only when the coach inlined the text. Recovery source of '
  'last resort when the client never persisted it.';
