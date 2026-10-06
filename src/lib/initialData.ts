import type { TimeSlot, AcademicYearConfig, AcademicConstraint, WhatIfSimulation } from '../types';

export interface StudentRecord {
  id: string;
  studentId: string;
  name: string;
  email: string;
  programCode: string;
  batchYear: number;
  semester: number;
  sectionId: string;
  sectionName: string;
  subSectionId: string;
  subSectionName: string;
}

// Default teaching day. Coordinators can change slots and working days per academic year.
export const TIME_SLOTS: TimeSlot[] = [
  { id: 'ts-1', periodNumber: 1, startTime: '08:00', endTime: '09:00', label: '08:00 - 09:00' },
  { id: 'ts-2', periodNumber: 2, startTime: '09:00', endTime: '10:00', label: '09:00 - 10:00' },
  { id: 'ts-3', periodNumber: 3, startTime: '10:00', endTime: '11:00', label: '10:00 - 11:00' },
  { id: 'ts-4', periodNumber: 4, startTime: '11:00', endTime: '12:00', label: '11:00 - 12:00' },
  { id: 'ts-5', periodNumber: 5, startTime: '12:00', endTime: '13:00', label: '12:00 - 13:00 (Lunch)', isLunch: true, isBreak: true },
  { id: 'ts-6', periodNumber: 6, startTime: '13:00', endTime: '14:00', label: '13:00 - 14:00' },
  { id: 'ts-7', periodNumber: 7, startTime: '14:00', endTime: '15:00', label: '14:00 - 15:00' },
  { id: 'ts-8', periodNumber: 8, startTime: '15:00', endTime: '16:00', label: '15:00 - 16:00' },
];

export const INITIAL_ACADEMIC_YEAR: AcademicYearConfig = {
  id: 'ay-2026-odd',
  yearLabel: '2026 - 2027',
  semesterType: 'Odd (Autumn)',
  semesterNumber: 5,
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  timeSlots: TIME_SLOTS,
  lunchPeriodId: 'ts-5',
  publishStatus: 'Draft',
};

// ---------------------------------------------------------------------------
// 8. Academic Constraints
// ---------------------------------------------------------------------------
export const INITIAL_CONSTRAINTS: AcademicConstraint[] = [
  { id: 'const-1', code: 'NO_TEACHER_COLLISION', name: 'Faculty Double Booking Prohibition', type: 'Hard', description: 'No instructor may teach 2+ sessions concurrently.', isActive: true },
  { id: 'const-2', code: 'NO_ROOM_COLLISION', name: 'Facility Double Booking Prohibition', type: 'Hard', description: 'No classroom or lab may host 2+ sessions concurrently.', isActive: true },
  { id: 'const-3', code: 'NO_STUDENT_COLLISION', name: 'Cohort Collision Prohibition', type: 'Hard', description: 'No student section or subgroup may be assigned overlapping classes.', isActive: true },
  { id: 'const-4', code: 'CAPACITY_COMPLIANCE', name: 'Seating Capacity Enforcement', type: 'Hard', description: 'Room capacity must meet or exceed cohort size.', isActive: true },
  { id: 'const-5', code: 'LUNCH_PROTECTION', name: 'Protected Campus Lunch Hour', type: 'Hard', description: '12:00-13:00 period reserved for lunch across campus.', isActive: true }
];

// Sample what-if scenario shown in the simulator (sample content; edit freely).

export const INITIAL_WHAT_IF_SIMULATION: WhatIfSimulation = {
  id: 'sim-baseline',
  title: 'Baseline Operational Model',
  scenarioType: 'FacultyOnLeave',
  parameters: {},
  impact: {
    affectedClassesCount: 0,
    requiredRoomChanges: 0,
    newHardConflicts: 0,
    stabilityScore: 100,
    projectedHealthScore: 100,
    affectedFacultyNames: [],
    affectedSectionNames: []
  },
  suggestedActions: []
};
