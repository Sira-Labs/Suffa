/**
 * Which practice areas are open for this user (story 18.2): the rules of their class (or the
 * defaults, e.g. roots from unit 3) against how far they got in the class's course. Teachers
 * and admins always see everything.
 */
import {
  AREA_IDS,
  areaAccess,
  isAreaId,
  reachedPosition,
  ruleFor,
  type AreaAccess,
  type AreaId,
} from '@suffa/engagement';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useRole } from '@/modules/account/useRole';
import { useClassContextStore, useEnrollmentStore, useSettingsStore } from '@/state';

/** Access to every area for the current user. */
export function useAreaAccessMap(): Record<AreaId, AreaAccess> {
  const role = useRole();
  const context = useClassContextStore((s) => s.context);
  const ownCourse = useSettingsStore((s) => s.settings.course);
  const exams = useEnrollmentStore((s) => s.exams);
  return useMemo(() => {
    const leads = role === 'teacher' || role === 'admin';
    const course = context?.course ?? ownCourse ?? 'bayna-yadayk';
    const position = reachedPosition(course, exams);
    return Object.fromEntries(
      AREA_IDS.map((area) => [
        area,
        leads ? { open: true } : areaAccess(ruleFor(context?.unlocks, area), position),
      ])
    ) as Record<AreaId, AreaAccess>;
  }, [role, context, ownCourse, exams]);
}

/** Access for a navigation id (anything that is not an area is always open). */
export function accessOf(map: Record<AreaId, AreaAccess>, id: string): AreaAccess {
  return isAreaId(id) ? map[id] : { open: true };
}

/** Why an area is still closed, in the UI language. */
export function useLockReason() {
  const { t } = useTranslation('nav');
  return (access: AreaAccess) =>
    access.open
      ? ''
      : access.reason === 'unit'
        ? t('locked.fromUnit', { unit: access.unit })
        : t('locked.byTeacher');
}

/** Shows the page only while its area is open; else says when it opens. */
export function AreaGate({ area, children }: { area: AreaId; children: ReactNode }) {
  const { t } = useTranslation('nav');
  const access = useAreaAccessMap()[area];
  const reason = useLockReason();
  if (access.open) return <>{children}</>;
  return (
    <div className="card stack" role="status" style={{ alignItems: 'flex-start' }}>
      <span className="row" style={{ gap: '0.5rem' }}>
        <Icon name="lock" />
        <strong>{t(`items.${area}.label`)}</strong>
      </span>
      <p style={{ margin: 0 }}>{reason(access)}</p>
      <Link to="/training">{t('locked.back')}</Link>
    </div>
  );
}
