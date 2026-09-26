-- 0028 could link a suggestion to one of several identical checkpoints or chapters (same
-- recording, moment and content). Such a link is a guess: drop it, the suggestion stays
-- accepted as before 0027.
update media_suggestions s set result_id = null
 where s.kind = 'checkpoint' and s.result_id is not null
   and exists (select 1 from media_checkpoints c where c.id = s.result_id)
   and (select count(*) from media_checkpoints d
         where d.media_id = s.media_id and d.at_sec = s.at_sec and d.data = s.data) > 1;

update media_suggestions s set result_id = null
 where s.kind = 'chapter' and s.result_id is not null
   and exists (select 1 from media_chapters h where h.id = s.result_id)
   and (select count(*) from media_chapters d
         where d.media_id = s.media_id and d.at_sec = s.at_sec
           and d.title = s.data ->> 'title') > 1;
