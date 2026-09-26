-- Suggestions accepted before 0027 have no result_id. Link them where the item they became can
-- be told apart: the same recording, the same moment and the same content; a checkpoint or
-- chapter that is already linked, or matches more than one suggestion, stays unlinked.
update media_suggestions s set result_id = c.id
  from media_checkpoints c
 where s.status = 'accepted' and s.result_id is null and s.kind = 'checkpoint'
   and c.media_id = s.media_id and c.at_sec = s.at_sec and c.data = s.data
   and not exists (select 1 from media_suggestions o where o.result_id = c.id)
   and (select count(*) from media_suggestions t
         where t.media_id = s.media_id and t.status = 'accepted' and t.kind = 'checkpoint'
           and t.at_sec = s.at_sec and t.data = s.data) = 1;

update media_suggestions s set result_id = h.id
  from media_chapters h
 where s.status = 'accepted' and s.result_id is null and s.kind = 'chapter'
   and h.media_id = s.media_id and h.at_sec = s.at_sec and h.title = s.data ->> 'title'
   and not exists (select 1 from media_suggestions o where o.result_id = h.id)
   and (select count(*) from media_suggestions t
         where t.media_id = s.media_id and t.status = 'accepted' and t.kind = 'chapter'
           and t.at_sec = s.at_sec and t.data ->> 'title' = h.title) = 1;
