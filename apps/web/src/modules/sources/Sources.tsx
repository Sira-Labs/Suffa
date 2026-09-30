/**
 * Sources and licences (ADR-0023, ADR-0025): where every piece of content comes from, under
 * which terms, and a link to the original. Naming a source does not replace permission:
 * book texts and pictures stay at their sources until the rights holders allow more.
 */
import { MADINAH_BOOKS } from '@/services/courses';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function Sources() {
  const madinah = MADINAH_BOOKS[0]!;
  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <h1>Quellen & Lizenzen</h1>
        <p className="muted" style={{ margin: 0 }}>
          Suffa ist kostenlos. Was wir selbst schreiben, steht hier als „eigene Inhalte“.
          Bücher, Aufnahmen und Videos anderer zeigen wir an ihrer Quelle oder verlinken
          sie; wir kopieren sie nicht.
        </p>
      </header>

      <section className="card stack" aria-labelledby="src-madinah">
        <h2 id="src-madinah" style={{ margin: 0 }}>
          Medina-Kurs (دروس اللغة العربية)
        </h2>
        <p style={{ margin: 0 }}>
          Von Dr. V. Abdur Rahim, früher Islamische Universität Medina. Das Buch, die
          Lösungen und die Schlüssel werden laut den PDFs „nur zur persönlichen Nutzung,
          mit freundlicher Erlaubnis von Dr. V. Abdur Rahim“ bereitgestellt.
        </p>
        <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem', gap: '0.3rem' }}>
          <li>
            Buch, Lösungen, Schlüssel, Notizen:{' '}
            <a href={madinah.sources.overview} {...external}>
              AbdurRahman.org
            </a>{' '}
            und{' '}
            <a
              href={`https://archive.org/details/${madinah.sources.archiveItem}`}
              {...external}
            >
              archive.org
            </a>
            ; in den Lektionen zeigen wir die Buchseiten als Seitenbilder, die archive.org
            aus dem PDF erzeugt und von dort geladen werden.
          </li>
          <li>
            Dasselbe Buch gibt es gedruckt als „Madinah Arabic Reader“ bei{' '}
            <a href={madinah.sources.goodword} {...external}>
              Goodword Books
            </a>{' '}
            (© Goodword). Zu jeder Lektion nennen wir nur Buch und Seite dieser Ausgabe;
            ihre Seiten zeigen wir nicht.
          </li>
          <li>
            Aufnahmen der Lektionen von Dr. V. Abdur Rahim:{' '}
            <a href={madinah.sources.audioCollection} {...external}>
              archive.org
            </a>
            , direkt von dort abgespielt.
          </li>
          <li>
            Eigene Inhalte von Suffa: deutsche Wortbedeutungen, Grammatik-Erklärungen,
            Beispielsätze und Übungen. Welche Wörter eine Lektion einführt, ist eine
            Tatsache aus dem Buch.
          </li>
        </ul>
      </section>

      <section className="card stack" aria-labelledby="src-bayna">
        <h2 id="src-bayna" style={{ margin: 0 }}>
          Al-Arabiyya bayna Yadayk (العربية بين يديك)
        </h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem', gap: '0.3rem' }}>
          <li>
            Audio und Seitenvideos zum Buch: © Arabic for All (العربية للجميع), alle
            Rechte beim Verlag; abgespielt vom Server des Verlags bzw. von YouTube.{' '}
            <a href="https://www.arabicforall.net" {...external}>
              arabicforall.net
            </a>
          </li>
          <li>
            Eigene Inhalte von Suffa: Wortlisten mit Bedeutungen, Dialoge, Verbtabellen,
            Grammatik und Übungen.
          </li>
        </ul>
      </section>

      <section className="card stack" aria-labelledby="src-more">
        <h2 id="src-more" style={{ margin: 0 }}>
          Weitere Quellen
        </h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem', gap: '0.3rem' }}>
          <li>
            Beispielsätze:{' '}
            <a href="https://tatoeba.org" {...external}>
              Tatoeba
            </a>{' '}
            (
            <a href="https://creativecommons.org/licenses/by/2.0/fr/" {...external}>
              CC BY 2.0 FR
            </a>
            ), von Suffa vokalisiert und teils berichtigt; die Autorin oder der Autor
            steht bei jedem Satz.
          </li>
          <li>Entdecken: Videos gehören ihren Kanälen und laufen über YouTube.</li>
          <li>Schriften: Amiri, Reem Kufi, Manrope, Fraunces (SIL Open Font License).</li>
        </ul>
      </section>

      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Wünscht ein Rechteinhaber etwas anderes, passen wir es umgehend an oder nehmen es
        heraus.
      </p>
    </div>
  );
}
