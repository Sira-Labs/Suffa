import type { IconName } from './components/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Short explanation, shown on the "Mehr" page. */
  description: string;
  /** Primary items sit in the mobile bottom bar; secondary ones live under "Mehr". */
  tier: 'primary' | 'secondary';
  end?: boolean;
}

/** Every destination of the app, in sidebar order. Labels are learner-facing (German). */
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
    label: 'Einheiten',
    icon: 'path',
    description: 'Buch 1 als Lernpfad',
    tier: 'primary',
  },
  {
    to: '/library',
    label: 'Hören',
    icon: 'listen',
    description: 'Offizielle Audios und Videos zum Buch',
    tier: 'primary',
  },
  {
    to: '/roots',
    label: 'Wurzeln',
    icon: 'roots',
    description: 'Wurzeln, Muster und Wortfamilien',
    tier: 'primary',
  },
  {
    to: '/vocab',
    label: 'Vokabeln',
    icon: 'cards',
    description: 'Vokabeltrainer mit allen Übungsarten',
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
    description: 'Diktat und Übersetzung',
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
    to: '/conjugation',
    label: 'Konjugation',
    icon: 'conjugate',
    description: 'Verbtabellen für alle Personen',
    tier: 'secondary',
  },
  {
    to: '/exam',
    label: 'Prüfung',
    icon: 'exam',
    description: 'Gemischte Tests über mehrere Einheiten',
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

/** True when the "Mehr" tab should be highlighted on mobile. */
export function isUnderMore(pathname: string): boolean {
  if (pathname === MORE_PATH) return true;
  return NAV_ITEMS.some(
    (item) =>
      item.tier === 'secondary' &&
      (pathname === item.to || pathname.startsWith(`${item.to}/`))
  );
}
