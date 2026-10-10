import type { IconName } from './components/Icon';

/** Sections of the "Mehr" page. */
export type MoreGroup = 'media' | 'help' | 'me';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Short explanation, shown on the hub pages ("Üben", "Mehr"). */
  description: string;
  /**
   * primary: bottom bar on phones. training: listed on the "Üben" hub (practice across
   * all units). secondary: listed under "Mehr", in its group. The desktop sidebar shows
   * everything.
   */
  tier: 'primary' | 'training' | 'secondary';
  group?: MoreGroup;
  end?: boolean;
}

export const TRAINING_PATH = '/training';
export const CLASSES_PATH = '/classes';

export const MORE_GROUP_LABEL: Record<MoreGroup, string> = {
  media: 'Medien',
  help: 'Hilfe',
  me: 'Ich',
};

/**
 * Every destination of the app, in sidebar order. Labels are learner-facing (German).
 * Redesign v3 (tester feedback R6): the class gets its own tab, so learners and teachers
 * find it at once; practice of every kind sits under "Üben"; "Mehr" keeps only media,
 * help and the learner's own pages.
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
    to: CLASSES_PATH,
    label: 'Klasse',
    icon: 'people',
    description: 'Deine Klasse: Aufgaben, Aufnahmen, Challenge',
    tier: 'primary',
  },
  {
    to: TRAINING_PATH,
    label: 'Üben',
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
    to: '/reading',
    label: 'Lesen',
    icon: 'read',
    description: 'Dialoge mit Worterklärungen',
    tier: 'training',
  },
  {
    to: '/writing',
    label: 'Schreiben',
    icon: 'write',
    description: 'Abschreiben, Diktat und Übersetzung',
    tier: 'training',
  },
  {
    to: '/speaking',
    label: 'Sprechen',
    icon: 'speak',
    description: 'Nachsprechen, Aufnahme, Minimalpaare',
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
    to: '/discover',
    label: 'Entdecken',
    icon: 'compass',
    description: 'Ausgewählte Videos und Podcasts',
    tier: 'secondary',
    group: 'media',
  },
  {
    to: '/videos',
    label: 'Videolektionen',
    icon: 'play',
    description: 'Lektionen zum Buch auf YouTube, mit Fragen zwischendurch',
    tier: 'secondary',
    group: 'media',
  },
  {
    to: '/library',
    label: 'Buch-Medien',
    icon: 'listen',
    description: 'Alle Verlagsvideos und -audios zu Buch 1',
    tier: 'secondary',
    group: 'media',
  },
  {
    to: '/tutor',
    label: 'al-Muʿallim',
    icon: 'chat',
    description: 'Dein KI-Lehrer: fragen, üben, erklären lassen',
    tier: 'secondary',
    group: 'help',
  },
  {
    to: '/progress',
    label: 'Fortschritt',
    icon: 'chart',
    description: 'Stufe, Statistik, wackelige Wörter und Abzeichen',
    tier: 'secondary',
    group: 'me',
  },
  {
    to: '/settings',
    label: 'Einstellungen',
    icon: 'settings',
    description: 'Konto, Darstellung, Erinnerungen',
    tier: 'secondary',
    group: 'me',
  },
];

/**
 * The navigation for a role. Teachers mostly lead classes: their tab reads "Klassen" and
 * comes right after "Heute".
 */
export function navItemsFor(role: string | null | undefined): NavItem[] {
  if (role !== 'teacher' && role !== 'admin') return [...NAV_ITEMS];
  const classes = NAV_ITEMS.find((i) => i.to === CLASSES_PATH)!;
  const rest = NAV_ITEMS.filter((i) => i !== classes);
  return [
    rest[0]!,
    { ...classes, label: 'Klassen', description: 'Deine Klassen führen' },
    ...rest.slice(1),
  ];
}

export const MORE_PATH = '/more';

/** Pages reached from a "Mehr" page that are not listed there themselves. */
const MORE_SUBPAGES: readonly string[] = ['/badges', '/sources', '/admin', '/inhalte'];

/** Full-screen routes without navigation (one task at a time). */
export const FOCUS_PATHS: readonly string[] = ['/review', '/milestone', '/login'];

/** True for a focus route or anything below it (e.g. /milestone/1). */
export function isFocusPath(pathname: string): boolean {
  return FOCUS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function under(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** True when the "Üben" tab should be highlighted on mobile. */
export function isUnderTraining(pathname: string): boolean {
  if (under(pathname, TRAINING_PATH)) return true;
  return NAV_ITEMS.some((item) => item.tier === 'training' && under(pathname, item.to));
}

/** True when the "Klasse" tab should be highlighted (invite links included). */
export function isUnderClasses(pathname: string): boolean {
  return under(pathname, CLASSES_PATH) || under(pathname, '/join');
}

/** True when the "Mehr" tab should be highlighted on mobile. */
export function isUnderMore(pathname: string): boolean {
  if (pathname === MORE_PATH) return true;
  if (MORE_SUBPAGES.some((p) => under(pathname, p))) return true;
  return NAV_ITEMS.some((item) => item.tier === 'secondary' && under(pathname, item.to));
}
