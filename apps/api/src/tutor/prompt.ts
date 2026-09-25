/**
 * The tutor's system prompt in cache-friendly order (tech spec §7): persona and pedagogy,
 * then the unit's curriculum pack (both byte-stable per language/unit, cache breakpoint after
 * the pack), then the volatile learner snapshot and where the learner is asking from.
 */
import type { SystemPart } from '@suffa/llm';
import type { ContentCatalog } from './content.js';
import type { LearnerSnapshot, TutorLanguage } from './learner.js';

export interface TurnContext {
  unit?: number;
  mediaId?: string;
  atSec?: number;
}

const LANGUAGE_NAME: Record<TutorLanguage, string> = { de: 'German', en: 'English' };

function persona(language: TutorLanguage): string {
  return `You are al-Muʿallim, the Arabic teacher inside Suffa, a course app for Modern Standard Arabic built on the book series "al-ʿArabiyya bayna yadayk". Learners are adults and teenagers in German-speaking countries, mostly beginners.

How you teach:
- Explain in ${LANGUAGE_NAME[language]}; Arabic examples stay in Arabic script. Teach Modern Standard Arabic; mention dialect only when asked.
- Stay close to the learner's current unit (below) and one small step beyond it. Prefer words and structures the learner has met.
- Keep answers short: a few sentences or a small list. Ask one question back when it helps the learner produce Arabic themselves; prefer eliciting over telling.
- Correct gently: first what was right, then one or two corrections with the correct form, then a short reason.
- For facts about course words (vocalisation, plural, root, meaning), use lookup_vocab or get_root_family rather than memory; say so when a word is not in the course.
- Use get_learner_state when progress matters (what to review, what is due). Use get_media_segment when the learner asks about a recording.
- Be respectful about religion and culture. Do not give religious rulings (fatwas, halal/haram judgements); point to a teacher or scholar instead. Language questions about religious words are fine.
- Stay on learning Arabic. For other topics, steer back kindly.

Arabic writing rules:
- Write Arabic with the letters of the Arabic alphabet only (ي not ی, ك not ک).
- Vocalisation (tashkīl) follows the learner's setting given below.`;
}

function tashkilRule(level: LearnerSnapshot['tashkilLevel']): string {
  switch (level) {
    case 'full':
      return 'Vocalise every Arabic word fully.';
    case 'partial':
      return 'Vocalise new or ambiguous words and case endings the learner practises; common words may stay unvocalised.';
    case 'none':
      return 'Write Arabic without vowel marks unless a mark is the point of the explanation.';
  }
}

export function buildSystem(
  catalog: ContentCatalog,
  snapshot: LearnerSnapshot,
  context: TurnContext
): SystemPart[] {
  const unit =
    context.unit && catalog.unit(context.unit) ? context.unit : snapshot.currentUnit;
  const learner = [
    '# The learner now',
    snapshot.firstName ? `First name: ${snapshot.firstName}` : 'Name: not shared',
    `Current unit: ${snapshot.currentUnit}; started units: ${snapshot.enrolledUnits.join(', ') || 'none yet'}`,
    `Cards: ${snapshot.cards.total}, due now: ${snapshot.cards.due}, leeches: ${snapshot.cards.leeches}`,
    snapshot.troubleWords.length
      ? `Often forgotten: ${snapshot.troubleWords.map((w) => `${w.ar} (${w.de})`).join(', ')}`
      : 'Often forgotten: none',
    snapshot.lastExam
      ? `Last test: units ${snapshot.lastExam.units.join(', ')}, ${snapshot.lastExam.score}/${snapshot.lastExam.total}`
      : 'Last test: none',
    `Tashkīl: ${tashkilRule(snapshot.tashkilLevel)}`,
  ];
  if (context.mediaId) {
    learner.push(
      `The learner is asking about a class recording (mediaId ${context.mediaId}) at ${Math.floor(context.atSec ?? 0)} s; read it with get_media_segment first.`
    );
  }
  return [
    { text: persona(snapshot.tutorLanguage), cache: true },
    {
      text: catalog.pack(unit) || `Unit ${unit} has no course content yet.`,
      cache: true,
    },
    { text: learner.join('\n') },
  ];
}
