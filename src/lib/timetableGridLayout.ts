export interface GridLayoutSlot {
  id: string;
  isBreak?: boolean;
  isLunch?: boolean;
}

export interface GridLayoutSession {
  day: string;
  timeSlotId: string;
  type: string;
  durationPeriods?: number;
  courseId?: string;
  facultyId?: string;
  sectionId?: string;
  subSectionId?: string;
  roomId?: string;
  status?: string;
}

/** Labs and practicals both run in a lab, in blocks of consecutive periods. */
export const isPracticalType = (type: string): boolean => type === 'Lab' || type === 'Practical';

const blockKey = (s: GridLayoutSession) =>
  [s.type, s.courseId, s.facultyId, s.sectionId, s.subSectionId, s.roomId, s.status, s.durationPeriods].join('|');

/**
 * Rows taken by the cell at each period of a day; 0 means the cell belongs to the lab block above it.
 * A block is merged only when every parallel class in it is a lab of the same length. Its later periods are
 * stored either as no session at all or as one session per period, and must hold nothing else.
 */
function rowSpans(sessions: readonly GridLayoutSession[], day: string, slots: readonly GridLayoutSlot[]): number[] {
  const cells = slots.map((): GridLayoutSession[] => []);
  const indexOf = new Map(slots.map((slot, index) => [slot.id, index]));
  for (const session of sessions) {
    const index = session.day === day ? indexOf.get(session.timeSlotId) : undefined;
    if (index !== undefined) cells[index].push(session);
  }
  const keys = cells.map((cell) => cell.map(blockKey).sort().join('\n'));
  const spans = slots.map(() => 1);
  for (let start = 0; start < slots.length; start += spans[start]) {
    const cell = cells[start];
    const lengths = new Set(cell.map((session) => Math.max(1, Number(session.durationPeriods) || 1)));
    const span = lengths.values().next().value ?? 1;
    if (lengths.size !== 1 || span < 2 || start + span > slots.length || !cell.every((session) => isPracticalType(session.type))) continue;
    // A later period of a block that could not be merged is not the start of another one.
    if (start > 0 && spans[start - 1] === 1 && cell.some((session) => cells[start - 1].some((earlier) => blockKey(earlier) === blockKey(session)))) continue;
    const block = Array.from({ length: span }, (_, k) => start + k);
    if (block.some((i) => slots[i].isBreak || slots[i].isLunch || /break|lunch/i.test(slots[i].id))) continue;
    if (block.slice(1).some((i) => cells[i].length > 0 && keys[i] !== keys[start])) continue;
    block.forEach((i) => { spans[i] = 0; });
    spans[start] = span;
  }
  return spans;
}

const spanAt = (sessions: readonly GridLayoutSession[], day: string, timeSlotId: string, slots: readonly GridLayoutSlot[]): number => {
  const index = slots.findIndex((slot) => slot.id === timeSlotId);
  return index < 0 ? 1 : rowSpans(sessions, day, slots)[index];
};

export function getGridCellRowSpan(sessions: readonly GridLayoutSession[], day: string, timeSlotId: string, slots: readonly GridLayoutSlot[]): number {
  return Math.max(1, spanAt(sessions, day, timeSlotId, slots));
}

/** True when the cell is part of a lab block that starts in an earlier period. */
export function isGridCellCoveredByLab(sessions: readonly GridLayoutSession[], day: string, timeSlotId: string, slots: readonly GridLayoutSlot[]): boolean {
  return spanAt(sessions, day, timeSlotId, slots) === 0;
}
