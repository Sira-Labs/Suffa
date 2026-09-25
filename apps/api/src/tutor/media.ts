/**
 * Recording access for the tutor: a learner reads the transcript of a recording only when they
 * are an active member of its class and the recording is published (teachers: also drafts).
 */
import type { Actor } from '../authz/policies.js';
import type { ClassRepository } from '../classes/repository.js';
import type { InteractiveRepository } from '../media/interactive.js';
import type { MediaRepository } from '../media/repository.js';
import type { MediaAccess, MediaSegment } from './tools.js';

const WINDOW_SEC = 45;

export class ClassMediaAccess implements MediaAccess {
  constructor(
    private readonly media: Pick<MediaRepository, 'byId'>,
    private readonly classes: Pick<ClassRepository, 'scope'>,
    private readonly interactive: Pick<InteractiveRepository, 'transcript'>
  ) {}

  async segment(
    actor: Actor,
    mediaId: string,
    atSec: number
  ): Promise<MediaSegment | 'forbidden' | 'not_found'> {
    const item = await this.media.byId(mediaId);
    if (!item || item.status !== 'ready') return 'not_found';
    const { classRole } = await this.classes.scope(item.classId, actor.id);
    if (!classRole || (classRole === 'student' && !item.publishedAt)) return 'forbidden';
    const transcript = await this.interactive.transcript(mediaId);
    const cues = (transcript?.status === 'ready' ? transcript.cues : []).filter(
      (c) => c.end >= atSec - WINDOW_SEC && c.start <= atSec + WINDOW_SEC
    );
    return {
      title: item.title,
      fromSec: Math.max(0, Math.floor(atSec - WINDOW_SEC)),
      toSec: Math.ceil(atSec + WINDOW_SEC),
      text: cues.length
        ? cues.map((c) => `[${Math.floor(c.start)}s] ${c.text}`).join('\n')
        : '(no transcript for this part yet)',
    };
  }
}
