-- Persona rename: keys now match display names.
--   marcus → deon       (also a new voice, handled in code)
--   oliver → alistair
--   isla   → matilda    (nickname Tilly, handled in code)
--   sam    → owen        (new universal default)
--   jordan → jade
-- Migrate existing session rows, repoint the column default to 'owen', and add a
-- validation constraint. Run in the Supabase SQL Editor. Coordinate with the code
-- deploy (run this around the same time as the deploy).

-- Drop any pre-existing constraint FIRST — otherwise a stale/partial constraint
-- from an earlier run blocks the value UPDATEs (set persona='deon' would violate it).
alter table sessions drop constraint if exists sessions_persona_check;

-- Normalize stray whitespace, then remap old keys to the new names.
update sessions set persona = trim(persona);
update sessions set persona = 'deon'     where persona = 'marcus';
update sessions set persona = 'alistair' where persona = 'oliver';
update sessions set persona = 'matilda'  where persona = 'isla';
update sessions set persona = 'owen'     where persona = 'sam';
update sessions set persona = 'jade'     where persona = 'jordan';

-- Catch-all: any value still outside the new set → owen (the default).
update sessions set persona = 'owen'
  where persona not in ('deon', 'zoe', 'alistair', 'matilda', 'owen', 'jade');

alter table sessions alter column persona set default 'owen';
alter table sessions add constraint sessions_persona_check
  check (persona in ('deon', 'zoe', 'alistair', 'matilda', 'owen', 'jade'));
