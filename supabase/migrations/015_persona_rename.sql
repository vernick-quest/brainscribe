-- Persona rename: keys now match display names.
--   marcus → deon       (also a new voice, handled in code)
--   oliver → alistair
--   isla   → matilda    (nickname Tilly, handled in code)
--   sam    → owen        (new universal default)
--   jordan → jade
-- Migrate existing session rows, repoint the column default to 'owen', and add a
-- validation constraint. Run in the Supabase SQL Editor. Coordinate with the code
-- deploy (run this around the same time as the deploy).

update sessions set persona = 'deon'     where persona = 'marcus';
update sessions set persona = 'alistair' where persona = 'oliver';
update sessions set persona = 'matilda'  where persona = 'isla';
update sessions set persona = 'owen'     where persona = 'sam';
update sessions set persona = 'jade'     where persona = 'jordan';

alter table sessions alter column persona set default 'owen';

alter table sessions drop constraint if exists sessions_persona_check;
alter table sessions add constraint sessions_persona_check
  check (persona in ('deon', 'zoe', 'alistair', 'matilda', 'owen', 'jade'));
