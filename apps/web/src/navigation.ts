import type { IconName } from './components/Icon';
import i18n from './i18n';

/** Sections of the "Mehr" page. */
export type MoreGroup = 'media' | 'help' | 'me';

/** Key of a destination in the `nav` catalogue (label and short description). */
export type NavId =
  | 'today'
  | 'units'
  | 'classes'
  | 'classesTeacher'
  | 'training'
  | 'alphabet'
  | 'review'
  | 'vocab'
  | 'reading'
  | 'writing'
  | 'speaking'
  | 'roots'
  | 'conjugation'
  | 'exam'
  | 'discover'
  | 'videos'
  | 'library'
  | 'tutor'
  | 'progress'
  | 'settings'
  | 'content'
  | 'admin';

export interface NavItem {
  to: string;
  /** Label and description come from the `nav` catalogue (story 16.3). */
  id: NavId;
  icon: IconName;
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

/** Label and short description (shown on the "Üben" and "Mehr" hubs) in the UI language. */
export function navText(item: Pick<NavItem, 'id'>): {
  label: string;
  description: string;
} {
  return {
    label: i18n.t(`nav:items.${item.id}.label`),
    description: i18n.t(`nav:items.${item.id}.description`),
  };
}

/**
 * Every destination of the app, in sidebar order. Labels and descriptions live in the `nav`
 * catalogue.
 * Redesign v3 (tester feedback R6): the class gets its own tab, so learners and teachers
 * find it at once; practice of every kind sits under "Üben"; "Mehr" keeps only media,
 * help and the learner's own pages.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    id: 'today',
    icon: 'home',
    tier: 'primary',
    end: true,
  },
  {
    to: '/units',
    id: 'units',
    icon: 'path',
    tier: 'primary',
  },
  {
    to: CLASSES_PATH,
    id: 'classes',
    icon: 'people',
    tier: 'primary',
  },
  {
    to: TRAINING_PATH,
    id: 'training',
    icon: 'dumbbell',
    tier: 'primary',
  },
  {
    to: '/alphabet',
    id: 'alphabet',
    icon: 'write',
    tier: 'training',
  },
  {
    to: '/review',
    id: 'review',
    icon: 'cards',
    tier: 'training',
  },
  {
    to: '/vocab',
    id: 'vocab',
    icon: 'cards',
    tier: 'training',
  },
  {
    to: '/reading',
    id: 'reading',
    icon: 'read',
    tier: 'training',
  },
  {
    to: '/writing',
    id: 'writing',
    icon: 'write',
    tier: 'training',
  },
  {
    to: '/speaking',
    id: 'speaking',
    icon: 'speak',
    tier: 'training',
  },
  {
    to: '/roots',
    id: 'roots',
    icon: 'roots',
    tier: 'training',
  },
  {
    to: '/conjugation',
    id: 'conjugation',
    icon: 'conjugate',
    tier: 'training',
  },
  {
    to: '/exam',
    id: 'exam',
    icon: 'exam',
    tier: 'training',
  },
  {
    to: '/discover',
    id: 'discover',
    icon: 'compass',
    tier: 'secondary',
    group: 'media',
  },
  {
    to: '/videos',
    id: 'videos',
    icon: 'play',
    tier: 'secondary',
    group: 'media',
  },
  {
    to: '/library',
    id: 'library',
    icon: 'listen',
    tier: 'secondary',
    group: 'media',
  },
  {
    to: '/tutor',
    id: 'tutor',
    icon: 'chat',
    tier: 'secondary',
    group: 'help',
  },
  {
    to: '/progress',
    id: 'progress',
    icon: 'chart',
    tier: 'secondary',
    group: 'me',
  },
  {
    to: '/settings',
    id: 'settings',
    icon: 'settings',
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
  return [rest[0]!, { ...classes, id: 'classesTeacher' }, ...rest.slice(1)];
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
