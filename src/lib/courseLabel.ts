import type { Course } from '../types';

/** The course name, or nothing when it only repeats the code. */
export const courseName = (course?: Course): string =>
  course && course.name.trim().toUpperCase() !== course.code.trim().toUpperCase() ? course.name : '';

export const courseLabel = (course: Course, separator = ' · '): string =>
  [course.code, courseName(course)].filter(Boolean).join(separator);
