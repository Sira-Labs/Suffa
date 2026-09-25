import type { IconName } from './components/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Short explanation, shown on the hub pages ("Training", "Mehr"). */
  description: string;
  /**
   * primary: bottom bar on phones. training: listed on the "Training" hub (practice across
   * all units). secondary: listed under "Mehr". The desktop sidebar shows everything.
   */
  tier: 'primary' | 'training' | 'secondary';
  end?: boolean;
}

export const TRAINING_PATH = '/training';

/**
 * Every destination of the app, in sidebar order. Labels are learner-facing (German).
 * Redesign v2: learners work inside a unit ("Einheit"); "Entdecken" is the curated media
 * library; "Training" gathers practice across all units.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Heute',
    icon: 'home',
    description: 'Dein Weg für heute',
    tier: 'primary',
    end: true,
  },
  {
    to: '/units',
    label: 'Einheit',
    icon: 'path',
    description: 'Stufen, Etappen und deine Einheit',
    tier: 'primary',
  },
  {
    to: '/discover',
    label: 'Entdecken',
    icon: 'compass',
    description: 'Ausgewählte Videos und Podcasts',
    tier: 'primary',
  },
  {
    to: TRAINING_PATH,
    label: 'Training',
    icon: 'dumbbell',
    description: 'Üben über alle Einheiten',
    tier: 'primary',
  },
  {
    to: '/alphabet',
    label: 'Alphabet',
    icon: 'write',
    description: 'Die 28 Buchstaben – für den Einstieg',
    tier: 'training',
  },
  {
    to: '/review',
    label: 'Wiederholen',
    icon: 'cards',
    description: 'Fällige Karten im Fokusmodus',
    tier: 'training',
  },
  {
    to: '/vocab',
    label: 'Vokabeln',
    icon: 'cards',
    description: 'Vokabeltrainer mit allen Übungsarten',
    tier: 'training',
  },
  {
    to: '/roots',
    label: 'Wurzeln',
    icon: 'roots',
    description: 'Wurzeln, Muster und Wortfamilien',
    tier: 'training',
  },
  {
    to: '/conjugation',
    label: 'Konjugation',
    icon: 'conjugate',
    description: 'Verbtabellen für alle Personen',
    tier: 'training',
  },
  {
    to: '/exam',
    label: 'Prüfung',
    icon: 'exam',
    description: 'Gemischte Tests über mehrere Einheiten',
    tier: 'training',
  },
  {
    to: '/tutor',
    label: 'al-Muʿallim',
    icon: 'chat',
    description: 'Dein KI-Lehrer: fragen, üben, erklären lassen',
    tier: 'secondary',
  },
  {
    to: '/badges',
    label: 'Abzeichen',
    icon: 'award',
    description: 'Deine Erfolge und der Weg zur nächsten Stufe',
    tier: 'secondary',
  },
  {
    to: '/classes',
    label: 'Klassen',
    icon: 'path',
    description: 'Deine Klasse beitreten oder als Lehrkraft führen',
    tier: 'secondary',
  },
  {
    to: '/library',
    label: 'Buch-Medien',
    icon: 'listen',
    description: 'Alle Verlagsvideos und -audios zu Buch 1',
    tier: 'secondary',
  },
  {
    to: '/reading',
    label: 'Lesen',
    icon: 'read',
    description: 'Dialoge mit Worterklärungen',
    tier: 'secondary',
  },
  {
    to: '/writing',
    label: 'Schreiben',
    icon: 'write',
    description: 'Abschreiben, Diktat und Übersetzung',
    tier: 'secondary',
  },
  {
    to: '/speaking',
    label: 'Sprechen',
    icon: 'speak',
    description: 'Nachsprechen, Aufnahme, Minimalpaare',
    tier: 'secondary',
  },
  {
    to: '/settings',
    label: 'Einstellungen',
    icon: 'settings',
    description: 'Darstellung, Tagesziel, Konto',
    tier: 'secondary',
  },
];

export const MORE_PATH = '/more';

/** Full-screen routes without navigation (one task at a time). */
export const FOCUS_PATHS: readonly string[] = ['/review', '/milestone'];

/** True for a focus route or anything below it (e.g. /milestone/1). */
export function isFocusPath(pathname: string): boolean {
  return FOCUS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function under(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** True when the "Training" tab should be highlighted on mobile. */
export function isUnderTraining(pathname: string): boolean {
  if (under(pathname, TRAINING_PATH)) return true;
  return NAV_ITEMS.some((item) => item.tier === 'training' && under(pathname, item.to));
}

/** True when the "Mehr" tab should be highlighted on mobile. */
export function isUnderMore(pathname: string): boolean {
  if (pathname === MORE_PATH) return true;
  return NAV_ITEMS.some(
    (item) =>
      item.tier === 'secondary' &&
      (pathname === item.to || pathname.startsWith(`${item.to}/`))
  );
}
