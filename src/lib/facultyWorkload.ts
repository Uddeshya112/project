import type { ClassSession, Faculty } from '../types';

export function facultyTeachingCap(faculty: Faculty): number {
  if (faculty.designation === 'Assistant Professor') return 16;
  if (faculty.designation === 'Professor' || faculty.designation === 'Associate Professor') return 14;
  // Visiting appointments retain their explicit contract value because no shared cap is specified.
  return faculty.maxDirectTeachingHours || faculty.weeklyHoursLimit || 40;
}

/**
 * Weekly periods a teacher is in class. A multi-period block is stored either as one session with
 * durationPeriods, or as one session per period that each carry the block's durationPeriods; both count
 * the block once.
 */
export function facultyTeachingPeriods(sessions: ClassSession[], facultyId: string): number {
  const blocks = new Map<string, { periods: Set<string>; duration: number }>();
  let total = 0;
  for (const session of sessions) {
    if (session.facultyId !== facultyId || session.status === 'Cancelled') continue;
    // A lecture taken by several groups together is one class; every other type is counted per group.
    const key = session.type === 'Lecture'
      ? `${session.courseId}:${session.day}`
      : `${session.courseId}:${session.sectionId}:${session.subSectionId ?? ''}:${session.type}:${session.day}`;
    const block = blocks.get(key) ?? { periods: new Set<string>(), duration: 0 };
    block.periods.add(session.timeSlotId);
    blocks.set(key, { ...block, duration: Math.max(block.duration, Number(session.durationPeriods) || 1) });
  }
  for (const block of blocks.values()) total += Math.max(block.periods.size, block.duration);
  return total;
}
