/**
 * Renders a tutor answer: paragraphs and "- " lists, **bold**, and Arabic runs through
 * ArabicText (Arabic font, right-to-left, the learner's tashkīl level). Plain React nodes only,
 * never HTML from the model.
 */
import type { ReactNode } from 'react';
import { ArabicText } from '@/components';

// Arabic words with the spaces and Arabic punctuation between them (not the Latin sentence
// punctuation around them, which belongs to the German or English sentence).
const ARABIC_RUN =
  /([\u0600-\u06FF\u0750-\u077F](?:[\u0600-\u06FF\u0750-\u077F\s،؛]*[\u0600-\u06FF\u0750-\u077F؟])?)/;

function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).flatMap((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    const content = bold ? bold[1]! : part;
    const pieces = content.split(ARABIC_RUN).map((piece, j) => {
      if (j % 2 === 0) return piece;
      // Spaces around an Arabic run stay outside the RTL span, between the words.
      const [, before, arabic, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(piece)!;
      return (
        <span key={`${key}-${i}-${j}`}>
          {before}
          <ArabicText>{arabic!}</ArabicText>
          {after}
        </span>
      );
    });
    return bold ? [<strong key={`${key}-${i}`}>{pieces}</strong>] : pieces;
  });
}

export function TutorText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, b) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={b} className="tutor-list">
              {lines.map((l, i) => (
                <li key={i} dir="auto">
                  {inline(l.replace(/^\s*[-•]\s+/, ''), `${b}-${i}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={b} dir="auto" className="tutor-paragraph">
            {lines.map((l, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {inline(l, `${b}-${i}`)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}
