import type { DayOfWeek } from '../types';

/** Poll options written by hand hold only the time; the ones picked from the timetable already start with the day. */
export const pollOptionLabel = (option: { day: DayOfWeek; timeSlotLabel: string }): string =>
  option.timeSlotLabel.startsWith(option.day) ? option.timeSlotLabel : `${option.day} · ${option.timeSlotLabel}`;
