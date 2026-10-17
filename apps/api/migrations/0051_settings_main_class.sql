-- Learners in several classes (story: main class): settings."mainClassId" is the class whose
-- course, colours and area unlocks shape the app. Null means the class the learner joined
-- first. Not a foreign key: a class that is gone or left is simply not used, and the app falls
-- back to the first joined. Older app versions do not send it; the sync keeps the stored value.
alter table settings add column if not exists "mainClassId" uuid;
