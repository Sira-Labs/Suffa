-- Pronunciation assessment on the server (story 15.2, ADR-0022).
-- * classes.server_speech: may the class's learners send their own recordings to the
--   server's speech recogniser (Mistral EU) for letter feedback? Null = the default: on,
--   off for classes of minors (stricter default). Audio is processed and dropped, never
--   stored.
alter table classes add column if not exists server_speech boolean;
